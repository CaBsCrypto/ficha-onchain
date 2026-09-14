'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PrescriptionSheet } from './PrescriptionSheet';
import { usePortalData } from './client';
import type { PrescriptionDocument, PrivatePrescription } from './types';

export function DocumentView({ id, prescription, onAvailable }: { id: string; prescription: PrivatePrescription; onAvailable?: (available: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const documentId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const outsidePointer = useRef<number | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [printHelp, setPrintHelp] = useState(false);
  const inline = !!onAvailable;
  const { data, error, loading, refresh } = usePortalData<{ document: PrescriptionDocument }>(open ? `/api/private-prescriptions/${encodeURIComponent(id)}/document` : null, 0);
  const ready = open && !!data && !error && !loading;
  useEffect(() => { onAvailable?.(!!ready); }, [ready, onAvailable]);
  useEffect(() => {
    if (!open || inline) return;
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; trigger.current?.focus(); };
  }, [open, inline]);
  function outside(event: React.PointerEvent<HTMLDialogElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
  }
  function closeDocument() { setPrintHelp(false); setOpen(false); }
  function printDocument() {
    if (!ready) return;
    setPrintHelp(true);
    try { window.print(); } catch { /* The guidance remains visible when printing is unavailable. */ }
  }
  const content = <>
    {loading && <div className="min-h-80 p-7" aria-busy="true"><p role="status" className="text-sm text-slate-600">Comprobando tu acceso y cargando la receta…</p><div aria-hidden="true" className="mt-6 space-y-6 motion-safe:animate-pulse"><div className="h-7 w-1/2 rounded bg-slate-100" /><div className="grid grid-cols-2 gap-5"><div className="h-12 rounded bg-slate-100" /><div className="h-12 rounded bg-slate-100" /></div><div className="h-24 rounded border-l-2 border-sky-100 bg-slate-50" /><div className="h-12 rounded bg-slate-100" /></div></div>}
    {error && <p role="alert" className="p-6 text-sm text-rose-700">{error} <button onClick={refresh} className="underline">Reintentar</button></p>}
    {ready && data && <PrescriptionSheet document={data.document} prescription={prescription} />}
  </>;
  return <>
    <button ref={trigger} aria-haspopup={inline ? undefined : 'dialog'} aria-expanded={open} aria-controls={documentId} onClick={() => { if (inline && open) closeDocument(); else setOpen(true); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{open && inline ? 'Cerrar documento' : 'Abrir documento privado'}</button>
    {open && (inline ? <div id={documentId} className="mt-4">{content}</div> : createPortal(
      <dialog ref={dialog} id={documentId} aria-labelledby={`${documentId}-title`} onPointerDown={event => { outsidePointer.current = event.button === 0 && outside(event) ? event.pointerId : null; }} onPointerUp={event => { const close = outsidePointer.current === event.pointerId && outside(event); outsidePointer.current = null; if (close) closeDocument(); }} onPointerCancel={() => { outsidePointer.current = null; }} onCancel={closeDocument} onClose={closeDocument} className="prescription-print-dialog m-auto max-h-[92dvh] w-[calc(100%_-_1.5rem)] max-w-[680px] overflow-y-auto rounded-3xl bg-white p-0 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm">
        <div className="prescription-toolbar sticky top-0 z-10 grid grid-cols-[1fr_auto] items-center gap-2 border-b sm:flex border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <h2 id={`${documentId}-title`} className="mr-auto text-sm font-semibold text-slate-600">Documento de receta</h2>
          <div className="col-span-2 row-start-2 flex flex-wrap gap-2 sm:ml-auto">
            <button disabled={!ready} onClick={printDocument} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-40">Imprimir / Guardar PDF</button>
          </div>
          <button autoFocus onClick={closeDocument} aria-label="Cerrar documento" title="Cerrar (Esc)" className="col-start-2 row-start-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600">×</button>
        </div>
        <div className="prescription-paper">{content}</div>
        {printHelp && <details className="prescription-toolbar border-t border-slate-100 px-5 py-3 text-xs leading-5 text-slate-600 sm:px-8"><summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-600">¿No se abrió la impresión?</summary><p className="mt-2">Abre esta página en Chrome o Edge y vuelve a abrir la receta con tu cuenta. En el diálogo de impresión, elige «Guardar como PDF».</p></details>}
        <style>{`@media print {
          body:has(.prescription-print-dialog[open]) { overflow: visible !important; }
          body:has(.prescription-print-dialog[open]) > :not(.prescription-print-dialog[open]) { display: none !important; }
          .prescription-print-dialog[open] { display: block !important; position: static !important; width: 100% !important; max-width: none !important; max-height: none !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: white !important; box-shadow: none !important; }
          .prescription-print-dialog::backdrop { display: none; }
          .prescription-toolbar { display: none !important; }
          .prescription-paper { padding: 0 !important; }
          .prescription-paper article { box-shadow: none !important; }
          .prescription-paper dt { break-after: avoid; }
          .prescription-paper dd { orphans: 3; widows: 3; }
        }`}</style>
      </dialog>, document.body))}
  </>;
}
