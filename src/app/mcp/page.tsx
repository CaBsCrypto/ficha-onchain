"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { buttonVariants } from "@/components/ui/Button";

/**
 * /mcp — standalone bilingual product page for the "TrustLeaf Verify" MCP,
 * aimed at developers integrating it (e.g. teams at the Claude Impact Lab ·
 * Longevidad hackathon, Aug 5–6 2026). This is NOT the site's main landing (/);
 * it's the dedicated MCP surface, deployed alongside it.
 *
 * Self-contained on purpose: it does NOT use the site-wide i18n dictionary or
 * the main landing components, so it can evolve independently and be shared as
 * its own Vercel preview URL. Language is a LOCAL ES/EN toggle (default ES —
 * the audience is Chilean) via the `tr()` helper.
 */

const PRODUCT = "TrustLeaf Verify";
const EXPERT = "https://stellar.expert/explorer/testnet/tx/";

// Real anchored transactions from the end-to-end demo (docs/D3_EVIDENCE.md).
const PROOFS = [
  { tx: "4cf9e91b577cd5886d4a26e606cb534c255ecdd1e669cb0bece1ab867e3e1fb9", es: "Consentimiento del paciente", en: "Patient consent", call: "grant_write_access" },
  { tx: "793f21cd2f68b7b8f253b17524776eae35a28245bb7f2f978501bdd8696585f1", es: "Entrada a la ficha", en: "Clinical entry", call: "append_entry" },
  { tx: "c832af93fe6e8b79709a2d22f9d692202c4e033bdb4fa05cae0a97b102fb48f2", es: "Receta (Decreto 41)", en: "Prescription (Decreto 41)", call: "mint_prescription" },
] as const;

const EASE = [0.22, 1, 0.36, 1] as const;

