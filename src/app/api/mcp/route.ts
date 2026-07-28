/**
 * /api/mcp — Remote MCP endpoint (Streamable HTTP, stateless).
 * ---------------------------------------------------------------------------
 * "TrustLeaf Verify" packaged as a Model Context Protocol server so any team at
 * the hackathon can connect in a SINGLE line: point an MCP client at this URL.
 *
 *   { "mcpServers": { "trustleaf": {
 *       "url": "https://<host>/api/mcp",
 *       "headers": { "Authorization": "Bearer tl_sandbox_…" } } } }
 *
 * We speak MCP over JSON-RPC 2.0 directly (no SDK) to keep the dependency
 * surface zero and match the plain route-handler style used elsewhere in this
 * repo. Stateless: each POST carries one JSON-RPC message and we answer with a
 * single application/json response (allowed by the Streamable HTTP spec — no
 * SSE/session bookkeeping needed for simple tool calls).
 *
 * Tools:
 *   · explain_architecture             — open, pure docs (no key needed)
 *   · request/check/revoke_consent     — the patient's grant to a center
 *   · anchor_record                    — REAL append_entry, gated on consent
 *   · read_records                     — the anchored history (never content)
 * Everything except explain_architecture needs a per-org API key and the
 * matching scope. `anchor_record` SIGNS a real Soroban transaction in sandbox.
 *
 * NOTE — there is deliberately no `create_approval` / `verify_approval` here.
 * They existed as simulated stubs and were removed: `verify_approval` returned
 * `status:"approved"` signed by a fictional doctor for ANY id, which in a health
 * product is not a stub but a forged clinical attestation. They come back only
 * when a real signature route exists.
 */
import { NextResponse } from "next/server";
import { authenticateApiKey, hasScope, type ApiContext } from "@/lib/auth/api-key";
import { isValidRut, hashRut } from "@/lib/identity/rut";
import { logAccess } from "@/lib/access-log";
import { requestConsent, checkConsent, revokeConsent, consentSourceFor, SignerUnavailableError } from "@/lib/identity/center-grants";
import { anchorRecord, readRecords, ConsentRequiredError, UpstreamUnavailableError } from "@/lib/identity/anchor";
import { STELLAR_EXPERT_TX } from "@/lib/stellar/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_INFO = { name: "trustleaf-verify", version: "0.1.0" };
const DEFAULT_PROTOCOL = "2025-06-18";

// ── Tool registry ───────────────────────────────────────────────────────────
// Each tool: JSON-Schema for inputs + a handler returning MCP `content`.
// `requiresAuth` tools are gated by a valid API key (see src/lib/auth/api-key);
// the resolved ApiContext is passed to the handler so it can act per-org and
// pick sandbox vs live. Open tools (discovery/docs) get ctx === undefined.
type ToolContent = { type: "text"; text: string };
interface Tool {
  description: string;
  inputSchema: Record<string, unknown>;
  requiresAuth?: boolean;
  scope?: string;
  handler: (
    args: Record<string, unknown>,
    ctx?: ApiContext,
  ) => Promise<ToolContent[]> | ToolContent[];
}

/** A bad-input error a handler can throw — its message IS safe to show the caller. */
class ToolInputError extends Error {}

/** Read a required, valid RUT from tool args or throw a caller-safe error. */
function requireRut(args: Record<string, unknown>): string {
  const rut = requireString(args, "patient_rut", 32);
  if (!isValidRut(rut)) throw new ToolInputError("'patient_rut' no es un RUT válido (dígito verificador).");
  return rut;
}

/** Guarantee the auth context is present (only reachable on requiresAuth tools). */
function requireCtx(ctx?: ApiContext): ApiContext {
  if (!ctx) throw new Error("contexto de autenticación ausente");
  return ctx;
}

/**
 * Read a required STRING arg. JSON-RPC `arguments` is attacker-controlled and we
 * never validated it against the published inputSchema — `String(x)` happily
 * turns `{a:1}` into the literal "[object Object]" and anchors ITS hash forever
 * while reporting success. Reject the wrong type instead of coercing it.
 */
function requireString(args: Record<string, unknown>, name: string, max = 20_000): string {
  const v = args[name];
  if (typeof v !== "string") {
    throw new ToolInputError(`'${name}' es obligatorio y debe ser un string.`);
  }
  const s = v.trim();
  if (!s) throw new ToolInputError(`'${name}' es obligatorio.`);
  if (s.length > max) throw new ToolInputError(`'${name}' excede el máximo de ${max} caracteres.`);
  return s;
}

