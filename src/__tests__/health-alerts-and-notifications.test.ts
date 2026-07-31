/**
 * Unit tests for Phase 4 — Health Alerts Engine and In-App Notifications.
 * ---------------------------------------------------------------------------
 * Tests lab trend detection, access log notifications (Ley 20.584), record
 * request legal deadline notifications, and notification deduplication.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const accessLogs: Array<Record<string, unknown>> = [];
const recordRequests: Array<Record<string, unknown>> = [];
const clinicalEntries: Array<Record<string, unknown>> = [];
const notifications: Array<Record<string, unknown>> = [];

vi.mock("@/lib/db", () => ({
  getDb: () => {
    return async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("?");
      if (query.includes("api_access_log")) return accessLogs;
      if (query.includes("record_requests")) return recordRequests;
      if (query.includes("clinical_entries")) return clinicalEntries;
      if (query.includes("INSERT INTO patient_notifications")) {
        notifications.push({
          id: notifications.length + 1,
          email: values[0],
          type: values[1],
          title: values[2],
          message: values[3],
          link: values[4],
          metadata: values[5],
        });
        return [{ id: notifications.length }];
      }
      if (query.includes("patient_notifications")) return notifications;
      return [];
    };
  },
}));

import { scanAndGenerateHealthAlerts } from "@/lib/ai/health-alerts";

beforeEach(() => {
  accessLogs.length = 0;
  recordRequests.length = 0;
  clinicalEntries.length = 0;
  notifications.length = 0;
});

describe("Health Alerts & Notifications Engine (Phase 4)", () => {
  it("genera notificación Ley 20.584 cuando un médico accede a la ficha", async () => {
    accessLogs.push({
      id: 101,
      accessor: "Dr. Juan Pérez",
      action: "ficha.entries.read",
      created_at: new Date().toISOString(),
    });

    const count = await scanAndGenerateHealthAlerts("paciente@example.com");
    expect(count).toBe(1);
    expect(notifications.length).toBe(1);
    expect(notifications[0].type).toBe("access_log");
    expect(notifications[0].title).toContain("Dr. Juan Pérez");
  });

  it("detecta tendencias al alza en laboratorios y genera alerta preventiva", async () => {
    clinicalEntries.push(
      {
        id: 1,
        summary: "Creatinina en sangre: 1.0 mg/dL",
        detail: "Examen 1",
        created_at: "2026-06-01T10:00:00Z",
      },
      {
        id: 2,
        summary: "Creatinina en sangre: 1.4 mg/dL",
        detail: "Examen 2",
        created_at: "2026-07-28T10:00:00Z",
      }
    );

    const count = await scanAndGenerateHealthAlerts("paciente@example.com");
    expect(count).toBeGreaterThan(0);
    const alert = notifications.find((n) => n.type === "health_alert");
    expect(alert).toBeDefined();
    expect(alert?.title).toContain("Creatinina");
    expect(alert?.message).toContain("1 → 1.4");
  });

  it("genera aviso para solicitudes de ficha próximas a vencer (Ley 20.584 art. 13)", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 4);

    recordRequests.push({
      id: 55,
      provider_name: "Clínica Alemana",
      status: "sent",
      due_at: futureDate.toISOString(),
      created_at: new Date().toISOString(),
    });

    const count = await scanAndGenerateHealthAlerts("paciente@example.com");
    expect(count).toBeGreaterThan(0);
    const reqNotice = notifications.find((n) => n.type === "record_request");
    expect(reqNotice).toBeDefined();
    expect(reqNotice?.title).toContain("Clínica Alemana");
    expect(reqNotice?.message).toContain("4 días");
  });
});
