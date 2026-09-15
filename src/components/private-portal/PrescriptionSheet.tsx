import { localDate } from './client';
import { prescriptionLabel } from './state';
import type { PrescriptionDocument, PrivatePrescription, PrescriptionVerification as Verification } from './types';
import { PrescriptionVerification } from './PrescriptionVerification';

/** Shared, scoped presentation for the portal and browser printing. */
export const prescriptionStyles = `
.tl-rx{font:15px/1.6 system-ui,sans-serif;color:#334155;background:#fff;overflow-wrap:anywhere}
.tl-rx *{box-sizing:border-box}.tl-rx p,.tl-rx dl,.tl-rx dd,.tl-rx h4{margin:0}
.tl-rx header{padding:24px 28px 20px;border-bottom:1px solid #e2e8f0}
.tl-rx .rx-brand-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.tl-rx .rx-brand{font-size:19px;font-weight:750;letter-spacing:-.6px;color:#0f172a}.tl-rx .rx-brand span{color:#0284c7}
.tl-rx .rx-status{font-size:12px;font-weight:650;padding:4px 12px;border-radius:99px;background:#eff6ff;color:#1e40af}
.tl-rx .rx-active{background:#ecfdf5;color:#065f46}.tl-rx .rx-inactive{background:#fff1f2;color:#9f1239}
.tl-rx .rx-title{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:14px}.tl-rx h4{font-size:27px;font-weight:650;letter-spacing:-.7px;color:#0f172a}.tl-rx .rx-number{font-size:12px;color:#64748b}
.tl-rx .rx-body{padding:22px 28px}.tl-rx .rx-people{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:22px}
.tl-rx dt{font-size:12px;font-weight:600;color:#64748b}.tl-rx dd{white-space:pre-wrap;margin-top:4px}
.tl-rx .rx-people dd{font-size:15px;font-weight:600;color:#0f172a}
.tl-rx .rx-warning{border-left:2px solid #fda4af;padding-left:12px;color:#9f1239;font-size:13px;margin-bottom:20px}
.tl-rx .rx-treatment{background:#fff;border-left:3px solid #7dd3fc;padding:2px 0 2px 18px}
.tl-rx .rx-medication dt{color:#0369a1;letter-spacing:.8px;text-transform:uppercase;font-size:11px}
.tl-rx .rx-medication dd{font-size:22px;font-weight:650;color:#0f172a;line-height:1.45}
.tl-rx .rx-dose{border-top:1px solid #dbeaf3;padding-top:12px;margin-top:14px}.tl-rx .rx-dose dd{font-size:15px}
.tl-rx .rx-closing{display:flex;align-items:flex-start;gap:24px;padding-top:20px;margin-top:22px;border-top:1px solid #e2e8f0}.tl-rx .rx-instructions{flex:1;min-width:0}.tl-rx .rx-instructions dt{font-size:13px;color:#0f172a}.tl-rx .rx-instructions dd{line-height:1.75}
.tl-rx footer{border-top:1px solid #e2e8f0;padding:14px 28px;font-size:11px;color:#64748b}.tl-rx footer strong{color:#475569;font-weight:600}.tl-rx .rx-copy-note{display:none}
.tl-rx .rx-verification{display:flex;justify-content:flex-end;flex:0 0 96px;margin-top:0;break-inside:avoid;font-size:11px;color:#64748b}
.tl-rx .rx-verification figure{margin:0;width:96px;text-align:center}.tl-rx .rx-verification img{display:block;max-width:100%;height:auto}.tl-rx .rx-verification a{display:block}.tl-rx .rx-verification a:focus-visible{outline:2px solid #0284c7;outline-offset:3px}
@media(max-width:480px){.tl-rx .rx-closing{flex-direction:column;gap:12px}.tl-rx .rx-verification{align-self:flex-end;flex-basis:auto}.tl-rx header,.tl-rx .rx-body{padding:20px}.tl-rx footer{padding:14px 20px}.tl-rx .rx-people{grid-template-columns:1fr;gap:12px}.tl-rx h4{font-size:24px}}
@media print{@page{size:A4;margin:15mm}.tl-rx{font-size:11pt;overflow:visible}.tl-rx header,.tl-rx .rx-body,.tl-rx footer{padding-left:0;padding-right:0}.tl-rx .rx-people{grid-template-columns:1fr 1fr}.tl-rx dt{break-after:avoid}.tl-rx dd,.tl-rx p{orphans:3;widows:3}.tl-rx header,.tl-rx .rx-people{break-inside:avoid}.tl-rx .rx-treatment{box-decoration-break:clone;-webkit-box-decoration-break:clone}.tl-rx .rx-copy-note{display:block}}
`;

export function PrescriptionSheet({ document, prescription: listed, verification, onQrReady }: { document: PrescriptionDocument; prescription: PrivatePrescription; verification?: Verification; onQrReady?: (ready: boolean) => void }) {
  const prescription = verification ? { ...listed, rxId: verification.rxId, status: verification.status, expiresAt: verification.expiresAt, expired: verification.expired } : listed;
  const inactive = prescription.status === 'Revoked' || prescription.status === 'Blocked' || prescription.expired;
  const statusClass = inactive ? 'rx-inactive' : prescription.rxId != null && prescription.status === 'Active' ? 'rx-active' : '';
  return <><style>{prescriptionStyles}</style><article aria-label="Documento de receta privada" className="tl-rx">
    <header>
      <div className="rx-brand-row"><span className="rx-brand">Trust<span>Leaf</span></span>{!inactive && <span className={`rx-status ${statusClass}`}>{prescriptionLabel(prescription)}</span>}</div>
      <div className="rx-title"><h4>{prescription.rxId != null ? `Receta N.º ${prescription.rxId}` : 'Receta preparada'}</h4></div>
    </header>
    <div className="rx-body">
      {inactive && <p className="rx-warning">{prescriptionLabel(prescription)} · Se conserva como documento histórico.</p>}
      <dl className="rx-people">
        <div><dt>Paciente</dt><dd>{prescription.patientName}</dd></div>
        <div><dt>Médico emisor</dt><dd>{prescription.doctorName}</dd></div>
      </dl>

      <dl className="rx-treatment">
        <div className="rx-medication"><dt>Medicamento de prueba</dt><dd>{document.medication}</dd></div>
        <div className="rx-dose"><dt>Dosis e indicación</dt><dd>{document.dosage}</dd></div>
      </dl>
      <div className="rx-closing">
        <dl className="rx-instructions"><dt>Instrucciones</dt><dd>{document.instructions || 'Sin instrucciones adicionales'}</dd></dl>
        {verification && <PrescriptionVerification verification={verification} onQrReady={onQrReady} />}
      </div>
    </div>
    <footer><p>Vencimiento: {localDate(prescription.expiresAt)} · Hora de Chile</p><p><strong>Datos sintéticos · Sin uso clínico</strong> · Stellar Testnet</p><p className="rx-copy-note">El estado corresponde al momento de generar esta copia.</p></footer>
  </article></>;
}
