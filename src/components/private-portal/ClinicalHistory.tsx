'use client';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import type { ClinicalGrant, ClinicalOperation, ClinicalVersion } from '@/types/clinical';
import { usePortalWallet } from './WalletBoundary';
import { localDate, appointmentDate } from './client';
import { ReceiptLink } from './Operation';
import { DocumentView } from './DocumentView';
import { prescriptionLabel } from './state';
import { ClinicalDraftEntryForm, ClinicalDraftWorkspace } from './ClinicalDraftWorkspace';
import { ClinicalEntryForm } from './ClinicalEntryForm';
import { ClinicalSigningCheck, clinicalSigningCheckScopeKey, type ClinicalSigningCheckStatus } from './ClinicalSigningCheck';
import { clinicalApi, localizedClinicalError, verifiedClinicalOperation, readClinicalDownload, useClinicalOperation, useClinicalSnapshot, type ClinicalIntent } from './clinical-client';

const button = 'min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50';
const stateLabels = {
  awaiting_signature: 'awaitingSignature', submitted: 'submitted',
  confirmed: 'confirmed', failed: 'failed', cancelled: 'cancelled',
} as const satisfies Record<ClinicalOperation['state'], keyof typeof spanish>;
const actionLabels = {
  create_history: 'createHistory', append_version: 'saveContribution', set_permissions: 'updatePermissions',
} as const satisfies Record<ClinicalOperation['action'], keyof typeof spanish>;
const spanish = {
  awaitingSignature: 'Pendiente de tu firma',
  submitted: 'Enviado; confirmación pendiente',
  confirmed: 'Confirmado en Stellar Testnet',
  failed: 'No se confirmó el cambio',
  cancelled: 'Firma cancelada',
  createHistory: 'Crear mi historial',
  saveContribution: 'Guardar aporte',
  updatePermissions: 'Actualizar permisos',
  preparedReview: 'Revisión del cambio preparado',
  reviewTitle: 'Cambio preparado para tu revisión',
  network: 'Red',
  version: 'Versión',
  patientAccount: 'Paciente · cuenta Stellar',
  authorAccount: 'Autor · cuenta que firma',
  record: 'Ficha',
  document: 'Documento',
  format: 'Formato',
  entryDate: 'Fecha del antecedente',
  linkedPrescription: 'Receta vinculada',
  withdrawBoth: 'Retirar ambos permisos del médico',
  updateDoctorPermissions: 'Actualizar permisos del médico',
  doctor: 'Médico',
  read: 'Lectura',
  readAllowed: 'permitida',
  readWithdrawn: 'retirada',
  append: 'Aportes',
  appendAllowed: 'permitidos',
  appendWithdrawn: 'retirados',
  currentRevision: 'Revisión actual',
  reviewCreate: 'Crear el historial privado para la cuenta del paciente indicada.',
  quote: 'Cotización verificada',
  feeCoverage: 'TrustLeaf cubre la comisión máxima ofrecida',
  testnetXlm: 'XLM de Testnet',
  quotePrepared: 'Cotización preparada',
  chileTime: 'Hora de Chile',
  validUntil: 'Válida hasta',
  remainingTime: 'Tiempo restante de la cotización',
  timeToConfirm: 'Tiempo para confirmar',
  quoteExpired: 'La cotización venció. La firma permanece deshabilitada; consulta o cancela este mismo intento.',
  quoteUnavailable: 'No pudimos verificar la cotización de este intento. La firma permanece deshabilitada.',
  fileUnverified: 'No pudimos verificar el archivo.',
  download: 'Descargar',
  checkingFile: 'Comprobando archivo…',
  prepareDownload: 'Preparar descarga privada',
  addedByPatient: 'Aportado por paciente',
  addedByYou: 'Aportado por ti',
  recordedByDoctor: 'Registrado por médico',
  recorded: 'Registrado',
  pdfFile: 'Archivo PDF',
  imageFile: 'Archivo de imagen',
  prescriptionNumber: 'Receta #',
  preparedDocument: 'Documento preparado',
  consultation: 'Consulta',
  expires: 'Vence',
  prescriptionReceipt: 'Ver recibo de la receta en Stellar Testnet',
  prescriptionUnavailable: 'El vínculo a la receta se conserva, pero no pudimos comprobar tu acceso o su estado. Su documento permanece cerrado. Actualiza para volver a comprobarlo.',
  authorWallet: 'Cuenta del autor',
  checkSigning: 'Comprueba primero la firma con Privy antes de preparar un aporte nuevo.',
  writesDisabledRead: 'Las escrituras están apagadas. Puedes consultar los registros existentes.',
  writesDisabled: 'Las escrituras están apagadas.',
  draftPublicationUnverified: 'No pudimos comprobar la publicación vinculada. Conserva el borrador y vuelve a consultar.',
  resultUnverified: 'No pudimos comprobar el resultado.',
  signIn: 'Ingresa con Privy para abrir tu historial privado.',
  doctorDescription: 'Consulta y aporta sólo con los permisos vigentes de este paciente. Cada aporte conserva su autor, fecha y versiones.',
  patientDescription: 'Tus antecedentes y archivos, con su autor y sus versiones. Tú decides los permisos de los médicos.',
  checking: 'Consultando…',
  refresh: 'Actualizar',
  privateDrafting: 'Redacción privada',
  writePrivateDraft: 'Redactar borrador privado',
  earlierInformation: 'No mostramos información anterior como verificada.',
  recheckDoctorAccess: 'Cierra esta ficha y vuelve a comprobar tu cuenta y los permisos antes de continuar.',
  signInAgain: 'Vuelve a ingresar con Privy antes de continuar.',
  refreshHistory: 'Puedes actualizar para volver a comprobar el historial.',
  readOnly: 'Tienes permiso de sólo lectura. Puedes consultar el historial y descargar sus archivos privados, sin agregar ni corregir aportes.',
  publishingDisabled: 'Las publicaciones están deshabilitadas. Puedes consultar los antecedentes verificados y guardar borradores privados sin firmar ni enviar transacciones.',
  demoReadOnly: 'Las confirmaciones están deshabilitadas en esta demostración. Puedes consultar tu historial y explorar los formularios con borradores temporales, sin guardar ni enviar transacciones.',
  demoCreateDisabled: 'Las confirmaciones están deshabilitadas en esta demostración. Crear una ficha requiere habilitar su confirmación con Privy.',
  loading: 'Comprobando acceso, versiones y recibos… La consulta puede tardar hasta 5 minutos.',
  currentAttempt: 'Intento clínico actual',
  signatureExpired: 'Solicitud de firma vencida',
  preparationUnverified: 'Preparación sin resultado comprobado',
  uncertain: 'No recibimos un resultado verificable. Consultaremos el mismo intento; no prepares ni firmes otro.',
  pendingNotice: 'El cambio sigue pendiente. Puedes recargar y consultar este mismo intento; todavía no está confirmado.',
  confirmedNotice: 'El cambio está confirmado. Puedes revisar su recibo en Stellar Testnet.',
  signatureRequestExpires: 'Esta solicitud de firma vence',
  signingConditions: 'La firma requiere contenido y cotización verificados y vigentes. Puedes consultar este mismo intento o cancelar la firma pendiente.',
  checkConfirmation: 'Consultar confirmación',
  resumePreparation: 'Retomar la misma preparación',
  retrySubmission: 'Reintentar envío del mismo intento',
  reviewConfirmation: 'Revisar confirmación',
  cancelSignature: 'Cancelar firma pendiente',
  confirmPrefix: 'Confirmarás',
  confirmCreate: 'la creación de tu historial',
  confirmPermissions: 'los permisos del médico indicados en el cambio preparado',
  confirmContribution: 'el documento o antecedente y el paciente indicados en el cambio preparado',
  confirmSuffix: 'con tu cuenta Privy. TrustLeaf cubre la comisión. Espera el recibo antes de considerar el cambio guardado.',
  confirming: 'Confirmando…',
  confirmPrivy: 'Confirmar con mi cuenta Privy',
  back: 'Volver',
  startHistory: 'Comienza tu historial',
  startHistoryDescription: 'Crea tu espacio privado para agregar antecedentes y archivos. El contenido clínico permanece cifrado; Stellar registra los permisos y comprobantes.',
  prepareHistory: 'Preparar mi historial',
  selectedHistory: 'Ficha seleccionada y permisos comprobados',
  historyCreated: 'Historial clínico creado',
  shareCode: 'Código para compartir tu ficha con un médico',
  shareHelp: 'Copia este código y compártelo con tu médico. El código identifica la ficha; también debes habilitar su permiso para consultar o agregar aportes.',
  noPermission: 'sin permiso',
  created: 'Creado',
  creationReceipt: 'Ver transacción de creación en Stellar Testnet',
  creationReceiptUnavailable: 'No pudimos comprobar el recibo de creación. Puedes actualizar para volver a consultarlo.',
  appendOnly: 'El paciente permite agregar aportes, pero no consultar su historial. Los antecedentes y las correcciones anteriores permanecen cerrados.',
  filter: 'Mostrar',
  filterAll: 'Todo el historial',
  filterMine: 'Mis aportes',
  filterDoctors: 'Aportes médicos',
  filterNotes: 'Antecedentes escritos',
  filterFiles: 'PDF e imágenes',
  addEntry: 'Agregar antecedente o archivo',
  contentVerified: 'Contenido y recibos comprobados:',
  permissionsVerified: 'Permisos comprobados:',
  noFilteredEntries: 'No hay aportes en este filtro. Puedes elegir «Todo el historial».',
  noEntries: 'Aún no hay antecedentes ni archivos. Agrega tu primer aporte cuando quieras.',
  chronology: 'Cronología de antecedentes',
  correct: 'Corregir mi aporte',
  show: 'Ver',
  previousVersion: 'versión anterior',
  previousVersions: 'versiones anteriores',
  grantsUnavailable: 'No pudimos comprobar algunos médicos o sus permisos. Sólo mostramos los estados verificados; los demás controles no están disponibles. Puedes actualizar para volver a consultar.',
  pendingAttempt: 'Consultar intento pendiente',
  demoNotice: 'Demostración en Stellar Testnet con datos sintéticos. Los aportes del paciente se distinguen de los registros médicos. Retirar un permiso bloquea accesos posteriores; no elimina copias ya descargadas.',
};
const english: typeof spanish = {
  awaitingSignature: 'Awaiting your signature',
  submitted: 'Submitted and awaiting confirmation',
  confirmed: 'Confirmed on Stellar Testnet',
  failed: 'Change was not confirmed',
  cancelled: 'Signature cancelled',
  createHistory: 'Create my clinical record',
  saveContribution: 'Save contribution',
  updatePermissions: 'Update permissions',
  preparedReview: 'Review prepared change',
  reviewTitle: 'Change ready for review',
  network: 'Network',
  version: 'Version',
  patientAccount: 'Patient’s Stellar account',
  authorAccount: 'Author’s signing account',
  record: 'Clinical record',
  document: 'Document',
  format: 'Format',
  entryDate: 'Entry date',
  linkedPrescription: 'Linked prescription',
  withdrawBoth: 'Withdraw both doctor permissions',
  updateDoctorPermissions: 'Update doctor permissions',
  doctor: 'Doctor',
  read: 'Read access',
  readAllowed: 'allowed',
  readWithdrawn: 'withdrawn',
  append: 'Add access',
  appendAllowed: 'allowed',
  appendWithdrawn: 'withdrawn',
  currentRevision: 'Current revision',
  reviewCreate: 'Create the private clinical record for the patient account shown above.',
  quote: 'Verified fee quote',
  feeCoverage: 'TrustLeaf covers the maximum quoted fee',
  testnetXlm: 'Testnet XLM',
  quotePrepared: 'Quote prepared',
  chileTime: 'Chile time',
  validUntil: 'Valid until',
  remainingTime: 'Time left on quote',
  timeToConfirm: 'Time to confirm',
  quoteExpired: 'The quote expired. Signing is disabled. Check or cancel this attempt.',
  quoteUnavailable: 'We could not verify the quote for this attempt. Signing is disabled.',
  fileUnverified: 'We could not verify the file.',
  download: 'Download',
  checkingFile: 'Checking file…',
  prepareDownload: 'Prepare private download',
  addedByPatient: 'Added by the patient',
  addedByYou: 'Added by you',
  recordedByDoctor: 'Recorded by the doctor',
  recorded: 'Recorded',
  pdfFile: 'PDF file',
  imageFile: 'Image file',
  prescriptionNumber: 'Prescription #',
  preparedDocument: 'Prepared document',
  consultation: 'Consultation',
  expires: 'Expires',
  prescriptionReceipt: 'View prescription receipt on Stellar Testnet',
  prescriptionUnavailable: 'The prescription link is still saved. We could not verify your access or its status, so its document stays closed. Refresh to check again.',
  authorWallet: 'Author’s account',
  checkSigning: 'Check signing with Privy before preparing a new contribution.',
  writesDisabledRead: 'Changes are disabled. You can still view existing records.',
  writesDisabled: 'Changes are disabled.',
  draftPublicationUnverified: 'We could not verify the linked publication. Keep the draft and check again.',
  resultUnverified: 'We could not verify the result.',
  signIn: 'Sign in with Privy to open your private clinical record.',
  doctorDescription: 'Read and add information within the permissions this patient has granted. Each contribution retains its author, date and version history.',
  patientDescription: 'Your entries and files, with their authors and versions. You decide what doctors can access.',
  checking: 'Checking…',
  refresh: 'Refresh',
  privateDrafting: 'Private drafting',
  writePrivateDraft: 'Write a private draft',
  earlierInformation: 'Earlier information is hidden until verified.',
  recheckDoctorAccess: 'Close this record and check your account and permissions before continuing.',
  signInAgain: 'Sign in again with Privy before continuing.',
  refreshHistory: 'Refresh to check the record again.',
  readOnly: 'You have read-only access. You can view the record and download its private files. Adding and correcting entries are unavailable.',
  publishingDisabled: 'Publishing is disabled. You can view verified entries and save private drafts without signing or sending transactions.',
  demoReadOnly: 'Confirmations are disabled in this demo. You can view your record and try the forms with temporary drafts. These drafts are not saved or sent.',
  demoCreateDisabled: 'Confirmations are disabled in this demo. Creating a record requires confirmation through Privy.',
  loading: 'Checking access, versions and receipts… This may take up to 5 minutes.',
  currentAttempt: 'Current clinical operation',
  signatureExpired: 'Signature request expired',
  preparationUnverified: 'Preparation result unverified',
  uncertain: 'We did not receive a verifiable result. Check this same attempt before preparing or signing anything else.',
  pendingNotice: 'The change is still pending. Refresh and check this same attempt for confirmation.',
  confirmedNotice: 'The change is confirmed. You can view its receipt on Stellar Testnet.',
  signatureRequestExpires: 'This signature request expires',
  signingConditions: 'Signing requires verified content and a valid fee quote. You can check this attempt or cancel the pending signature.',
  checkConfirmation: 'Check confirmation',
  resumePreparation: 'Resume this preparation',
  retrySubmission: 'Retry this submission',
  reviewConfirmation: 'Review confirmation',
  cancelSignature: 'Cancel pending signature',
  confirmPrefix: 'You are confirming',
  confirmCreate: 'the creation of your clinical record',
  confirmPermissions: 'the doctor permissions shown above',
  confirmContribution: 'the document or entry for the patient shown above',
  confirmSuffix: 'with your Privy account. TrustLeaf covers the fee. Wait for the receipt to confirm that your change was saved.',
  confirming: 'Confirming…',
  confirmPrivy: 'Confirm with my Privy account',
  back: 'Back',
  startHistory: 'Start your clinical record',
  startHistoryDescription: 'Create your private record for entries and files. Clinical content stays encrypted. Stellar records permissions and proofs.',
  prepareHistory: 'Prepare my clinical record',
  selectedHistory: 'Selected record and verified permissions',
  historyCreated: 'Clinical record created',
  shareCode: 'Code to share your record with a doctor',
  shareHelp: 'Copy this code and share it with your doctor. It identifies the record. Grant the doctor permission separately to read or add information.',
  noPermission: 'not granted',
  created: 'Created',
  creationReceipt: 'View record creation on Stellar Testnet',
  creationReceiptUnavailable: 'We could not verify the creation receipt. Refresh to check again.',
  appendOnly: 'The patient allows you to add information. Existing entries and corrections stay private.',
  filter: 'Show',
  filterAll: 'All entries',
  filterMine: 'My contributions',
  filterDoctors: 'Doctor contributions',
  filterNotes: 'Written entries',
  filterFiles: 'PDFs and images',
  addEntry: 'Add an entry or file',
  contentVerified: 'Content and receipts verified:',
  permissionsVerified: 'Permissions verified:',
  noFilteredEntries: 'No entries match this filter. Select “All entries” to view the full record.',
  noEntries: 'There are no entries or files yet. Add your first contribution when you’re ready.',
  chronology: 'Clinical record timeline',
  correct: 'Correct my contribution',
  show: 'View',
  previousVersion: 'previous version',
  previousVersions: 'previous versions',
  grantsUnavailable: 'We could not verify some doctors or their permissions. Only verified results and controls are shown. Refresh to check again.',
  pendingAttempt: 'Check pending attempt',
  demoNotice: 'Stellar Testnet demo with synthetic data. Labels identify patient and doctor contributions. Withdrawing permission blocks future access. Previously downloaded copies remain with the doctor.',
};
const copy = { es: spanish, en: english };

