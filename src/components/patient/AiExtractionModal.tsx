"use client";
/**
 * AiExtractionModal — Modal interactivo de análisis con IA para el paciente.
 * ---------------------------------------------------------------------------
 * Cumple con la Fase 2 del plan "Mis datos + IA":
 * 1. Muestra disclaimer transparente de consentimiento opt-in (Ley 20.584).
 * 2. Llama a POST /api/patient/ai-extract.
 * 3. Renderiza hallazgos estructurados (resumen, diagnósticos CIE-10, medicamentos, laboratorios).
 * 4. Permite al paciente seleccionar y confirmar qué entradas agregar a su Ficha.
 * 5. Guarda las entradas confirmadas mediante POST /api/ficha/entry.
 */
import { useState, useEffect } from "react";
import { authedFetch } from "@/lib/auth/authed-fetch";
import type { DocumentExtractionResult, SuggestedClinicalEntry } from "@/lib/ai/document-extractor";

interface Props {
  patientEmail: string;
  documentId: number;
  documentTitle: string;
  onClose: () => void;
  onEntriesAdded?: () => void;
}

export function AiExtractionModal({
  patientEmail,
  documentId,
  documentTitle,
  onClose,
  onEntriesAdded,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<DocumentExtractionResult | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    async function runExtraction() {
      setLoading(true);
      setError(null);
      try {
        const res = await authedFetch("/api/patient/ai-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId, patientEmail }),
        });
        const json = (await res.json()) as {
          error?: string;
          extraction?: DocumentExtractionResult;
        };

        if (!active) return;
        if (!res.ok || json.error) {
          setError(json.error || "No se pudo realizar el análisis del documento.");
          setLoading(false);
          return;
        }

        if (json.extraction) {
          setExtraction(json.extraction);
          // By default, select all suggested entries
          const allIndices = new Set(json.extraction.suggestedEntries.map((_, i) => i));
          setSelectedIndices(allIndices);
        }
      } catch {
        if (active) setError("Error de conexión al conectar con el servicio de IA.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void runExtraction();
    return () => {
      active = false;
    };
  }, [documentId, patientEmail]);

  function toggleIndex(idx: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleConfirmAndSave() {
    if (!extraction || selectedIndices.size === 0) return;
    setSaving(true);
    setError(null);

    const entriesToSave: SuggestedClinicalEntry[] = extraction.suggestedEntries.filter((_, i) =>
      selectedIndices.has(i)
    );

    let savedCount = 0;
    try {
      for (const entry of entriesToSave) {
        const res = await authedFetch("/api/ficha/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientEmail,
            kind: entry.kind,
            summary: `[IA Auto-aporte] ${entry.summary}`,
            detail: entry.detail
              ? `${entry.detail}\n\n— Extraído con IA del documento "${documentTitle}" (#${documentId})`
              : `Extraído con IA del documento "${documentTitle}" (#${documentId})`,
          }),
        });
        if (res.ok) savedCount++;
      }

      setSaveSuccess(true);
      onEntriesAdded?.();
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch {
      setError(`Se guardaron ${savedCount} de ${entriesToSave.length} entradas. Ocurrió un error con las restantes.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
              <span className="text-lg">🧠</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-ink truncate max-w-xs sm:max-w-md">
                Análisis IA: {documentTitle}
              </h3>
              <p className="text-xs text-muted flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
                Opt-in registrado en Access-Log (Ley 20.584)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading && (
            <div className="py-12 text-center space-y-4">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"></div>
              <div>
                <p className="text-sm font-semibold text-ink">Analizando documento clínico...</p>
                <p className="text-xs text-muted">Extrayendo diagnósticos, exámenes y medicamentos estructurados</p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200 text-rose-700 text-xs space-y-1">
              <p className="font-semibold">Error al procesar el documento</p>
              <p>{error}</p>
            </div>
          )}

          {!loading && extraction && (
            <>
              {/* Banner disclaimer de transparencia */}
              <div className="rounded-2xl bg-indigo-50/60 p-4 ring-1 ring-indigo-100/80 text-xs text-indigo-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <span>💡</span> La IA propone, tú confirmas
                </p>
                <p className="text-indigo-800/90 leading-relaxed">
                  Revisa los hallazgos extraídos a continuación. Selecciona las entradas que desees incorporar a tu Ficha Clínica oficial.
                </p>
              </div>

              {/* Resumen ejecutivo */}
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Resumen del Examen</p>
                <p className="text-sm text-ink leading-relaxed font-medium">{extraction.summary}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-full bg-slate-200/70 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    Motor: {extraction.engineUsed}
                  </span>
                </div>
              </div>

              {/* Diagnósticos extraídos */}
              {extraction.diagnoses.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Diagnósticos detectados</p>
                  <div className="space-y-2">
                    {extraction.diagnoses.map((d, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                        {d.cie10 && (
                          <span className="rounded-lg bg-amber-50 px-2 py-1 font-mono text-xs font-bold text-amber-700 ring-1 ring-amber-200 shrink-0">
                            CIE-10: {d.cie10}
                          </span>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-ink">{d.description}</p>
                          {d.detail && <p className="text-[11px] text-muted">{d.detail}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Medicamentos extraídos */}
              {extraction.medications.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Medicamentos en receta</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {extraction.medications.map((m, i) => (
                      <div key={i} className="rounded-2xl bg-sky-50/50 p-3 ring-1 ring-sky-100 space-y-0.5">
                        <p className="text-xs font-bold text-sky-900">💊 {m.name}</p>
                        {m.dosage && <p className="text-[11px] text-sky-700">Dosis: {m.dosage}</p>}
                        {m.frequency && <p className="text-[11px] text-sky-600 font-medium">{m.frequency}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resultados de laboratorio */}
              {extraction.labResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valores de Laboratorio</p>
                  <div className="space-y-2">
                    {extraction.labResults.map((l, i) => (
                      <div key={i} className="flex items-center justify-between rounded-2xl bg-emerald-50/40 p-3 ring-1 ring-emerald-100">
                        <div>
                          <p className="text-xs font-bold text-emerald-950">{l.testName}</p>
                          {l.referenceRange && (
                            <p className="text-[11px] text-emerald-700">Ref: {l.referenceRange}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="rounded-xl bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                            {l.value} {l.unit || ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Entradas sugeridas para la Ficha (con checkboxes) */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-ink">Entradas sugeridas para guardar en tu Ficha</p>
                  <span className="text-[11px] text-clinical font-semibold">
                    {selectedIndices.size} seleccionada(s)
                  </span>
                </div>
                <div className="space-y-2">
                  {extraction.suggestedEntries.map((entry, idx) => {
                    const checked = selectedIndices.has(idx);
                    return (
                      <label
                        key={idx}
                        className={`flex items-start gap-3 rounded-2xl p-3.5 ring-1 cursor-pointer transition-all ${
                          checked
                            ? "bg-clinical/5 ring-clinical/40 shadow-sm"
                            : "bg-slate-50/70 ring-slate-200/80 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleIndex(idx)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-clinical focus:ring-clinical"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                              {entry.kind}
                            </span>
                            <p className="text-xs font-bold text-ink truncate">{entry.summary}</p>
                          </div>
                          {entry.detail && (
                            <p className="text-[11px] text-muted line-clamp-2 leading-relaxed">{entry.detail}</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {saveSuccess && (
            <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200 text-emerald-800 text-xs font-semibold text-center animate-fadeIn">
              ✓ Entradas confirmadas y guardadas exitosamente en tu Ficha Clínica.
            </div>
          )}
        </div>

        {/* Pie de modal */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100"
          >
            Cancelar
          </button>
          {!loading && extraction && (
            <button
              type="button"
              onClick={() => void handleConfirmAndSave()}
              disabled={saving || selectedIndices.size === 0 || saveSuccess}
              className="rounded-xl bg-clinical px-5 py-2.5 text-xs font-bold text-white transition-opacity disabled:opacity-50 hover:bg-clinical/90 shadow-md"
            >
              {saving
                ? "Guardando en Ficha..."
                : saveSuccess
                ? "¡Guardado!"
                : `Confirmar y Guardar (${selectedIndices.size})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
