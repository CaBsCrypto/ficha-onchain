/**
 * Access log — who looked at a patient's clinical data. SERVER ONLY.
 * ---------------------------------------------------------------------------
 * Ley 20.584 gives the patient the right to know who accessed their ficha.
 * Every read of clinical content by someone OTHER than the patient lands here:
 * a doctor opening the historial, an admin feed, an external center reading
 * via MCP. The patient's own reads are not logged — the right protects them
 * from others, and logging self-reads would bury the signal in noise.
 *
 * Fire-and-forget by design: an access-log failure must never break the read
 * it describes (the log is evidence, not a gate). But it fails LOUDLY to the
 * server console — a silently dead audit trail is worse than none, because it
 * looks like nobody ever looked.
 */
import { getDb } from "@/lib/db";

export type AccessorRole = "doctor" | "admin" | "center" | "system";

export interface AccessEvent {
  /** App-side patient key. Null for MCP accesses, which are rut-keyed. */
  patientEmail?: string | null;
  /** MCP-side patient key (HMAC del RUT). Null for app accesses. */
  patientRutHash?: string | null;
  /** Who looked: an email, an org name, a wallet. Never a secret. */
  accessor: string;
  accessorRole: AccessorRole;
  /** What they did, dot-namespaced: 'ficha.entries.read', 'mcp.read_records'… */
  action: string;
  detail?: string | null;
}

export function logAccess(e: AccessEvent): void {
  void (async () => {
    try {
      const sql = getDb();
      await sql`
        INSERT INTO api_access_log
          (patient_email, patient_rut_hash, accessor, accessor_role, action, detail)
        VALUES
          (${e.patientEmail ?? null}, ${e.patientRutHash ?? null},
           ${e.accessor}, ${e.accessorRole}, ${e.action}, ${e.detail ?? null})`;
    } catch (err) {
      console.error("[access-log] no se pudo registrar el acceso:", err);
    }
  })();
}
