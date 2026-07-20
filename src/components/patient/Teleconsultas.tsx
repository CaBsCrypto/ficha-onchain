import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { VideoIcon } from "@/components/icons/PatientIcons";
import type { Consultation } from "@/lib/consultations/store";

export function Teleconsultas({ items }: { items: Consultation[] }) {
  return (
    <section aria-label="Teleconsultas" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Tus teleconsultas</h2>
      {items.map((c) => {
        const when = c.scheduledAt
          ? new Date(c.scheduledAt).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })
          : "A convenir";
        return (
          <Card key={c.id} className="p-0">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#1a73e8]/10 text-[#1a73e8]">
                    <VideoIcon />
                  </div>
                  <h3 className="text-base font-semibold text-ink">Consulta médica</h3>
                  <Badge tone={c.status === "completed" ? "muted" : "clinical"}>
                    {c.status === "completed" ? "Completada" : "Programada"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted">
                  <span className="font-medium">Cuándo:</span> {when}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span className="font-medium uppercase tracking-wide">Meet:</span>
                  <a href={c.meetLink} target="_blank" rel="noopener noreferrer"
                    className="min-w-0 truncate font-mono text-[#1a73e8] hover:underline">
                    {c.meetLink}
                  </a>
                  <span className="shrink-0 rounded bg-[#1a73e8]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#1a73e8]">
                    {c.meetingCode}
                  </span>
                </div>
              </div>
              <a href={c.meetLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1765cc]">
                <VideoIcon /> Abrir Meet
              </a>
            </div>
          </Card>
        );
      })}
    </section>
  );
}
