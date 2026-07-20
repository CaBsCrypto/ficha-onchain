import { formatLedgerDate } from "@/lib/stellar/status";
import { AlertTriangleIcon, ClockIcon } from "@/components/icons/PatientIcons";
import type { PatientRx } from "./types";

export function ExpiryAlerts({ items }: { items: PatientRx[] }) {
  const expired = items.filter((rx) => rx.expired);
  const expiringSoon = items.filter((rx) => rx.expiringSoon);
  if (expired.length === 0 && expiringSoon.length === 0) return null;
  return (
    <div className="space-y-3">
      {expired.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div>
            <p className="font-semibold">
              {expired.length === 1 ? "Tienes 1 receta expirada sin dispensar" : `Tienes ${expired.length} recetas expiradas sin dispensar`}
            </p>
            <p className="mt-0.5 text-rose-600/90">
              Solicita a tu médico una nueva prescripción antes de acudir a la farmacia.
            </p>
          </div>
        </div>
      )}
      {expiringSoon.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">
              {expiringSoon.length === 1 ? "1 receta vence pronto" : `${expiringSoon.length} recetas vencen pronto`}
            </p>
            <p className="mt-0.5 text-amber-700/90">
              {expiringSoon.length === 1
                ? `Vence ${formatLedgerDate(expiringSoon[0].expiresAt)} (en ${Math.max(0, expiringSoon[0].daysLeft)} día${expiringSoon[0].daysLeft === 1 ? "" : "s"}).`
                : "Algunas de tus recetas vencen en los próximos días."}{" "}
              Dispénsalas a tiempo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