type PortalLanguage = ReturnType<typeof usePortalLanguage>;
const numberLocale = (language: PortalLanguage) => language === 'en' ? 'en-US' : 'es-CL';

function recordDate(language: PortalLanguage, timestamp?: number | null) {
  if (language === 'es') return localDate(timestamp);
  return timestamp ? new Date(timestamp * 1000).toLocaleString('en-US', { timeZone: 'America/Santiago' }) : 'Pending';
}

function entryCalendarDate(language: PortalLanguage, date: string) {
  if (language === 'es') return appointmentDate(date);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(date.slice(0, 10) + 'T12:00:00Z'));
}

export interface ClinicalPermissionsProps {
  grants: ClinicalGrant[]; disabled: boolean; readOnly?: boolean; onPrepare: (input: ClinicalIntent) => Promise<ClinicalOperation>;
}
export interface ClinicalHistoryProps { renderPermissions?: (props: ClinicalPermissionsProps) => ReactNode; historyId?: string; onPendingChange?: (pending: boolean) => void }

function ClinicalPreparedReview({ operation }: { operation: ClinicalOperation }) {
  const language = usePortalLanguage();
  const text = copy[language];
  const review = operation.review, quote = operation.sponsorship;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!quote) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const currentTime = Date.now(); setNow(currentTime);
      const remaining = quote.quoteExpiresAt * 1000 - currentTime;
      if (remaining > 0) timer = setTimeout(tick, Math.min(1000, remaining));
    };
    tick();
    return () => clearTimeout(timer);
  }, [quote?.quoteExpiresAt]);
  if (!review) return null;
  const content = review.content;
  const remainingSeconds = quote ? Math.max(0, Math.ceil((quote.quoteExpiresAt * 1000 - now) / 1000)) : 0;
  const maxFee = quote ? (BigInt(quote.maxFeeStroops) / BigInt(10_000_000)).toString() + '.' + (BigInt(quote.maxFeeStroops) % BigInt(10_000_000)).toString().padStart(7, '0') : '';
  return <section aria-label={text.preparedReview} className="space-y-3 rounded-xl border border-sky-200 bg-white p-4 text-sm text-slate-800">
    <h3 className="font-semibold">{text.reviewTitle}</h3>
    <p>{text.network}: <strong>Stellar Testnet</strong>{review.version ? ` · ${text.version} ${review.version}` : ''}</p>
    <dl className="space-y-2">
      <div><dt className="font-semibold">{text.patientAccount}</dt><dd className="break-all font-mono text-xs">{review.patient}</dd></div>
      <div><dt className="font-semibold">{text.authorAccount}</dt><dd className="break-all font-mono text-xs">{review.author}</dd></div>
      <div><dt className="font-semibold">{text.record}</dt><dd className="break-all font-mono text-xs">{review.historyId}</dd></div>
    </dl>
    {content.kind === 'file' ? <div className="space-y-2">
      <p><strong>{text.document}:</strong> {content.fileName}</p><p>{text.format}: {content.mediaType} · {content.byteLength.toLocaleString(numberLocale(language))} bytes</p>
      <p className="break-all font-mono text-xs">SHA-256: {content.sha256}</p>
    </div> : content.kind === 'note' ? <div className="space-y-2">
      <p className="font-semibold">{content.note.title}</p><p className="whitespace-pre-wrap break-words">{content.note.text}</p>
      {content.note.eventDate && <p>{text.entryDate}: {entryCalendarDate(language, content.note.eventDate)}</p>}
      {content.note.prescriptionId && <p className="break-all">{text.linkedPrescription}: {content.note.prescriptionId}</p>}
    </div> : content.kind === 'permissions' ? <div className="space-y-2">
      <p className="font-semibold">{!content.canRead && !content.canAppend ? text.withdrawBoth : text.updateDoctorPermissions}</p>
      <p className="break-all font-mono text-xs">{text.doctor}: {content.doctor}</p>
      <p>{text.read}: {content.canRead ? text.readAllowed : text.readWithdrawn} · {text.append}: {content.canAppend ? text.appendAllowed : text.appendWithdrawn} · {text.currentRevision}: {content.expectedRevision}</p>
    </div> : <p>{text.reviewCreate}</p>}
    {quote ? <div aria-label={text.quote} className="space-y-1 border-t border-sky-100 pt-3">
      <p>{text.feeCoverage}: <strong>{maxFee} {text.testnetXlm}</strong>.</p>
      <p>{text.quotePrepared}: {recordDate(language, quote.quotePreparedAt)} · {text.chileTime}</p>
      <p>{text.validUntil}: {recordDate(language, quote.quoteExpiresAt)} · {text.chileTime}</p>
      {remainingSeconds > 0 ? <p role="timer" aria-live="off" aria-label={text.remainingTime}>{text.timeToConfirm}: {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}</p> : <p role="status" className="font-semibold text-amber-900">{text.quoteExpired}</p>}
    </div> : <p role="status">{text.quoteUnavailable}</p>}
  </section>;
}