/**
 * Allowed values for `kind` — the ONLY caller-supplied field that goes on-chain
 * in clear text (see stellar/server.ts, append_entry). The record contract is
 * 1:1 with a person, so free text here would let an integrator write
 * `kind: "TARV — VIH+"` into a permanent, public ledger next to that patient's
 * identity — exactly the disclosure the hash-on-chain model exists to prevent.
 * Closed list of FHIR resourceTypes: says what kind of artifact it is, never
 * what it says. FHIR names on purpose — they are the vocabulary integrators
 * already have, and `MedicationRequest` matches what the rest of this repo uses
 * (there is no `Prescription` resourceType in FHIR).
 *
 * `DocumentReference` is the escape hatch for anything unlisted. Widening this
 * list is a product decision, not a convenience: each addition is a new word
 * that becomes permanently public next to a person's identity.
 */
const ALLOWED_KINDS = [
  "MedicationRequest",   // receta
  "MedicationStatement", // lo que el paciente efectivamente toma (suplementos)
  "DiagnosticReport",    // informe de examen
  "Observation",         // medición puntual (presión, biomarcador, wearable)
  "Condition",           // antecedente / diagnóstico registrado
  "AllergyIntolerance",  // alergias
  "Immunization",        // vacunas
  "Procedure",           // procedimiento realizado
  "Encounter",           // atención / consulta
  "CarePlan",            // plan de cuidado o protocolo (longevidad)
  "DocumentReference",   // cualquier otro artefacto documental
] as const;

function requireKind(args: Record<string, unknown>): string {
  const kind = requireString(args, "kind", 64);
  if (!(ALLOWED_KINDS as readonly string[]).includes(kind)) {
    throw new ToolInputError(
      `'kind' debe ser uno de: ${ALLOWED_KINDS.join(", ")} (resourceTypes FHIR, sensibles a mayúsculas). ` +
        "Es el único campo tuyo que queda legible y permanente en la cadena, por eso " +
        "la lista es cerrada y no clínica: describe el TIPO de artefacto, nunca su contenido. " +
        "Equivalencias: Receta → MedicationRequest, Examen → DiagnosticReport, " +
        "Antecedentes → Condition. Si tu artefacto no calza en ninguno, usa DocumentReference.",
    );
  }
  return kind;
}

/** Max JSON-RPC messages per batch — caps the 1-request→N-query amplification. */
const MAX_BATCH = 50;

/** Tools that used to exist. Answering "unknown tool" would strand an integrator. */
const REMOVED_TOOLS: Record<string, string> = {
  create_approval:
    "'create_approval' fue eliminada: era un stub simulado que no persistía nada y " +
    "apuntaba a una página de firma inexistente. El flujo real es " +
    "request_consent → check_consent → anchor_record → read_records.",
  verify_approval:
    "'verify_approval' fue eliminada: devolvía 'aprobado' firmado por un médico ficticio " +
    "para cualquier id, o sea una constancia clínica falsa. Volverá cuando exista la firma " +
    "real del médico. Mientras tanto: request_consent → anchor_record → read_records.",
};

