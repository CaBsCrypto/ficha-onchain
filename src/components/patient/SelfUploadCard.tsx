"use client";
/**
 * SelfUploadCard — el paciente sube sus propios documentos (PDF o foto) a su
 * ficha. Van al mismo endpoint que usan los médicos (POST /api/ficha/document):
 * cifrado at-rest, SHA-256 anclado on-chain. El servidor los marca como
 * autoaportes (doctor_email NULL) porque el token es del propio paciente.
 *
 * Mobile-first: el caso real es la foto de un examen sacada con el teléfono,
 * por eso hay un botón dedicado "Tomar foto" con capture="environment".
 */
import { useRef, useState } from "react";
import { authedFetch } from "@/lib/auth/authed-fetch";

// Mismo tope que el API (MAX_BASE64 = 5.000.000 chars de base64 ≈ 3,7 MB de
// archivo). Validamos aquí para no subir 5 MB solo para recibir un 413.
const MAX_FILE_BYTES = 3_700_000;

const CATEGORIES = ["Examen", "Receta", "Informe", "Otro"] as const;

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "error"; message: string }
  | {
      kind: "success";
      contentHash: string;
      mode: string;
      explorer: string | null;
    };

interface Props {
  patientEmail: string;
  /** Llamado tras una subida exitosa para que el padre recargue la lista. */
  onUploaded?: () => void;
}

export function SelfUploadCard({ patientEmail, onUploaded }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("Examen");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setStatus({
        kind: "error",
        message: `El archivo pesa ${(f.size / 1_000_000).toFixed(1)} MB — el máximo es ~3,7 MB. Prueba con una foto de menor resolución o un PDF más liviano.`,
      });
      return;
    }
    setStatus({ kind: "idle" });
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, ""));
  }

  async function upload() {
    if (!file || !title.trim()) {
      setStatus({ kind: "error", message: "Elige un archivo y dale un título." });
      return;
    }
    setStatus({ kind: "uploading" });
    try {
      // File → base64 (sin el prefijo data:...;base64,)
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const s = String(reader.result);
          resolve(s.slice(s.indexOf(",") + 1));
        };
        reader.onerror = () => reject(new Error("no se pudo leer el archivo"));
        reader.readAsDataURL(file);
      });

      const res = await authedFetch("/api/ficha/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientEmail,
          category,
          title: title.trim(),
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          base64,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        mode?: string;
        contentHash?: string;
        explorer?: string | null;
      };
      if (!res.ok) {
        setStatus({
          kind: "error",
          message:
            res.status === 413
              ? "El archivo es demasiado grande (máx ~3,7 MB)."
              : json.error ?? "No se pudo subir el documento. Intenta de nuevo.",
        });
        return;
      }
      setStatus({
        kind: "success",
        contentHash: json.contentHash ?? "",
        mode: json.mode ?? "simulated",
        explorer: json.explorer ?? null,
      });
      setFile(null);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
      onUploaded?.();
    } catch {
      setStatus({
        kind: "error",
        message: "Error de red al subir. Revisa tu conexión e intenta de nuevo.",
      });
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white shadow-sm">
      {/* Cabecera / toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left sm:px-6"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-clinical/10 text-clinical">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4.5 w-4.5" aria-hidden>
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Agregar mis documentos</p>
            <p className="text-xs text-muted">
              PDF o foto — se cifran y su huella queda anclada on-chain
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-clinical">
          {open ? "Cerrar" : "Subir"}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-5 py-4 sm:px-6">
          {/* Selección de archivo: botón normal + cámara del teléfono */}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-clinical/40 hover:text-clinical"
            >
              Elegir archivo
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-clinical/40 hover:text-clinical"
            >
              Tomar foto
            </button>
          </div>
          {file && (
            <p className="truncate text-xs text-muted">
              📎 {file.name} · {(file.size / 1_000_000).toFixed(1)} MB
            </p>
          )}

          {/* Título + categoría */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título (ej: Examen de sangre marzo)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-clinical/50 focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={
                  category === c
                    ? "rounded-full bg-clinical/10 px-3 py-1.5 text-xs font-semibold text-clinical ring-1 ring-inset ring-clinical/30"
                    : "rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-slate-200 hover:text-ink"
                }
              >
                {c}
              </button>
            ))}
          </div>

          {/* Acción + estados */}
          <button
            type="button"
            onClick={() => void upload()}
            disabled={status.kind === "uploading" || !file}
            className="w-full rounded-xl bg-clinical px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {status.kind === "uploading" ? "Subiendo…" : "Subir a mi ficha"}
          </button>

          {status.kind === "error" && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
              {status.message}
            </p>
          )}
          {status.kind === "success" && (
            <div className="space-y-1 rounded-xl bg-mint-50/60 px-3 py-2.5 ring-1 ring-inset ring-mint/20">
              <p className="text-xs font-semibold text-mint">
                Documento guardado {status.mode === "onchain" ? "y anclado on-chain ⚡" : "(ancla simulada en demo)"}
              </p>
              {status.contentHash && (
                <p className="truncate font-mono text-[10px] text-muted" title={status.contentHash}>
                  sha256: {status.contentHash}
                </p>
              )}
              {status.explorer && (
                <a
                  href={status.explorer}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-clinical hover:underline"
                >
                  Ver transacción en Stellar Expert →
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