function ClinicalDownload({ entry, onUnavailable, historyId }: { entry: ClinicalVersion; onUnavailable: () => void; historyId?: string }) {
  const language = usePortalLanguage();
  const text = copy[language];
  const [readyUrl, setReadyUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = useRef('');
  const request = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const revokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; request.current?.abort(); if (revokeTimer.current) clearTimeout(revokeTimer.current); if (url.current) URL.revokeObjectURL(url.current); };
  }, []);
  useEffect(() => { if (readyUrl) link.current?.focus(); }, [readyUrl]);
  async function prepareDownload() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setReadyUrl('');
    if (url.current) { URL.revokeObjectURL(url.current); url.current = ''; }
    const abort = new AbortController(); request.current = abort;
    try {
      const blob = await readClinicalDownload(entry.entryId, entry.version, abort.signal, historyId);
      if (!alive.current || abort.signal.aborted) return;
      const next = URL.createObjectURL(blob); url.current = next; setReadyUrl(next);
    } catch (failure) {
      if (alive.current && !abort.signal.aborted) { setError(localizedClinicalError(failure, language, text.fileUnverified)); onUnavailable(); }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function downloaded() {
    revokeTimer.current = setTimeout(() => {
      if (url.current) URL.revokeObjectURL(url.current); url.current = '';
      if (alive.current) setReadyUrl('');
    }, 1500);
  }
  return <div className="mt-3 space-y-2">
    {readyUrl ? <a ref={link} href={readyUrl} download={entry.fileName} onClick={downloaded} className="inline-flex min-h-11 max-w-full items-center break-all rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 underline focus-visible:outline-2 focus-visible:outline-sky-600">{text.download} {entry.fileName}</a> :
      <button type="button" disabled={busy} onClick={() => void prepareDownload()} className={`${button} border border-sky-200 bg-sky-50 text-sky-800`}>{busy ? text.checkingFile : text.prepareDownload}</button>}
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
  </div>;
}
function VersionContent({ entry, onUnavailable, historyId }: { entry: ClinicalVersion; onUnavailable: () => void; historyId?: string }) {
  const language = usePortalLanguage();
  const text = copy[language];
  return <div className="min-w-0">
    <h3 className="break-words font-semibold text-slate-900">{entry.title}</h3>
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span className="rounded-lg bg-sky-50 px-2.5 py-1 font-medium text-sky-800">{entry.source === 'patient' ? historyId ? text.addedByPatient : text.addedByYou : text.recordedByDoctor}</span><span className="text-slate-500">{text.version} {entry.version}</span></div>
    <p className="mt-2 text-sm text-slate-500">{text.recorded}: {recordDate(language, entry.createdAt)} · {text.chileTime}</p>
    {entry.note ? <><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{entry.note.text}</p>{entry.note.eventDate && <p className="mt-3 text-sm text-slate-500">{text.entryDate}: {entryCalendarDate(language, entry.note.eventDate)}</p>}</> :
      <><p className="mt-3 break-all text-sm text-slate-600">{entry.mediaType === 'application/pdf' ? text.pdfFile : text.imageFile}: {entry.fileName}</p><ClinicalDownload entry={entry} onUnavailable={onUnavailable} historyId={historyId} /></>}
    {entry.prescription && <section aria-label={text.linkedPrescription} className="mt-4 space-y-2 rounded-xl border border-sky-100 bg-sky-50/40 p-3"><p className="text-sm font-semibold text-slate-800">{entry.prescription.rxId ? `${text.prescriptionNumber}${entry.prescription.rxId}` : text.preparedDocument} · {text.consultation} {entry.prescription.appointmentId}</p><p className="text-sm text-slate-600">{prescriptionLabel(entry.prescription, language)} · {text.expires}: {recordDate(language, entry.prescription.expiresAt)}</p><DocumentView key={entry.prescription.id} id={entry.prescription.id} prescription={entry.prescription} /><ReceiptLink hash={entry.prescription.transactionHash} label={text.prescriptionReceipt} /></section>}
    {entry.prescriptionUnavailable && <p role="status" className="mt-3 text-sm text-slate-600">{text.prescriptionUnavailable}</p>}
    <ReceiptLink hash={entry.transactionHash} />
    {entry.source === 'doctor' && <p className="mt-3 break-all text-sm text-slate-500">{text.authorWallet}: {entry.author}</p>}
  </div>;
}
export function ClinicalHistory({ renderPermissions, historyId, onPendingChange }: ClinicalHistoryProps = {}) {
  const language = usePortalLanguage();
  const text = copy[language];
  const { ready, authenticated, user } = usePrivy();
  const wallet = usePortalWallet();
  const doctor = historyId !== undefined;
  const identity = ready && authenticated && user?.id ? `${user.id}:${wallet.walletId}:${wallet.address}${doctor ? `:doctor:${historyId}` : ''}` : '';
  const snapshot = useClinicalSnapshot(identity, historyId, language);
  const operation = useClinicalOperation(identity, wallet.address, snapshot.data?.rehearsal, language);
  const [editing, setEditing] = useState<ClinicalVersion | 'new' | null>(null);
  const [filter, setFilter] = useState('all');
  const [independentDraft, setIndependentDraft] = useState(false);
  const [actionError, setActionError] = useState('');
  const [signReview, setSignReview] = useState(false);
  const [preparedFocus, setPreparedFocus] = useState<{ identity: string; operationId: string } | null>(null);
  const [signingCheck, setSigningCheck] = useState<{ key: string; status: ClinicalSigningCheckStatus }>({ key: '', status: 'idle' });
  const signingScope = useRef('');
  const lastRefresh = useRef('');
  const signButton = useRef<HTMLButtonElement>(null);
  const formOpener = useRef<HTMLButtonElement | null>(null);
  const signHeading = useRef<HTMLHeadingElement>(null);
  const operationHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (signReview) signHeading.current?.focus(); }, [signReview]);
  useEffect(() => { setEditing(null); setIndependentDraft(false); setFilter('all'); setActionError(''); setSignReview(false); setPreparedFocus(null); setSigningCheck({ key: '', status: 'idle' }); lastRefresh.current = ''; }, [identity]);
  useEffect(() => {
    if (!preparedFocus) return;
    if (preparedFocus.identity !== identity || operation.accessLost) { setPreparedFocus(null); return; }
    if (operation.busy || operation.operation?.id !== preparedFocus.operationId) return;
    const heading = signReview ? signHeading.current : operationHeading.current;
    if (!heading) return;
    setPreparedFocus(null);
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'center' });
  }, [preparedFocus, identity, operation.operation?.id, operation.busy, operation.accessLost, signReview]);
  useEffect(() => {
    const current = operation.operation;
    if (current && ['confirmed', 'cancelled', 'failed'].includes(current.state) && lastRefresh.current !== `${current.id}:${current.state}`) {
      lastRefresh.current = `${current.id}:${current.state}`; setEditing(null); setSignReview(false); snapshot.refresh();
    }
  }, [operation.operation?.id, operation.operation?.state, snapshot.refresh]);
  const data = operation.accessLost ? null : snapshot.data;
  const pending = data?.operations.filter(op => ['awaiting_signature', 'submitted'].includes(op.state)) ?? [];
  const checkRequired = doctor && data?.rehearsal?.signingCheck === true;
  const checkScope = checkRequired ? { identity, address: wallet.address, historyId: historyId!, runId: data.rehearsal!.runId, until: data.rehearsal!.until } : null;
  const checkKey = checkScope ? clinicalSigningCheckScopeKey(checkScope) : '';
  signingScope.current = checkKey;
  const checkBusy = !!checkKey && signingCheck.key === checkKey && signingCheck.status === 'busy';
  const checkPassed = !!checkKey && signingCheck.key === checkKey && signingCheck.status === 'verified' && Date.now() < checkScope!.until * 1000;
  const signingCheckBlocked = checkRequired && !checkPassed;
  const checkReadyNow = () => !checkRequired || checkPassed && !checkBusy && signingScope.current === checkKey && Date.now() < checkScope!.until * 1000;
  const checkStatus = useCallback((key: string, status: ClinicalSigningCheckStatus) => {
    if (key === signingScope.current) setSigningCheck({ key, status });
  }, []);
  // Keep a verified check through a snapshot refresh; a different observed scope
  // or an explicitly inactive flag never reuses the previous account's result.
  useEffect(() => {
    if (operation.accessLost || data && !checkRequired) setSigningCheck({ key: '', status: 'idle' });
    else if (checkKey) setSigningCheck(value => value.key === checkKey ? value : { key: checkKey, status: 'idle' });
  }, [operation.accessLost, !!data, checkRequired, checkKey]);
  const blocked = snapshot.loading || !!snapshot.error || !data || operation.busy || operation.uncertain || operation.accessLost;
  const newBlocked = blocked || checkBusy || signingCheckBlocked || pending.length > 0 || !!operation.operation && ['awaiting_signature', 'submitted'].includes(operation.operation.state);
  const canRead = !doctor || data?.context?.role === 'doctor' && data.context.canRead;
  const canAppend = !doctor || data?.context?.role === 'doctor' && data.context.canAppend;
  useEffect(() => { onPendingChange?.(checkBusy || operation.busy || operation.uncertain || pending.length > 0 || !!operation.operation && ['awaiting_signature', 'submitted'].includes(operation.operation.state)); }, [onPendingChange, checkBusy, operation.busy, operation.uncertain, pending.length, operation.operation?.state]);
  const canWrite = (action: ClinicalOperation['action']) => data?.writes?.[action] === true && (!doctor || action === 'append_version' && canAppend);
  const readOnly = !(['create_history', 'append_version', 'set_permissions'] as const).some(canWrite);
  async function prepare(input: ClinicalIntent) {
    if (!checkReadyNow()) throw new Error(text.checkSigning);
    if (!canWrite(input.action)) throw new Error(text.writesDisabledRead);
    const result = await operation.controller.prepare(doctor ? { ...input, historyId } : input);
    const prepared = operation.controller.snapshot();
    const showFinalReview = result.state === 'awaiting_signature' && !!result.review && !!result.sponsorship &&
      prepared.operation?.id === result.id && prepared.canSign;
    setEditing(null); setIndependentDraft(false); setSignReview(showFinalReview); setActionError('');
    setPreparedFocus({ identity, operationId: result.id }); return result;
  }
  async function reopenDraftPublication(id: string) {
    setActionError(''); setSignReview(false);
    try {
      const saved = data?.operations.find(value => value.id === id);
      if (saved) { operation.controller.reopen(saved); return; }
      const result = await clinicalApi<{ operation: ClinicalOperation }>('/api/private-clinical-operations/' + id);
      const verified = verifiedClinicalOperation(result.operation, { id, action: 'append_version' });
      operation.controller.reopen(verified);
    } catch { setActionError(text.draftPublicationUnverified); }
  }
  async function act(action: 'sign' | 'cancel' | 'check' | 'retry' | 'prepareSaved') {
    setActionError('');
    if (action === 'prepareSaved' && !checkReadyNow()) {
      setActionError(text.checkSigning);
      return;
    }
    if (action !== 'check' && (action === 'prepareSaved' ? readOnly : !current || !canWrite(current.action))) {
      setActionError(text.writesDisabled);
      return;
    }
    try { await operation.controller[action](); setSignReview(false); }
    catch (failure) { setActionError(localizedClinicalError(failure, language, text.resultUnverified)); }
  }
  const groups = new Map<string, ClinicalVersion[]>();
  for (const entry of canRead ? data?.entries ?? [] : []) groups.set(entry.entryId, [...(groups.get(entry.entryId) ?? []), entry]);
  const chronology = [...groups.values()].map(versions => versions.sort((a, b) => b.version - a.version)).sort((a, b) => b[0].createdAt - a[0].createdAt);
  const shown = chronology.filter(([head]) => filter === 'all' || filter === 'notes' && !!head.note || filter === 'files' && !head.note || filter === 'mine' && (doctor ? head.author === wallet.address : head.source === 'patient') || filter === 'doctor' && head.source === 'doctor');
  const current = operation.operation;
  if (!identity) return <p role="status" className="text-sm text-slate-600">{text.signIn}</p>;
  return <section key={identity} className="space-y-5 pb-4" aria-labelledby="clinical-history-title">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h1 id="clinical-history-title" className="text-2xl font-semibold tracking-tight text-slate-900">{text.record}</h1><p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-600">{doctor ? text.doctorDescription : text.patientDescription}</p></div>
      <button type="button" disabled={snapshot.loading || operation.busy || checkBusy} onClick={snapshot.refresh} className={`${button} border border-slate-200 bg-white text-slate-700`}>{snapshot.loading ? text.checking : text.refresh}</button>
    </header>
    <ClinicalDraftWorkspace key={identity + ':drafts'} identity={identity} currentHistoryId={data?.history?.id}
      role={doctor ? 'doctor' : 'patient'} canPublish={!newBlocked && canWrite('append_version')}
      disabled={operation.busy || operation.uncertain || pending.length > 0}
      onPrepare={prepare} onReopen={id => void reopenDraftPublication(id)} />
    {doctor && historyId && !operation.accessLost && <section aria-label={text.privateDrafting} className="space-y-3">
      {!independentDraft && <button type="button" disabled={operation.busy || operation.uncertain || pending.length > 0 || !!data?.context && !data.context.canAppend} onClick={() => setIndependentDraft(true)} className={button + ' border border-sky-200 bg-white text-sky-800'}>{text.writePrivateDraft}</button>}
      {independentDraft && <ClinicalDraftEntryForm key={identity + ':independent'} identity={identity} target={{ historyId }} historyId={historyId} role="doctor"
        disabled={operation.busy || operation.uncertain} readOnly={!canWrite('append_version') || blocked}
        disablePrescriptionLookup={!data || !canRead}
        onPrepare={prepare} onCancel={() => setIndependentDraft(false)} />}
    </section>}
    {(snapshot.error || operation.accessLost) && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm leading-relaxed text-rose-800">{operation.accessLost ? operation.error : snapshot.error}<p className="mt-2">{text.earlierInformation} {operation.accessLost ? doctor ? text.recheckDoctorAccess : text.signInAgain : text.refreshHistory}</p></div>}
    {data && (readOnly || data.history && !canWrite('append_version') && !canWrite('set_permissions')) && <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-relaxed text-sky-900">{doctor && canRead && !canAppend ? text.readOnly : data.history ? data.draftsEnabled ? text.publishingDisabled : text.demoReadOnly : text.demoCreateDisabled}</p>}
    {checkScope && canWrite('append_version') && <ClinicalSigningCheck key={checkKey} scope={checkScope} verified={checkPassed} disabled={blocked || pending.length > 0 || !!operation.operation && ['awaiting_signature', 'submitted'].includes(operation.operation.state)} onStatusChange={checkStatus} />}
    {snapshot.loading && <p role="status" className="rounded-xl bg-sky-50 p-4 text-sm text-sky-800">{text.loading}</p>}
    {current || operation.uncertain ? <section aria-label={text.currentAttempt} className={`space-y-3 rounded-xl border p-4 ${current?.state === 'confirmed' ? 'border-emerald-200 bg-emerald-50' : 'border-sky-200 bg-sky-50'}`}>
      <h2 ref={operationHeading} tabIndex={-1} className="font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{current ? `${text[actionLabels[current.action]]} · ${current.state === 'cancelled' && current.errorCode === 'signature_request_expired' ? text.signatureExpired : text[stateLabels[current.state]]}` : text.preparationUnverified}</h2>
      {operation.uncertain && <p className="text-sm leading-relaxed text-slate-700">{text.uncertain}</p>}
      {current?.state === 'submitted' && <p role="status" className="text-sm leading-relaxed text-slate-700">{text.pendingNotice}</p>}
      {current?.state === 'confirmed' && <p role="status" className="text-sm leading-relaxed text-emerald-900">{text.confirmedNotice}</p>}
      {current?.state === 'awaiting_signature' && <p className="text-sm leading-relaxed text-slate-700">{text.signatureRequestExpires}: {recordDate(language, current.expiresAt)} · {text.chileTime}</p>}
      {current?.state === 'awaiting_signature' && <ClinicalPreparedReview operation={current} />}
      {current?.state === 'awaiting_signature' && !operation.canSign && <p className="text-sm leading-relaxed text-slate-700">{text.signingConditions}</p>}
      {(operation.error || actionError) && <p role="alert" className="text-sm leading-relaxed text-rose-800">{operation.error || actionError}</p>}
      {current && <ReceiptLink hash={current.transactionHash} />}
      <div className="flex flex-col flex-wrap gap-3 sm:flex-row">
        {(operation.uncertain || current && ['awaiting_signature', 'submitted'].includes(current.state)) && <button type="button" disabled={operation.busy || operation.accessLost} onClick={() => void act('check')} className={`${button} border border-sky-200 bg-white text-sky-800`}>{text.checkConfirmation}</button>}
        {!readOnly && !current && operation.uncertain && <button type="button" disabled={operation.busy} onClick={() => void act('prepareSaved')} className={`${button} border border-sky-200 bg-white text-sky-800`}>{text.resumePreparation}</button>}
        {!readOnly && current?.state === 'submitted' && !operation.uncertain && <button type="button" disabled={operation.busy} onClick={() => void act('retry')} className={`${button} border border-sky-200 bg-white text-sky-800`}>{text.retrySubmission}</button>}
        {!readOnly && current?.state === 'awaiting_signature' && !operation.uncertain && <>
          {operation.canSign && <button ref={signButton} type="button" disabled={operation.busy || blocked} onClick={() => setSignReview(true)} className={`${button} bg-sky-700 text-white`}>{text.reviewConfirmation}</button>}
          <button type="button" disabled={operation.busy} onClick={() => void act('cancel')} className={`${button} border border-slate-200 bg-white text-slate-700`}>{text.cancelSignature}</button>
        </>}
      </div>
      {!readOnly && signReview && operation.canSign && current?.state === 'awaiting_signature' && <div onKeyDown={event => { if (event.key === "Escape" && !operation.busy) { setSignReview(false); signButton.current?.focus(); } }} className="space-y-3 border-t border-sky-200 pt-4">
        <h2 ref={signHeading} tabIndex={-1} className="font-semibold text-slate-900">{text[actionLabels[current.action]]}</h2><p className="text-sm leading-relaxed text-slate-700">{text.confirmPrefix} {current.action === 'create_history' ? text.confirmCreate : current.action === 'set_permissions' ? text.confirmPermissions : text.confirmContribution} {text.confirmSuffix}</p>
        <div className="flex flex-col gap-3 sm:flex-row"><button type="button" disabled={operation.busy || blocked} onClick={() => void act('sign')} className={`${button} bg-sky-700 text-white`}>{operation.busy ? text.confirming : text.confirmPrivy}</button><button type="button" disabled={operation.busy} onClick={() => { setSignReview(false); signButton.current?.focus(); }} className={`${button} border border-sky-200 bg-white text-sky-800`}>{text.back}</button></div>
      </div>}
    </section> : null}
    {data && !doctor && !data.history && <section className="rounded-2xl border border-sky-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold text-slate-900">{text.startHistory}</h2><p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-600">{text.startHistoryDescription}</p><button type="button" disabled={newBlocked || !canWrite('create_history')} onClick={() => void prepare({ action: 'create_history' }).catch(failure => setActionError(localizedClinicalError(failure, language, text.resultUnverified)))} className={`${button} mt-4 bg-sky-700 text-white`}>{text.prepareHistory}</button></section>}
    {data?.history && <>
      <section aria-labelledby="clinical-history-created-title" className="min-w-0 rounded-2xl border border-sky-200 bg-sky-50/50 p-4 sm:p-5">
        <h2 id="clinical-history-created-title" className="font-semibold text-slate-900">{doctor ? text.selectedHistory : text.historyCreated}</h2>
        {!doctor && <div className="mt-4 space-y-2"><label htmlFor="clinical-share-id" className="block text-sm font-medium text-slate-700">{text.shareCode}</label><input id="clinical-share-id" readOnly value={data.history.id} onFocus={event => event.currentTarget.select()} className="min-h-11 w-full rounded-xl border border-sky-200 bg-white px-3 py-2 font-mono text-sm text-slate-700" /><p className="text-sm text-slate-600">{text.shareHelp}</p></div>}
        {doctor && <p className="mt-2 text-sm text-slate-700">{text.read}: {canRead ? text.readAllowed : text.noPermission} · {text.append}: {canAppend ? text.appendAllowed : text.noPermission}</p>}
        {canRead && <p className="mt-2 text-sm text-slate-600">{text.created}: {recordDate(language, data.history.createdAt)} · {text.chileTime}</p>}
        {canRead && (data.history.creationTransactionHash && /^[a-f0-9]{64}$/i.test(data.history.creationTransactionHash)
          ? <ReceiptLink hash={data.history.creationTransactionHash} label={text.creationReceipt} />
          : !doctor && <p className="mt-2 text-sm text-slate-600">{text.creationReceiptUnavailable}</p>)}
      </section>
      {!canRead && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{text.appendOnly}</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">{canRead && <label className="block min-w-0 flex-1 text-sm font-medium text-slate-700" htmlFor="clinical-filter">{text.filter}<select id="clinical-filter" value={filter} onChange={event => setFilter(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-600 sm:max-w-xs"><option value="all">{text.filterAll}</option><option value="mine">{text.filterMine}</option><option value="doctor">{text.filterDoctors}</option><option value="notes">{text.filterNotes}</option><option value="files">{text.filterFiles}</option></select></label>}{canAppend && <button type="button" disabled={newBlocked} onClick={event => { formOpener.current = event.currentTarget; setEditing('new'); }} className={`${button} w-full bg-sky-700 text-white sm:w-auto`}>{text.addEntry}</button>}</div>
      {editing && canAppend && !operation.accessLost && (data.draftsEnabled ? <ClinicalDraftEntryForm key={typeof editing === 'string' ? 'new' : `${editing.entryId}:${editing.version}`} identity={identity} target={{ historyId: data.history.id, patient: data.history.patient }} correction={editing === 'new' ? null : editing} historyId={historyId} role={doctor ? 'doctor' : 'patient'} disabled={newBlocked} readOnly={!canWrite('append_version')} onPrepare={prepare} onCancel={() => { setEditing(null); formOpener.current?.focus(); }} /> : <ClinicalEntryForm key={typeof editing === 'string' ? 'new' : `${editing.entryId}:${editing.version}`} correction={editing === 'new' ? null : editing} historyId={historyId} role={doctor ? 'doctor' : 'patient'} disabled={newBlocked} readOnly={!canWrite('append_version')} onPrepare={prepare} onCancel={() => { setEditing(null); formOpener.current?.focus(); }} />)}
      <p className="text-sm text-slate-500">{canRead ? text.contentVerified : text.permissionsVerified} {new Date(data.verifiedAt).toLocaleString(numberLocale(language), { timeZone: 'America/Santiago' })} · {text.chileTime}</p>
      {canRead && shown.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-600">{chronology.length ? text.noFilteredEntries : text.noEntries}</div>}
      {canRead && <ol aria-label={text.chronology} className="space-y-4">
        {shown.map(([head, ...previous]) => <li key={head.entryId} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><VersionContent entry={head} onUnavailable={snapshot.refresh} historyId={historyId} />
          {canAppend && head.canCorrect && (!doctor || head.author === wallet.address) && <button type="button" disabled={newBlocked || head.prescriptionUnavailable} onClick={event => { formOpener.current = event.currentTarget; setEditing(head); }} className={`${button} mt-3 border border-sky-200 text-sky-800`}>{text.correct}</button>}
          {previous.length > 0 && <details className="mt-3 border-t border-slate-100 pt-2"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-600">{text.show} {previous.length} {previous.length === 1 ? text.previousVersion : text.previousVersions}</summary><div className="mt-2 space-y-5 border-l-2 border-sky-100 pl-4">{previous.map(entry => <VersionContent key={entry.version} entry={entry} onUnavailable={snapshot.refresh} historyId={historyId} />)}</div></details>}
        </li>)}
      </ol>}
      {data.grantsUnavailable && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">{text.grantsUnavailable}</p>}
      {!doctor && renderPermissions?.({ grants: data.grants, disabled: newBlocked || !canWrite('set_permissions'), readOnly: !canWrite('set_permissions'), onPrepare: prepare })}
    </>}
    {pending.filter(op => op.id !== current?.id).map(op => <section key={op.id} className="rounded-xl border border-sky-200 bg-sky-50 p-4"><p className="text-sm font-semibold text-slate-800">{text[actionLabels[op.action]]} · {text[stateLabels[op.state]]}</p><button type="button" disabled={operation.busy || operation.uncertain} onClick={() => { operation.controller.reopen(op); setSignReview(false); }} className={`${button} mt-3 border border-sky-200 bg-white text-sky-800`}>{text.pendingAttempt}</button></section>)}
    {actionError && !current && !operation.uncertain && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>}
    <p className="max-w-prose text-xs leading-relaxed text-slate-500">{text.demoNotice}</p>
  </section>;
}