const TOOLS: Record<string, Tool> = {
  explain_architecture: {
    description:
      "Explica el modelo de TrustLeaf: cómo un centro autorizado ancla artefactos clínicos en la ficha on-chain del paciente, con el consentimiento del paciente como puerta. Llámala primero para entender el flujo antes de integrar.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => [
      {
        type: "text",
        text:
          "TrustLeaf — ficha clínica del paciente, anclada en Stellar.\n\n" +
          "MODELO: 1 paciente = 1 ficha propia (un contrato ClinicalRecord por " +
          "persona, identificada por el hash de su RUT). 1 centro médico = N " +
          "fichas, y solo aquellas cuyo paciente le dio consentimiento. El " +
          "paciente es el dueño: da y quita el acceso.\n\n" +
          "FLUJO (4 verbos, en este orden):\n" +
          "  1. request_consent(patient_rut)   -> pide acceso de escritura. En " +
          "sandbox se auto-aprueba para que puedas demostrar el flujo (viene " +
          "marcado consentSource:'auto_sandbox'); en live queda 'pending' hasta " +
          "que el paciente firme.\n" +
          "  2. check_consent(patient_rut)     -> confirma que está vigente.\n" +
          "  3. anchor_record(patient_rut, kind, content) -> ancla el artefacto. " +
          "Devuelve { mode, txHash, txUrl, contentHash }.\n" +
          "  4. read_records(patient_rut)      -> el historial anclado.\n" +
          "revoke_consent(patient_rut) corta el acceso.\n\n" +
          "PRIVACIDAD: 'content' se hashea (SHA-256) y NUNCA se guarda ni se " +
          "publica — ni en la cadena ni en nuestra base. El RUT tampoco: se " +
          "convierte en un HMAC con pepper del servidor. Lo único legible " +
          "on-chain es 'kind', y por eso es una lista cerrada de tipos de " +
          "artefacto (nunca diagnósticos).\n\n" +
          "MODES: onchain = tx confirmada; pending = enviada, sin confirmar aún " +
          "(el txHash ya sirve); simulated = NO se ancló nada — mira el campo " +
          "'reason' para saber por qué.\n\n" +
          "RED: Stellar Soroban (Testnet en la hackatón).",
      },
    ],
  },

  request_consent: {
    description:
      "Solicita el consentimiento de un paciente (por RUT) para que tu centro pueda escribir su ficha. En sandbox se auto-aprueba (simulado) para poder demostrar el flujo end-to-end; en live queda 'pending' hasta que el paciente firme. Requiere API key.",
    requiresAuth: true,
    scope: "consent:manage",
    inputSchema: {
      type: "object",
      properties: {
        patient_rut: { type: "string", description: "RUT del paciente (ej. 12.345.678-5)." },
      },
      required: ["patient_rut"],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const c = requireCtx(ctx);
      const rut = requireRut(args);
      let res;
      try {
        res = await requestConsent({
          orgId: c.orgId,
          granteeWallet: c.signingWallet,
          rut,
          env: c.env,
        });
      } catch (e) {
        // Caller-safe by construction — forward instead of the opaque 500.
        if (e instanceof SignerUnavailableError) throw new ToolInputError(e.message);
        throw e;
      }
      const txUrl = res.grantTx ? STELLAR_EXPERT_TX(res.grantTx) : null;
      return [{ type: "text", text: JSON.stringify({ ...res, txUrl, env: c.env, org: c.orgName }, null, 2) }];
    },
  },

  check_consent: {
    description:
      "Consulta si tu centro tiene consentimiento vigente para escribir la ficha de un paciente (por RUT). Requiere API key.",
    requiresAuth: true,
    scope: "consent:read",
    inputSchema: {
      type: "object",
      properties: {
        patient_rut: { type: "string", description: "RUT del paciente." },
      },
      required: ["patient_rut"],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const c = requireCtx(ctx);
      const rut = requireRut(args);
      const res = await checkConsent({ orgId: c.orgId, rut, env: c.env });
      const txUrl = res.grantTx ? STELLAR_EXPERT_TX(res.grantTx) : null;
      return [{ type: "text", text: JSON.stringify({ ...res, txUrl, env: c.env }, null, 2) }];
    },
  },

  revoke_consent: {
    description:
      "Revoca el consentimiento vigente de tu centro sobre un paciente (por RUT). Requiere API key.",
    requiresAuth: true,
    scope: "consent:manage",
    inputSchema: {
      type: "object",
      properties: {
        patient_rut: { type: "string", description: "RUT del paciente." },
      },
      required: ["patient_rut"],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const c = requireCtx(ctx);
      const rut = requireRut(args);
      const res = await revokeConsent({ orgId: c.orgId, rut, env: c.env });
      return [
        {
          type: "text",
          text: JSON.stringify(
            { ...res, env: c.env, consentSource: consentSourceFor(c.env) },
            null,
            2,
          ),
        },
      ];
    },
  },

  anchor_record: {
    description:
      "Ancla el hash de un artefacto clínico (receta, examen, antecedente…) en la ficha del paciente. Requiere consentimiento vigente del paciente (request_consent). Solo el hash va on-chain; el contenido queda off-chain. Requiere API key.",
    requiresAuth: true,
    scope: "ficha:append",
    inputSchema: {
      type: "object",
      properties: {
        patient_rut: { type: "string", description: "RUT del paciente." },
        kind: {
          type: "string",
          enum: [...ALLOWED_KINDS],
          description:
            "Tipo de artefacto. Lista cerrada: es el único campo que viaja legible on-chain, así que describe el tipo, nunca el contenido clínico.",
        },
        content: {
          type: "string",
          maxLength: 1_000_000,
          description:
            "Contenido clínico, como string (serializa tu JSON/FHIR antes de enviarlo). Se hashea (SHA-256); ni se guarda ni se publica.",
        },
      },
      required: ["patient_rut", "kind", "content"],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const c = requireCtx(ctx);
      const rut = requireRut(args);
      const kind = requireKind(args);
      // 1 MB matches the schema's maxLength. Generous on purpose: content is only
      // ever hashed, so the cap is anti-abuse, not a data-model constraint.
      const content = requireString(args, "content", 1_000_000);
      try {
        const res = await anchorRecord({
          orgId: c.orgId,
          granteeWallet: c.signingWallet,
          rut,
          env: c.env,
          kind,
          content,
        });
        const txUrl = res.txHash ? STELLAR_EXPERT_TX(res.txHash) : null;
        logAccess({
          patientRutHash: hashRut(rut),
          accessor: c.orgName,
          accessorRole: "center",
          action: "mcp.anchor_record",
          detail: `${kind} · ${res.mode} · ${c.env}`,
        });
        // consentSource travels here too — this is the response that carries a
        // REAL txUrl, so it is the easiest one to mistake for a consent a human
        // actually gave.
        return [
          {
            type: "text",
            text: JSON.stringify(
              { ...res, txUrl, env: c.env, consentSource: consentSourceFor(c.env) },
              null,
              2,
            ),
          },
        ];
      } catch (e) {
        // Consent-required is a caller-safe message → surface it as isError.
        // Both carry caller-safe, actionable messages → surface them verbatim
        // instead of flattening to "error interno".
        if (e instanceof ConsentRequiredError) throw new ToolInputError(e.message);
        if (e instanceof UpstreamUnavailableError) throw new ToolInputError(e.message);
        throw e;
      }
    },
  },

  read_records: {
    description:
      "Lee las entradas ancladas de la ficha de un paciente (kind + hash + autor + timestamp; nunca el contenido clínico). Requiere consentimiento vigente. Requiere API key.",
    requiresAuth: true,
    scope: "ficha:read",
    inputSchema: {
      type: "object",
      properties: {
        patient_rut: { type: "string", description: "RUT del paciente." },
      },
      required: ["patient_rut"],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const c = requireCtx(ctx);
      const rut = requireRut(args);
      try {
        const res = await readRecords({ orgId: c.orgId, rut, env: c.env });
        // Ley 20.584 — an external center reading the ficha leaves a trace,
        // keyed by rut_hash (the MCP never handles the patient's email).
        logAccess({
          patientRutHash: hashRut(rut),
          accessor: c.orgName,
          accessorRole: "center",
          action: "mcp.read_records",
          detail: `${res.entries.length} entradas · ${c.env}`,
        });
        return [
          {
            type: "text",
            text: JSON.stringify(
              { ...res, count: res.entries.length, env: c.env, consentSource: consentSourceFor(c.env) },
              null,
              2,
            ),
          },
        ];
      } catch (e) {
        // Both carry caller-safe, actionable messages → surface them verbatim
        // instead of flattening to "error interno".
        if (e instanceof ConsentRequiredError) throw new ToolInputError(e.message);
        if (e instanceof UpstreamUnavailableError) throw new ToolInputError(e.message);
        throw e;
      }
    },
  },
};

