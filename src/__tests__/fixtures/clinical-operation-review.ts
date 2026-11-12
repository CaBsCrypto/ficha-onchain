import type { ClinicalOperation, ClinicalNote } from '@/types/clinical';
/** Synthetic authenticated-server DTO fixture. Never creates keys, reservations or signatures. */
export function reviewedOperation(operation: ClinicalOperation, note: ClinicalNote = { title:'Antecedente sintético',text:'Información de prueba',eventDate:null }): ClinicalOperation {
  if (operation.state !== 'awaiting_signature') return operation;
  const author=operation.signing?.address ?? 'G'+'A'.repeat(55);
  const preparedAt=Math.min(Math.floor(Date.now()/1000), operation.expiresAt-1);
  const review: NonNullable<ClinicalOperation['review']> = {
    network:'testnet',contractId:'C'+'A'.repeat(55),historyId:'9'.repeat(64),patient:author,author,operationId:'2'.repeat(64),
    ...(operation.action==='append_version'?{entryId:'1'.repeat(64),version:1}:{}),
    content:operation.action==='append_version'?{kind:'note',note}:operation.action==='set_permissions'?{kind:'permissions',doctor:'G'+'B'.repeat(55),canRead:false,canAppend:false,expectedRevision:6}:{kind:'history'},
  };
  return { sponsorship:{maxFeeStroops:'4001000',quotePreparedAt:preparedAt,quoteExpiresAt:Math.min(preparedAt+90,operation.expiresAt)},review,...operation };
}
