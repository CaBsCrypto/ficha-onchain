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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_INFO = { name: "trustleaf-verify", version: "0.1.0" };
const DEFAULT_PROTOCOL = "2025-06-18";

// ── Tool registry ───────────────────────────────────────────────────────────
// Each tool: JSON-Schema for inputs + a handler returning MCP `content`.
type ToolContent = { type: "text"; text: string };
interface Tool {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolContent[]> | ToolContent[];
}

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
      "Crea una solicitud de aprobación humana para una sugerencia de tu IA. Devuelve un id y una approval_url a la que rediriges a tu médico para que la firme. (MVP: modo simulado — no ancla on-chain todavía.)",
    inputSchema: {
      type: "object",
      properties: {
        suggestion: { type: "string", description: "Lo que tu IA sugiere y un humano debe aprobar." },
        context: { type: "string", description: "Contexto opcional (p. ej. score de riesgo)." },
      },
      required: ["suggestion"],
      additionalProperties: false,
    },
    handler: (args) => {
      const suggestion = String(args.suggestion ?? "").trim();
      if (!suggestion) {
        return [{ type: "text", text: "Error: 'suggestion' es obligatorio." }];
      }
      const id = approvalId(suggestion + "|" + String(args.context ?? ""));
      const payload = {
        id,
        approval_url: `/approve/${id}`,
        status: "pending",
        mode: "simulated",
        note: "MVP simulado — la firma del médico y el anclaje en Stellar se conectan detrás de esta misma forma con API key.",
      };
      return [{ type: "text", text: JSON.stringify(payload, null, 2) }];
    },
  },

  verify_approval: {
    description:
      "Consulta el estado de una aprobación por id: quién la aprobó, cuándo y el link verificable en Stellar. (MVP: modo simulado.)",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "El id devuelto por create_approval." } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: (args) => {
      const id = String(args.id ?? "").trim();
      if (!id) return [{ type: "text", text: "Error: 'id' es obligatorio." }];
      const payload = {
        id,
        status: "approved",
        approvedBy: "dr.demo@trustleaf.health",
        at: "14:32",
        txUrl: "https://stellar.expert/explorer/testnet/tx/…",
        mode: "simulated",
        note: "MVP simulado — con API key esto devuelve la firma real del médico y la tx anclada.",
      };
      return [{ type: "text", text: JSON.stringify(payload, null, 2) }];
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

async function handleRpc(msg: JsonRpcRequest): Promise<Response | null> {
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
      try {
        const content = await tool.handler((msg.params?.arguments as Record<string, unknown>) ?? {});
        return ok(id, { content, isError: false });
      } catch (e) {
        return ok(id, {
          content: [{ type: "text", text: `Error ejecutando ${name}: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        });
      }
    }

    default:
      return err(id, -32601, `Método no soportado: ${msg.method}`);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(null, -32700, "Parse error");
  }

  // Batch or single.
  if (Array.isArray(body)) {
    const responses = await Promise.all((body as JsonRpcRequest[]).map(handleRpc));
    const payloads = await Promise.all(
      responses.filter((r): r is Response => r !== null).map((r) => r.json()),
    );
    return NextResponse.json(payloads);
  }

  const res = await handleRpc(body as JsonRpcRequest);
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