// ── JSON-RPC plumbing ───────────────────────────────────────────────────────
type JsonRpcId = string | number | null;
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

function ok(id: JsonRpcId, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}
function err(id: JsonRpcId, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

/** JSON-RPC error code for authentication/authorization failures (server-defined). */
const AUTH_ERROR = -32001;

async function handleRpc(
  msg: JsonRpcRequest,
  request: Request,
): Promise<Response | null> {
  // JSON-RPC: a message with no `id` is a notification — never answer it.
  if (!("id" in msg)) return null;
  const id = msg.id ?? null;

  switch (msg.method) {
    case "initialize": {
      const requested = (msg.params?.protocolVersion as string) || DEFAULT_PROTOCOL;
      return ok(id, {
        protocolVersion: requested,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          "TrustLeaf: ancla artefactos clínicos en la ficha on-chain del paciente, " +
          "con su consentimiento como puerta. Llama explain_architecture primero " +
          "(no necesita API key). El resto de las tools requieren la cabecera " +
          "Authorization: Bearer tl_sandbox_… y siguen el orden " +
          "request_consent → check_consent → anchor_record → read_records.",
      });
    }

    // Notifications carry no id → no response body.
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, {
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const name = msg.params?.name as string;
      const tool = Object.prototype.hasOwnProperty.call(TOOLS, name) ? TOOLS[name] : undefined;
      if (!tool) {
        // A tombstone beats a bare "unknown tool": an agent that read the old
        // docs otherwise has no way to find out what replaced them.
        if (name in REMOVED_TOOLS) return err(id, -32602, REMOVED_TOOLS[name]);
        return err(id, -32602, `Tool desconocida: ${name}`);
      }

      // Auth gate: open tools (discovery/docs) run without a key; the rest need
      // a valid API key, and its scope must cover the tool. Fail closed —
      // including when the auth backend itself errors (a DB outage must deny,
      // not 500 the whole request/batch).
      let ctx: ApiContext | undefined;
      if (tool.requiresAuth) {
        let auth: Awaited<ReturnType<typeof authenticateApiKey>>;
        try {
          auth = await authenticateApiKey(request);
        } catch (e) {
          console.error("[mcp] auth backend error:", e);
          return err(id, AUTH_ERROR, "Servicio de autenticación no disponible.");
        }
        if (!auth.ok) {
          return err(id, AUTH_ERROR, `No autorizado (${auth.code}): ${auth.message}`);
        }
        // A protected tool MUST declare a scope, and the key MUST hold it.
        // Missing scope → deny (never authorize any key by omission).
        if (!tool.scope || !hasScope(auth.ctx, tool.scope)) {
          return err(
            id,
            AUTH_ERROR,
            `La API key no tiene el scope requerido${tool.scope ? `: ${tool.scope}` : ""}.`,
          );
        }
        ctx = auth.ctx;
      }

      try {
        const content = await tool.handler(
          (msg.params?.arguments as Record<string, unknown>) ?? {},
          ctx,
        );
        return ok(id, { content, isError: false });
      } catch (e) {
        // Input errors carry a caller-safe message; anything else is opaque so a
        // stray exception (DB host, SQL, stack) never leaks to an integrator.
        if (e instanceof ToolInputError) {
          return ok(id, { content: [{ type: "text", text: e.message }], isError: true });
        }
        console.error(`[mcp] tool ${name} error:`, e);
        return ok(id, {
          content: [{ type: "text", text: "Error interno procesando la solicitud." }],
          isError: true,
        });
      }
    }

    default:
      return err(id, -32601, `Método no soportado: ${msg.method}`);
  }
}

/** A well-formed JSON-RPC message: an object with a string `method`. */
function isRpcObject(m: unknown): m is JsonRpcRequest {
  return typeof m === "object" && m !== null && typeof (m as { method?: unknown }).method === "string";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(null, -32700, "Parse error");
  }

  // Batch.
  if (Array.isArray(body)) {
    if (body.length === 0) return err(null, -32600, "Invalid Request: batch vacío");
    if (body.length > MAX_BATCH) {
      return err(null, -32600, `Batch demasiado grande (máx ${MAX_BATCH})`);
    }
    const responses = await Promise.all(
      body.map((m) =>
        isRpcObject(m) ? handleRpc(m, request) : err(null, -32600, "Invalid Request"),
      ),
    );
    const payloads = await Promise.all(
      responses.filter((r): r is Response => r !== null).map((r) => r.json()),
    );
    // A batch of only notifications yields no responses → 202 with no body.
    if (payloads.length === 0) return new NextResponse(null, { status: 202 });
    return NextResponse.json(payloads);
  }

  // Single.
  if (!isRpcObject(body)) return err(null, -32600, "Invalid Request");
  const res = await handleRpc(body, request);
  // Pure notification → 202 with no body.
  return res ?? new NextResponse(null, { status: 202 });
}

// Streamable HTTP spec: a server that does not offer an SSE stream MUST answer
// GET with 405 Method Not Allowed. This used to return 200 application/json
// (a friendly health page), and the official MCP SDK — which opens a GET on
// every connection to probe for the stream — choked on the handshake: curl
// worked, Claude Desktop did not. The human-friendly info lives on in the 405
// body, which the spec allows and the SDK ignores.
const NOT_ALLOWED = {
  error: "method_not_allowed",
  server: SERVER_INFO,
  transport: "streamable-http (stateless json, sin stream SSE)",
  howto: "POST JSON-RPC 2.0 a esta URL: initialize, tools/list, tools/call.",
};

export async function GET() {
  return NextResponse.json(NOT_ALLOWED, { status: 405, headers: { Allow: "POST" } });
}

// Session termination — stateless server, no session to delete. Same rule.
export async function DELETE() {
  return NextResponse.json(NOT_ALLOWED, { status: 405, headers: { Allow: "POST" } });
}
