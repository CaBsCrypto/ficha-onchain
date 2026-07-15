/**
 * POST /api/notify/license
 * ---------------------------------------------------------------------------
 * Sends an email notification to a patient when a doctor issues a medical
 * license (reposo laboral) on-chain.
 *
 * Body: {
 *   patientEmail: string
 *   patientName:  string
 *   dias:         number
 *   fechaInicio:  string        — ISO date
 *   fechaFin:     string        — ISO date
 *   cie10:        string
 *   tipo:         string        — 'Enfermedad'|'Accidente'|'Maternidad'
 *   doctorName:   string
 *   mode:         'onchain'|'simulated'
 *   docHash:      string
 *   docId?:       number | null
 *   explorer?:    string | null
 * }
 *
 * Requires RESEND_API_KEY — if absent returns { mode:"skipped" }.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LicenseNotifyBody {
  patientEmail: string;
  patientName:  string;
  dias:         number;
  fechaInicio:  string;
  fechaFin:     string;
  cie10:        string;
  tipo:         string;
  doctorName:   string;
  mode:         'onchain' | 'simulated';
  docHash:      string;
  docId?:       number | string | null;
  explorer?:    string | null;
}

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  // "2026-07-14" → "14 jul 2026"
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildHtml(b: LicenseNotifyBody): string {
  const isOnChain  = b.mode === 'onchain';
  const accent     = isOnChain ? '#7c3aed' : '#d97706';
  const badgeText  = isOnChain ? '⚡ Firmada on-chain en Stellar' : '📋 Emitida (modo demo)';
  const tipoColor: Record<string, string> = {
    Enfermedad:  '#0ea5e9',
    Accidente:   '#f97316',
    Maternidad:  '#ec4899',
  };
  const tipoClr = tipoColor[b.tipo] ?? '#64748b';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tu licencia médica — TrustLeaf</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0284c7,#0ea5e9);padding:28px 32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:12px;">
                    <div style="width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                      <span style="font-size:20px;">🍃</span>
                    </div>
                  </td>
                  <td>
                    <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">TrustLeaf</p>
                    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.7);">Licencia médica digital</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">
                Hola, ${escHtml(b.patientName.split(' ')[0] ?? b.patientName)} 👋
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#64748b;">
                Tu médico ha emitido una licencia médica. Puedes revisarla en tu portal TrustLeaf.
              </p>

              <!-- Badge -->
              <div style="display:inline-block;background:${isOnChain ? '#f3e8ff' : '#fefce8'};color:${accent};border:1px solid ${isOnChain ? '#ddd6fe' : '#fde68a'};border-radius:999px;padding:6px 14px;font-size:12px;font-weight:600;margin-bottom:20px;">
                ${badgeText}
              </div>

              <!-- License card -->
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px;">
                <!-- Tipo badge -->
                <div style="display:inline-block;background:${tipoClr}18;color:${tipoClr};border-radius:999px;padding:4px 12px;font-size:11px;font-weight:600;margin-bottom:12px;">
                  ${escHtml(b.tipo)}
                </div>

                <!-- Días -->
                <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:16px;">
                  <span style="font-size:40px;font-weight:800;color:#0f172a;line-height:1;">${b.dias}</span>
                  <span style="font-size:16px;color:#64748b;">días de reposo</span>
                </div>

                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" style="padding-bottom:12px;">
                      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Inicio</p>
                      <p style="margin:4px 0 0;font-size:14px;color:#1e293b;">${escHtml(formatDate(b.fechaInicio))}</p>
                    </td>
                    <td width="50%" style="padding-bottom:12px;">
                      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Fin</p>
                      <p style="margin:4px 0 0;font-size:14px;color:#1e293b;">${escHtml(formatDate(b.fechaFin))}</p>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:12px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td width="50%">
                            <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">CIE-10</p>
                            <p style="margin:4px 0 0;font-size:13px;color:#1e293b;">${escHtml(b.cie10)}</p>
                          </td>
                          <td width="50%">
                            <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Médico</p>
                            <p style="margin:4px 0 0;font-size:13px;color:#1e293b;">${escHtml(b.doctorName)}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Hash -->
              ${b.docId ? `<p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">Licencia <strong style="color:#0f172a;">#${b.docId}</strong> — anclada en Stellar Soroban</p>` : ''}
              <div style="background:#0f172a;border-radius:8px;padding:10px 14px;margin-bottom:24px;">
                <p style="margin:0;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#475569;margin-bottom:4px;">
                  ${isOnChain ? 'TX Hash' : 'Hash SHA-256'}
                </p>
                <p style="margin:0;font-family:monospace;font-size:11px;color:#e2e8f0;word-break:break-all;">${escHtml(b.docHash)}</p>
              </div>

              ${b.explorer ? `
              <div style="text-align:center;margin-bottom:24px;">
                <a href="${escHtml(b.explorer)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;border-radius:10px;padding:10px 20px;font-size:13px;font-weight:600;">
                  Ver en Stellar Expert →
                </a>
              </div>` : ''}

              <div style="text-align:center;">
                <a href="https://trustleaf.vercel.app/patient?tab=licencias" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:10px;padding:12px 28px;font-size:14px;font-weight:600;">
                  Ver en mi portal →
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                © 2026 Browns Studio · TrustLeaf · Stellar Testnet<br>
                Este correo fue generado automáticamente. No respondas a este mensaje.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function POST(request: Request) {
  let body: LicenseNotifyBody;
  try {
    body = await request.json() as LicenseNotifyBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { patientEmail, dias, cie10 } = body;
  if (!patientEmail || !dias || !cie10) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info('[notify/license] RESEND_API_KEY not set — skipping email to', patientEmail);
    return NextResponse.json({ mode: 'skipped', reason: 'no_api_key', to: patientEmail });
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from: 'TrustLeaf <noreply@trustleaf.app>',
      to: [patientEmail],
      subject: `Tu licencia médica de ${body.dias} días está lista — TrustLeaf`,
      html: buildHtml(body),
      text: `Hola ${body.patientName},\n\nTu médico ${body.doctorName} ha emitido una licencia médica de ${dias} días de reposo (${body.tipo}).\nVigencia: ${body.fechaInicio} → ${body.fechaFin}\n\nRevísala en: https://trustleaf.vercel.app/patient?tab=licencias\n\n© 2026 TrustLeaf`,
    });

    if (error) {
      console.error('[notify/license] Resend error:', error);
      return NextResponse.json({ mode: 'error', error: error.message }, { status: 500 });
    }

    return NextResponse.json({ mode: 'sent', id: data?.id, to: patientEmail });
  } catch (err) {
    console.error('[notify/license] unexpected error:', err);
    return NextResponse.json({ mode: 'error', error: String(err) }, { status: 500 });
  }
}
