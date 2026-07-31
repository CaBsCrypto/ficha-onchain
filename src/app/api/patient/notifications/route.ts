/**
 * GET/PATCH /api/patient/notifications — Patient In-App Notifications API.
 * ---------------------------------------------------------------------------
 * GET: Fetches notifications list + unread count. Triggers proactive health alert scan.
 * PATCH: Marks a specific notification or all notifications as read.
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { resolveOwnerEmail } from "@/lib/auth/privy-auth";
import { scanAndGenerateHealthAlerts } from "@/lib/ai/health-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const claimedEmail = searchParams.get("patientEmail");

  const auth = await resolveOwnerEmail(request, claimedEmail);
  if ("error" in auth) return auth.error;

  const patientEmail = auth.email;

  try {
    // Proactively scan for new health alerts, expirations, and access logs
    await scanAndGenerateHealthAlerts(patientEmail);

    const sql = getDb();
    const rows = await sql`
      SELECT id, type, title, message, read, link, metadata, created_at
      FROM patient_notifications
      WHERE patient_email = ${patientEmail}
      ORDER BY created_at DESC LIMIT 50`;

    const unreadCountRow = await sql`
      SELECT COUNT(*)::int AS unread
      FROM patient_notifications
      WHERE patient_email = ${patientEmail} AND read = FALSE`;

    const unreadCount = Number(unreadCountRow[0]?.unread ?? 0);

    return NextResponse.json({
      success: true,
      unreadCount,
      notifications: rows,
    });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[api/patient/notifications GET]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

interface PatchBody {
  notificationId?: number;
  markAllRead?: boolean;
  patientEmail?: string;
}

export async function PATCH(request: Request) {
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "cuerpo JSON inválido" }, { status: 400 });
  }

  const auth = await resolveOwnerEmail(request, body.patientEmail);
  if ("error" in auth) return auth.error;

  const patientEmail = auth.email;

  try {
    const sql = getDb();

    if (body.markAllRead) {
      await sql`
        UPDATE patient_notifications
        SET read = TRUE
        WHERE patient_email = ${patientEmail} AND read = FALSE`;

      return NextResponse.json({ success: true, markedAll: true });
    }

    const notificationId = Number(body.notificationId);
    if (!notificationId || isNaN(notificationId)) {
      return NextResponse.json(
        { error: "notificationId o markAllRead es obligatorio" },
        { status: 400 }
      );
    }

    await sql`
      UPDATE patient_notifications
      SET read = TRUE
      WHERE id = ${notificationId} AND patient_email = ${patientEmail}`;

    return NextResponse.json({ success: true, notificationId });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[api/patient/notifications PATCH]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