/** Scroll-reveal wrapper — matches the motion language of the main landing. */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export default function HackathonPage() {
  const [lang, setLang] = useState<"es" | "en">("es");
  const tr = (es: string, en: string) => (lang === "es" ? es : en);

  // ── "Probalo ahora": tools/list en vivo contra el propio /api/mcp ──────────
  type LiveTool = { name: string; description: string };
  const [live, setLive] = useState<{ state: "idle" | "loading" | "ok" | "error"; tools: LiveTool[]; error?: string }>({
    state: "idle",
    tools: [],
  });
  const runLiveDemo = async () => {
    setLive({ state: "loading", tools: [] });
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const json = await res.json();
      const tools = (json?.result?.tools ?? []) as LiveTool[];
      if (!tools.length) throw new Error("respuesta sin tools");
      setLive({ state: "ok", tools });
    } catch (e) {
      setLive({ state: "error", tools: [], error: e instanceof Error ? e.message : String(e) });
    }
  };

  const [copied, setCopied] = useState(false);
  const MCP_URL = "https://trustleaf-demo.vercel.app/api/mcp";
  const MCP_CONFIG = `{ "mcpServers": { "trustleaf-verify": { "url": "${MCP_URL}" } } }`;
  const copyConfig = async () => {
    // Primary: async Clipboard API (HTTPS). Fallback: legacy execCommand for
    // contexts where the Clipboard API is blocked (e.g. sandboxed iframes).
    try {
      await navigator.clipboard.writeText(MCP_CONFIG);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = MCP_CONFIG;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        /* sin clipboard — igual damos feedback visual abajo */
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const NAV = [
    { href: "#conectar", label: tr("Conectar", "Connect") },
    { href: "#probalo", label: tr("Probalo", "Try it") },
    { href: "#problema", label: tr("El problema", "The problem") },
    { href: "#que", label: tr("Qué podrás hacer", "What you can do") },
    { href: "#lineas", label: tr("Por línea", "By track") },
    { href: "#como", label: tr("Cómo funciona", "How it works") },
    { href: "#prueba", label: tr("Prueba", "Proof") },
    { href: "#faq", label: "FAQ" },
  ];

  return (
    <main className="min-h-screen bg-canvas text-ink">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-canvas/80 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <a href="#top" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-clinical text-sm text-white">◆</span>
            <span className="hidden sm:inline">{PRODUCT}</span>
          </a>
          <div className="hidden items-center gap-6 text-sm text-muted lg:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition-colors hover:text-ink">
                {n.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-full border border-slate-200 bg-white/60 p-0.5 text-xs font-medium">
              {(["es", "en"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setLang(opt)}
                  aria-pressed={lang === opt}
                  className={`rounded-full px-2.5 py-1 uppercase transition-colors ${
                    lang === opt ? "bg-clinical text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section id="top" className="bg-grid relative overflow-hidden">
        <div className="bg-spotlight pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-5xl px-6 pt-16 pb-16 sm:pt-24 sm:pb-24">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-clinical/20 bg-clinical-50 px-3 py-1 text-xs font-medium text-clinical-600"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-clinical" />
            {tr("API para desarrolladores", "Developer API")} · Claude Impact Lab · Longevidad
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.05 }}
            className="mt-6 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl"
          >
            {tr("La prueba de que tu IA ", "Proof that your AI ")}
            <span className="text-clinical">{tr("no decidió sola", "didn’t decide alone")}</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.12 }}
            className="mt-6 max-w-2xl text-lg leading-relaxed text-muted"
          >
            {tr(
              "Eres dev en la hackatón y tu app de salud necesita un humano que apruebe lo que sugiere la IA. En vez de construir wallets, firmas y anclaje on-chain, haces una llamada a nuestra API. Integración en una tarde.",
              "You’re a dev at the hackathon and your health app needs a human to approve what the AI suggests. Instead of building wallets, signatures and on-chain anchoring, you call our API. Integrate in an afternoon.",
            )}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.2 }}
            className="mt-8 flex flex-wrap gap-3"
          >
            <a href="#como" className={buttonVariants({ variant: "primary", size: "lg" })}>
              {tr("Ver cómo funciona", "See how it works")}
            </a>
            <a href="#integrar" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              {tr("Integrar en 10 líneas", "Integrate in 10 lines")}
            </a>
          </motion.div>

          {/* trust strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-mint" />
              {tr("On-chain en producción", "On-chain in production")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-mint" />
              Stellar Soroban · Testnet
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-mint" />
              {tr("Compatible con MCP", "MCP-compatible")}
            </span>
          </motion.div>
        </div>
      </section>

      {/* ── Conecta en una línea ───────────────────────────── */}
      <section id="conectar" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-12 sm:py-14">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-mint">
                {tr("Conecta en una línea", "Connect in one line")}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-balance">
                {tr("Pega esto en tu cliente MCP y listo", "Paste this in your MCP client and you’re done")}
              </h2>
            </div>
            <button
              onClick={copyConfig}
              className="w-fit shrink-0 rounded-full bg-clinical px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-clinical/25 transition-all hover:bg-clinical-600 hover:-translate-y-0.5"
            >
              {copied ? tr("✓ Copiado", "✓ Copied") : tr("Copiar configuración", "Copy config")}
            </button>
          </div>

          <pre className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-ink p-5 text-sm leading-relaxed">
            <code className="font-mono text-slate-200">{`{
  "mcpServers": {
    "trustleaf-verify": {
      "url": "${MCP_URL}"
    }
  }
}`}</code>
          </pre>

          <p className="mt-3 text-xs text-muted">
            {tr(
              "Compatible con clientes MCP (Claude, Cursor, tu propio agente). También expone REST si prefieres.",
              "Works with MCP clients (Claude, Cursor, your own agent). Also exposes REST if you prefer.",
            )}
          </p>
        </div>
      </section>

      {/* ── Probalo ahora (tools/list en vivo) ─────────────── */}
      <section id="probalo" className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-wide text-mint">
            {tr("Probalo ahora", "Try it now")}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-balance sm:text-4xl">
            {tr("No es humo: pídele las tools al servidor en vivo", "Not vaporware: ask the server for its tools, live")}
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            {tr(
              "Esto hace un tools/list real contra /api/mcp desde tu navegador. Lo mismo que haría tu cliente MCP al conectarse.",
              "This runs a real tools/list against /api/mcp from your browser. Exactly what your MCP client does on connect.",
            )}
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <code className="font-mono text-xs text-muted">POST /api/mcp · tools/list</code>
              <button
                onClick={runLiveDemo}
                disabled={live.state === "loading"}
                className="rounded-full bg-clinical px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-clinical/25 transition-all hover:bg-clinical-600 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {live.state === "loading" ? tr("Consultando…", "Querying…") : tr("Ejecutar", "Run")}
              </button>
            </div>

            {live.state === "idle" && (
              <p className="mt-5 text-sm text-muted">
                {tr("Pulsa Ejecutar para ver las tools que expone el servidor.", "Hit Run to see the tools the server exposes.")}
              </p>
            )}

            {live.state === "error" && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {tr("No se pudo consultar el endpoint", "Couldn’t reach the endpoint")}: {live.error}
              </div>
            )}

            {live.state === "ok" && (
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-mint">
                  <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                  {tr(`El servidor respondió con ${live.tools.length} tools`, `Server responded with ${live.tools.length} tools`)}
                </div>
                {live.tools.map((t) => (
                  <div key={t.name} className="rounded-xl border border-slate-200 bg-canvas p-4">
                    <code className="font-mono text-sm font-semibold text-clinical">{t.name}</code>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{t.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Reveal>
      </section>

      {/* ── El problema del reglamento ─────────────────────── */}
      <section id="problema" className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-wide text-clinical">
            {tr("Dos reglas que todo equipo tiene que cumplir", "Two rules every team must meet")}
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-bold text-balance sm:text-4xl">
            {tr(
              "El reglamento te obliga a resolver dos cosas aburridas. Nosotros ya las resolvimos.",
              "The rules force you to solve two boring things. We already solved them.",
            )}
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {[
            {
              icon: "🚫🧠",
              t: tr("La IA no puede diagnosticar ni prescribir sola", "AI can’t diagnose or prescribe alone"),
              d: tr(
                "Cada sugerencia de tu IA necesita un humano en el loop — y una prueba de que ese humano existió. El jurado lo va a preguntar.",
                "Every AI suggestion needs a human in the loop — and proof that human existed. The judges will ask.",
              ),
            },
            {
              icon: "🔐📄",
              t: tr("Sin datos personales (PII)", "No personal data (PII)"),
              d: tr(
                "Solo puedes anclar hashes, no datos clínicos. El modelo hash-on-chain / PII-off-chain de TrustLeaf nació para esto.",
                "You can only anchor hashes, not clinical data. TrustLeaf’s hash-on-chain / PII-off-chain model was built for this.",
              ),
            },
          ].map((f, i) => (
            <Reveal key={f.icon} delay={i * 0.08}>
              <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 text-lg font-semibold">{f.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Qué podrás hacer (3 verbos) ────────────────────── */}
      <section id="que" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-mint">
              {tr("Qué vas a poder hacer", "What you’ll be able to do")}
            </p>
            <h2 className="mt-3 text-3xl font-bold text-balance sm:text-4xl">
              {tr("Tres verbos que tu app enchufa hoy", "Three verbs your app plugs in today")}
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: "📝",
                verb: "create_approval",
                t: tr("Pedir una aprobación", "Request an approval"),
                d: tr(
                  "Tu IA sugiere algo. Nos mandas el texto y te devolvemos un link para que tu médico lo apruebe.",
                  "Your AI suggests something. Send us the text and we return a link for your doctor to approve.",
                ),
              },
              {
                icon: "✍️",
                verb: tr("aprobar (redirect)", "approve (redirect)"),
                t: tr("El humano firma", "The human signs"),
                d: tr(
                  "Rediriges a tu médico a nuestra página. Entra con su email y aprueba con su propia llave. La IA no puede falsificarlo.",
                  "Redirect your doctor to our page. They log in with email and approve with their own key. AI can’t forge it.",
                ),
              },
              {
                icon: "🔗",
                verb: "verify",
                t: tr("Mostrar la prueba", "Show the proof"),
                d: tr(
                  "Consultas el resultado: quién aprobó, cuándo, y un link verificable en Stellar. Listo para tu pitch.",
                  "Query the result: who approved, when, and a verifiable Stellar link. Ready for your pitch.",
                ),
              },
            ].map((f, i) => (
              <Reveal key={f.t} delay={i * 0.08}>
                <div className="h-full rounded-2xl border border-slate-200 bg-canvas p-6">
                  <div className="text-2xl">{f.icon}</div>
                  <code className="mt-3 inline-block rounded bg-mint-50 px-2 py-0.5 font-mono text-xs text-mint">
                    {f.verb}
                  </code>
                  <h3 className="mt-2 text-lg font-semibold">{f.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Ejemplos por línea del hackatón ────────────────── */}
      <section id="lineas" className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-wide text-clinical">
            {tr("Sirve a las 3 líneas", "Serves all 3 tracks")}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-balance sm:text-4xl">
            {tr("Un ejemplo real por cada línea", "One real example per track")}
          </h2>
        </Reveal>

        <div className="mt-10 space-y-4">
          {[
            {
              tag: tr("Prevención", "Prevention"),
              t: tr("Screening de riesgo cardiovascular", "Cardiovascular risk screening"),
              d: tr(
                "La IA marca a un paciente como “alto riesgo”. El médico del CESFAM lo confirma con un clic → queda la prueba de que un profesional validó la alerta.",
                "The AI flags a patient as “high risk”. The clinic doctor confirms with one click → proof a professional validated the alert.",
              ),
            },
            {
              tag: tr("Descompresión", "Decompression"),
              t: tr("Triaje de lista de espera", "Wait-list triage"),
              d: tr(
                "La IA prioriza la cola por riesgo. Cada cambio de prioridad lleva la firma del médico que lo aprobó — auditable ante el jurado y ante el sistema de salud.",
                "The AI prioritizes the queue by risk. Each priority change carries the approving doctor’s signature — auditable for judges and the health system.",
              ),
            },
            {
              tag: tr("Continuidad", "Continuity"),
              t: tr("Monitoreo post-operatorio", "Post-op monitoring"),
              d: tr(
                "La IA sugiere ajustar el seguimiento de un adulto mayor. El médico tratante lo aprueba, y el dato viaja verificable entre el hospital y la app.",
                "The AI suggests adjusting an elder’s follow-up. The treating doctor approves it, and the data travels verifiably between hospital and app.",
              ),
            },
          ].map((l, i) => (
            <Reveal key={l.tag} delay={i * 0.06}>
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
                <span className="w-fit shrink-0 rounded-full bg-clinical-50 px-3 py-1 text-xs font-semibold text-clinical-600 sm:w-32">
                  {l.tag}
                </span>
                <div>
                  <h3 className="font-semibold">{l.t}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{l.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Cómo funciona — diagrama de 3 carriles ─────────── */}
      <section id="como" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-clinical">
              {tr("El flujo, de punta a punta", "The flow, end to end")}
            </p>
            <h2 className="mt-3 text-3xl font-bold text-balance sm:text-4xl">
              {tr("Tú alojas la firma. Ellos solo redirigen.", "You host the signing. They just redirect.")}
            </h2>
            <p className="mt-4 max-w-2xl text-muted">
              {tr(
                "Es el mismo patrón que “Pagar con Stripe” o “Entrar con Google”: la parte sensible pasa en nuestro dominio, no en el tuyo.",
                "Same pattern as “Pay with Stripe” or “Sign in with Google”: the sensitive part happens on our domain, not yours.",
              )}
            </p>
          </Reveal>

          {/* lane headers */}
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { h: tr("🧩 Tú (tu app)", "🧩 You (your app)"), s: tr("tu app + tu IA", "your app + AI"), c: "clinical" },
              { h: tr("👩‍⚕️ Tu médico", "👩‍⚕️ Your doctor"), s: tr("el humano que aprueba", "the human who approves"), c: "mint" },
              { h: "🌿 TrustLeaf", s: tr("la API que integras", "the API you integrate"), c: "ink" },
            ].map((x) => (
              <div
                key={x.h}
                className={`rounded-xl px-4 py-3 text-center ${
                  x.c === "clinical" ? "bg-clinical-50 text-clinical-600" : x.c === "mint" ? "bg-mint-50 text-mint" : "bg-slate-100 text-ink"
                }`}
              >
                <div className="text-sm font-bold">{x.h}</div>
                <div className="text-xs opacity-80">{x.s}</div>
              </div>
            ))}
          </div>

          {/* steps */}
          <ol className="mt-4 space-y-3">
            {[
              { n: "1", who: "clinical", t: tr("Tu IA sugiere algo", "Your AI suggests something"), d: tr("create_approval(sugerencia) → { id, approval_url }", "create_approval(suggestion) → { id, approval_url }") },
              { n: "2", who: "clinical", t: tr("Rediriges a tu médico", "You redirect your doctor"), d: tr("Mandas al humano a approval_url. Nada de wallets de tu lado.", "Send the human to approval_url. No wallets on your side.") },
              { n: "3", who: "mint", t: tr("Entra con su email", "They log in with email"), d: tr("Privy le crea su wallet sola — ni se entera.", "Privy creates their wallet automatically — they never notice.") },
              { n: "4", who: "mint", t: tr("Revisa y aprueba", "They review and approve"), d: tr("Firma con su propia llave. Prueba real de humano-en-el-loop.", "They sign with their own key. Real human-in-the-loop proof.") },
              { n: "5", who: "ink", t: tr("Verifica la firma y ancla", "Verifies the signature & anchors"), d: tr("Confirma la firma del médico y ancla la aprobación en Stellar.", "Confirms the doctor’s signature and anchors the approval on Stellar.") },
              { n: "6", who: "clinical", t: tr("Muestras la prueba", "You show the proof"), d: tr("verify(id) → resultado auditable en tu propia app.", "verify(id) → auditable result in your own app.") },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 0.05}>
                <li className="flex gap-4 rounded-2xl border border-slate-200 bg-canvas p-5">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                      s.who === "clinical" ? "bg-clinical" : s.who === "mint" ? "bg-mint" : "bg-ink"
                    }`}
                  >
                    {s.n}
                  </span>
                  <div>
                    <h3 className="font-semibold">{s.t}</h3>
                    <p className="mt-1 font-mono text-xs leading-relaxed text-muted">{s.d}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Integración (código) ───────────────────────────── */}
      <section id="integrar" className="bg-ink text-white">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-clinical">
              {tr("Tu integración completa", "Your complete integration")}
            </p>
            <h2 className="mt-3 text-3xl font-bold text-balance sm:text-4xl">
              {tr("~10 líneas. Cero blockchain de tu lado.", "~10 lines. Zero blockchain on your side.")}
            </h2>
          </Reveal>

          <Reveal delay={0.1}>
            <pre className="mt-8 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-6 text-sm leading-relaxed">
              <code className="font-mono text-slate-200">{`// ${tr("Autenticas con tu API key (una por centro)", "Authenticate with your API key (one per center)")}
const call = (name, args) => fetch("https://trustleaf-demo.vercel.app/api/mcp", {
  method: "POST",
  headers: { Authorization: "Bearer tl_sandbox_…", "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
                         params: { name, arguments: args } }),
}).then(r => r.json());

// 1 · ${tr("Pides el consentimiento del paciente (por RUT)", "Request the patient's consent (by RUT)")}
await call("request_consent", { patient_rut: "12.345.678-5" });

// 2 · ${tr("Verificas que el consentimiento está vigente", "Check the consent is active")}
const c = await call("check_consent", { patient_rut: "12.345.678-5" });
// → { status: "active", env: "sandbox", mode: "simulated" }`}</code>
            </pre>
          </Reveal>

          <Reveal delay={0.15}>
            <p className="mt-6 text-sm text-slate-400">
              {tr(
                "Se conecta como MCP (tecnología requerida del hackatón) o como REST. Te autenticas con una API key por equipo; las escrituras van a Stellar Testnet.",
                "Connect via MCP (required hackathon tech) or REST. Authenticate with a per-team API key; writes go to Stellar Testnet.",
              )}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Prueba / credibilidad ──────────────────────────── */}
      <section id="prueba" className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-wide text-mint">
            {tr("No es una maqueta", "Not a mockup")}
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-bold text-balance sm:text-4xl">
            {tr("Anclajes reales, verificables ahora mismo", "Real anchors, verifiable right now")}
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            {tr(
              "Estas transacciones salieron de un flujo médico↔paciente de punta a punta, ya en producción. Haz clic y compruébalo en Stellar Expert.",
              "These transactions came from an end-to-end doctor↔patient flow, already in production. Click and verify on Stellar Expert.",
            )}
          </p>
        </Reveal>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {PROOFS.map((p, i) => (
            <Reveal key={p.tx} delay={i * 0.08}>
              <a
                href={`${EXPERT}${p.tx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-mint/50 hover:shadow-md"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-50 px-2.5 py-0.5 text-xs font-semibold text-mint">
                  <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                  on-chain
                </span>
                <h3 className="mt-3 font-semibold">{tr(p.es, p.en)}</h3>
                <code className="mt-1 block font-mono text-xs text-muted">{p.call}</code>
                <div className="mt-3 font-mono text-xs text-clinical group-hover:underline">
                  {p.tx.slice(0, 10)}… ↗
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────── */}
      <section id="faq" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <Reveal>
            <h2 className="text-3xl font-bold text-balance sm:text-4xl">
              {tr("Preguntas que te vas a hacer", "Questions you’ll ask")}
            </h2>
          </Reveal>
          <div className="mt-8 space-y-3">
            {[
              {
                q: tr("¿Mis usuarios tienen que ser de TrustLeaf?", "Do my users have to be TrustLeaf users?"),
                a: tr(
                  "No. El médico entra con su email en nuestra página de firma; la wallet se crea sola. Nunca fue parte de TrustLeaf.",
                  "No. The doctor logs in with their email on our signing page; the wallet is created automatically. They were never a TrustLeaf user.",
                ),
              },
              {
                q: tr("¿Tengo que saber de blockchain?", "Do I need to know blockchain?"),
                a: tr(
                  "Cero. Haces una llamada, un redirect y una consulta. Toda la firma y el anclaje pasan en nuestro servidor.",
                  "Zero. You make one call, one redirect and one query. All signing and anchoring happen on our server.",
                ),
              },
              {
                q: tr("¿Por qué anclar prueba que un humano decidió?", "How does anchoring prove a human decided?"),
                a: tr(
                  "Porque la aprobación la firma la llave propia del médico, no la nuestra ni la de la IA. En la cadena quedan dos firmas distintas: el agente que sugirió y el humano que aprobó.",
                  "Because the approval is signed by the doctor’s own key — not ours, not the AI’s. On-chain there are two distinct signatures: the agent that suggested and the human that approved.",
                ),
              },
              {
                q: tr("¿Se expone algún dato del paciente?", "Is any patient data exposed?"),
                a: tr(
                  "No. Solo se ancla un hash. El texto clínico y la PII nunca tocan la cadena.",
                  "No. Only a hash is anchored. Clinical text and PII never touch the chain.",
                ),
              },
            ].map((f) => (
              <Reveal key={f.q}>
                <details className="group rounded-2xl border border-slate-200 bg-canvas p-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
                    {f.q}
                    <span className="text-clinical transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA — quickstart para el dev ───────────────────── */}
      <section className="bg-clinical-50">
        <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
          <Reveal>
            <p className="text-center text-sm font-semibold uppercase tracking-wide text-clinical">
              {tr("Empieza a integrar", "Start integrating")}
            </p>
            <h2 className="mt-3 text-center text-3xl font-bold text-balance sm:text-4xl">
              {tr("Tres pasos y tu app ya tiene la prueba", "Three steps and your app has the proof")}
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "1",
                t: tr("Pide tu API key", "Get your API key"),
                d: tr("Una key por equipo. La usas para autenticar tus llamadas.", "One key per team. Use it to authenticate your calls."),
              },
              {
                n: "2",
                t: tr("Conecta la MCP o el REST", "Connect the MCP or REST"),
                d: tr("Apunta tu cliente MCP a nuestro endpoint, o llama al REST. Sin SDK de blockchain.", "Point your MCP client at our endpoint, or call REST. No blockchain SDK."),
              },
              {
                n: "3",
                t: tr("Envía a firmar y verifica", "Send to sign and verify"),
                d: tr("create_approval → redirect → verify. Listo para tu demo.", "create_approval → redirect → verify. Ready for your demo."),
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 0.08}>
                <div className="h-full rounded-2xl border border-clinical/15 bg-white p-6 shadow-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-clinical text-sm font-bold text-white">
                    {s.n}
                  </span>
                  <h3 className="mt-3 font-semibold">{s.t}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.1}>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <a href="#integrar" className={buttonVariants({ variant: "primary", size: "lg" })}>
                {tr("Ver la integración", "See the integration")}
              </a>
              <a href="#faq" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                {tr("Leer las FAQ", "Read the FAQ")}
              </a>
            </div>
            <p className="mt-6 text-center text-sm text-muted">
              {tr(
                "¿Necesitas tu API key para la hackatón? Escríbenos en el canal del evento.",
                "Need your API key for the hackathon? Reach us in the event channel.",
              )}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-canvas">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-muted sm:flex-row">
          <span>
            <strong className="text-ink">{PRODUCT}</strong> ·{" "}
            {tr("infraestructura de aprobación humana verificable", "verifiable human-approval infrastructure")}
          </span>
          <span>Claude Impact Lab · Longevidad 2026</span>
        </div>
      </footer>
    </main>
  );
}
