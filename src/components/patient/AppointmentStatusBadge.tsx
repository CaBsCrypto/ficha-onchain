import type { DBAppointment } from "./types";

export function AppointmentStatusBadge({ status }: { status: DBAppointment['status'] }) {
  const map: Record<DBAppointment['status'], { label: string; cls: string }> = {
    scheduled:   { label: 'Agendada',   cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
    in_progress: { label: 'En curso',   cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
    completed:   { label: 'Completada', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    cancelled:   { label: 'Cancelada',  cls: 'bg-rose-50 text-rose-600 ring-rose-200' },
  };
  const { label, cls } = map[status] ?? map.scheduled;
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}
