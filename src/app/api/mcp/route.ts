/**
 * /api/mcp — Remote MCP endpoint (Streamable HTTP, stateless).
 * ---------------------------------------------------------------------------
 * "TrustLeaf Verify" packaged as a Model Context Protocol server so any team at
 * the hackathon can connect in a SINGLE line: point an MCP client at this URL.
 *
 *   { "mcpServers": { "trustleaf-verify": { "url": "https://<host>/api/mcp" } } }
 *
 * We speak MCP over JSON-RPC 2.0 directly (no SDK) to keep the dependency
 * surface zero and match the plain route-handler style used elsewhere in this
 * repo. Stateless: each POST carries one JSON-RPC message and we answer with a
 * single application/json response (allowed by the Streamable HTTP spec — no
 * SSE/session bookkeeping needed for simple tool calls).
 *
 * Tools in this MVP are SAFE — no signing secrets, no real on-chain writes:
 *   · explain_architecture  — pure docs, so a dev's agent understands the model
 *   · create_approval       — SIMULATED: returns an id + approval_url + mode
 *   · verify_approval       — SIMULATED: returns a fake-but-shaped verdict
 * The real signature + Stellar anchoring flow lands behind these same shapes
 * later, gated by a per-team API key. Shapes stay stable so integrations don't
 * break when we flip create/verify from simulated → onchain.
 */
import { NextResponse } from "next/server";
import { authenticateApiKey, hasScope, type ApiContext } from "@/lib/auth/api-key";
import { isValidRut } from "@/lib/identity/rut";
import { requestConsent, checkConsent, revokeConsent } from "@/lib/identity/center-grants";

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
  const rut = String(args.patient_rut ?? "").trim();
  if (!rut) throw new ToolInputError("'patient_rut' es obligatorio.");
  if (!isValidRut(rut)) throw new ToolInputError("'patient_rut' no es un RUT válido (dígito verificador).");
  return rut;
}

/** Guarantee the auth context is present (only reachable on requiresAuth tools). */
function requireCtx(ctx?: ApiContext): ApiContext {
  if (!ctx) throw new Error("contexto de autenticación ausente");
  return ctx;
}

/** Max JSON-RPC messages per batch — caps the 1-request→N-query amplification. */
const MAX_BATCH = 50;

/** Deterministic id without Date.now()/random (keeps the endpoint pure & testable). */
function approvalId(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return "apr_" + h.toString(16).padStart(8, "0");
}

const TOOLS: Record<string, Tool> = {
  explain_architecture: {
    description:
      "Explica el modelo de TrustLeaf Verify: cómo se prueba, de forma verificable, que un humano aprobó lo que sugirió una IA (humano-en-el-loop anclado en Stellar). Útil para que el agente entienda el sistema antes de integrar.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => [
      {
        type: "text",
        text:
          "TrustLeaf Verify — aprobación humana verificable.\n\n" +
          "PROBLEMA: en salud, una IA no puede diagnosticar/prescribir sola. Cada " +
          "sugerencia necesita un humano que la apruebe, y una PRUEBA de que ese " +
          "humano existió.\n\n" +
          "CÓMO: no basta con anclar 'humano=true' (la IA podría mentir). La " +
          "aprobación la FIRMA la llave propia del médico (wallet creada desde su " +
          "email vía Privy). En la cadena quedan dos firmas distintas: el agente " +
          "que sugirió y el humano que aprobó. La IA no puede forjar la segunda.\n\n" +
          "INTEGRACIÓN (3 verbos): create_approval(sugerencia) -> { id, approval_url }; " +
          "rediriges a tu médico a approval_url para que firme; verify_approval(id) -> " +
          "{ approvedBy, at, txUrl }.\n\n" +
          "PRIVACIDAD: solo se ancla un hash. El texto clínico y la PII nunca tocan " +
          "la cadena (modelo hash-on-chain / PII-off-chain).\n\n" +
          "RED: Stellar Soroban (Testnet en la hackatón).",
      },
    ],
  },

  create_approval: {
    description:
      "Crea una solicitud de aprobación humana para una sugerencia de tu IA. Devuelve un id y una approval_url a la que rediriges a tu médico para que la firme. Requiere API key. (MVP: modo simulado — no ancla on-chain todavía.)",
    requiresAuth: true,
    scope: "approval:create",
    inputSchema: {
      type: "object",
      properties: {
        suggestion: { type: "string", description: "Lo que tu IA sugiere y un humano debe aprobar." },
        context: { type: "string", description: "Contexto opcional (p. ej. score de riesgo)." },
      },
      required: ["suggestion"],
      additionalProperties: false,
    },
    handler: (args, ctx) => {
      const suggestion = String(args.suggestion ?? "").trim();
      if (!suggestion) {
        throw new ToolInputError("'suggestion' es obligatorio.");
      }
      const id = approvalId(suggestion + "|" + String(args.context ?? ""));
      const payload = {
        id,
        approval_url: `/approve/${id}`,
        status: "pending",
        env: ctx?.env ?? "sandbox",
        org: ctx?.orgName,
        mode: "simulated",
        note: "MVP simulado — la firma del médico y el anclaje en Stellar se conectan detrás de esta misma forma.",
      };
      return [{ type: "text", text: JSON.stringify(payload, null, 2) }];
    },
  },

  verify_approval: {
    description:
      "Consulta el estado de una aprobación por id: quién la aprobó, cuándo y el link verificable en Stellar. Requiere API key. (MVP: modo simulado.)",
    requiresAuth: true,
    scope: "approval:read",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "El id devuelto por create_approval." } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: (args, ctx) => {
      const id = String(args.id ?? "").trim();
      if (!id) throw new ToolInputError("'id' es obligatorio.");
      const payload = {
        id,
        status: "approved",
        approvedBy: "dr.demo@trustleaf.health",
        at: "14:32",
        env: ctx?.env ?? "sandbox",
        txUrl: "https://stellar.expert/explorer/testnet/tx/…",
        mode: "simulated",
        note: "MVP simulado — con la firma real del médico esto devuelve la tx anclada.",
      };
      return [{ type: "text", text: JSON.stringify(payload, null, 2) }];
    },
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
      const res = await requestConsent({
        orgId: c.orgId,
        granteeWallet: c.signingWallet,
        rut,
        env: c.env,
      });
      return [{ type: "text", text: JSON.stringify({ ...res, env: c.env, org: c.orgName }, null, 2) }];
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
      return [{ type: "text", text: JSON.stringify({ ...res, env: c.env }, null, 2) }];
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
      return [{ type: "text", text: JSON.stringify({ ...res, env: c.env }, null, 2) }];
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
          "TrustLeaf Verify: prueba verificable de aprobación humana para sugerencias de IA en salud. Llama explain_architecture primero para entender el modelo.",
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
      const tool = TOOLS[name];
      if (!tool) return err(id, -32602, `Tool desconocida: ${name}`);

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

// A GET is handy for humans/health checks (MCP itself only needs POST here).
export async function GET() {
  return NextResponse.json({
    server: SERVER_INFO,
    transport: "streamable-http (stateless json)",
    tools: Object.keys(TOOLS),
    howto: "Apunta tu cliente MCP a esta URL. POST JSON-RPC 2.0: initialize, tools/list, tools/call.",
  });
}
