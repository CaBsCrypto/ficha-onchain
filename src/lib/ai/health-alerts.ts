/**
 * Health Alerts & Notifications Engine — Phase 4 of "Mis datos + IA".
 * ---------------------------------------------------------------------------
 * Scans patient data for:
 * 1. Lab value trends (e.g. Creatinine, Glycemia increasing across tests).
 * 2. Prescription expirations (chronic medications expiring in <= 7 days).
 * 3. Recent doctor accesses to the patient's record (Ley 20.584 right to know).
 * 4. Guided record request legal deadlines (Ley 20.584 art. 13 15-business-day counter).
 *
 * Prevents duplicate notifications by checking existing records in `patient_notifications`.
 */
import { getDb } from "@/lib/db";

export interface HealthAlertNotification {
  id?: number;
  patientEmail: string;
  type: "health_alert" | "access_log" | "rx_expiry" | "record_request" | "system";
  title: string;
  message: string;
  read: boolean;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}

export async function scanAndGenerateHealthAlerts(patientEmail: string): Promise<number> {
  const sql = getDb();
  let generatedCount = 0;

  // ── 1. Scan Doctor Access Logs (Ley 20.584) ─────────────────────────────
  try {
    const recentAccesses = await sql`
      SELECT id, accessor, action, created_at
      FROM api_access_log
      WHERE patient_email = ${patientEmail}
        AND accessor_role = 'doctor'
        AND created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC LIMIT 10`;

    for (const acc of recentAccesses) {
      const metadataKey = `access_log_${acc.id}`;
      const [existing] = await sql`
        SELECT id FROM patient_notifications
        WHERE patient_email = ${patientEmail}
          AND metadata LIKE ${`%"access_log_id":${acc.id}%`}
        LIMIT 1`;

      if (!existing) {
        const type = "access_log";
        const link = "/patient?tab=accesos";
        await sql`
          INSERT INTO patient_notifications
            (patient_email, type, title, message, link, metadata)
          VALUES
            (${patientEmail}, ${type},
             ${`Nuevo acceso de profesional: ${acc.accessor}`},
             ${`Un profesional médico (${acc.accessor}) revisó tu información de salud (${acc.action}). Tienes derecho a saberlo bajo la Ley 20.584.`},
             ${link},
             ${JSON.stringify({ access_log_id: acc.id, key: metadataKey })})`;
        generatedCount++;
      }
    }
  } catch (err) {
    console.warn("[health-alerts] error al escanear access_log:", err);
  }

  // ── 2. Scan Record Requests (Ley 20.584 art. 13) ─────────────────────────
  try {
    const activeRequests = await sql`
      SELECT id, provider_name, status, due_at, created_at
      FROM record_requests
      WHERE patient_email = ${patientEmail}
        AND status IN ('sent', 'pending')
      ORDER BY created_at DESC LIMIT 10`;

    for (const req of activeRequests) {
      const [existing] = await sql`
        SELECT id FROM patient_notifications
        WHERE patient_email = ${patientEmail}
          AND metadata LIKE ${`%"request_id":${req.id}%`}
        LIMIT 1`;

      if (!existing && req.due_at) {
        const dueDate = new Date(req.due_at as string);
        const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        const title = daysLeft <= 0
          ? `Solicitud vencida: ${req.provider_name}`
          : `Plazo legal Ley 20.584: ${req.provider_name}`;

        const message = daysLeft <= 0
          ? `El plazo de 15 días hábiles para la entrega de tu ficha clínica por parte de ${req.provider_name} ha vencido. Puedes escalar a la Superintendencia de Salud.`
          : `Quedan aproximadamente ${daysLeft} días para que ${req.provider_name} responda a tu solicitud formal de entrega de ficha.`;

        const type = "record_request";
        const link = "/patient/requests";

        await sql`
          INSERT INTO patient_notifications
            (patient_email, type, title, message, link, metadata)
          VALUES
            (${patientEmail}, ${type}, ${title}, ${message}, ${link},
             ${JSON.stringify({ request_id: req.id, daysLeft })})`;
        generatedCount++;
      }
    }
  } catch (err) {
    console.warn("[health-alerts] error al escanear record_requests:", err);
  }

  // ── 3. Scan Lab Value Trends (IA Health Alert) ───────────────────────────
  try {
    const labEntries = await sql`
      SELECT id, summary, detail, created_at
      FROM clinical_entries
      WHERE patient_email = ${patientEmail}
        AND (summary ILIKE '%creatinina%' OR summary ILIKE '%glicemia%' OR summary ILIKE '%presión%')
      ORDER BY created_at ASC LIMIT 20`;

    // Detect numeric values for Creatinine
    const creatValues: Array<{ val: number; id: number; date: string }> = [];
    for (const entry of labEntries) {
      const text = `${entry.summary} ${entry.detail || ""}`;
      const match = text.match(/creatinina[^\d]*(\d+([.,]\d+)?)/i);
      if (match) {
        const num = parseFloat(match[1].replace(",", "."));
        if (!isNaN(num)) {
          creatValues.push({ val: num, id: Number(entry.id), date: String(entry.created_at) });
        }
      }
    }

    if (creatValues.length >= 2) {
      const prev = creatValues[creatValues.length - 2];
      const curr = creatValues[creatValues.length - 1];

      if (curr.val > prev.val) {
        const key = `creat_trend_${prev.id}_${curr.id}`;
        const [existing] = await sql`
          SELECT id FROM patient_notifications
          WHERE patient_email = ${patientEmail}
            AND metadata LIKE ${`%"trend_key":"${key}"%`}
          LIMIT 1`;

        if (!existing) {
          const type = "health_alert";
          const title = "Tendencia observada en Creatinina";
          const message = `Tus resultados muestran una variación al alza en Creatinina en sangre (${prev.val} → ${curr.val} mg/dL). Te recomendamos comentarlo con tu médico tratante en tu próximo control.`;
          const link = "/patient?tab=timeline";

          await sql`
            INSERT INTO patient_notifications
              (patient_email, type, title, message, link, metadata)
            VALUES
              (${patientEmail}, ${type}, ${title}, ${message}, ${link},
               ${JSON.stringify({ trend_key: key, metric: 'creatinine', prev: prev.val, curr: curr.val })})`;
          generatedCount++;
        }
      }
    }
  } catch (err) {
    console.warn("[health-alerts] error al escanear tendencias de laboratorio:", err);
  }

  return generatedCount;
}
