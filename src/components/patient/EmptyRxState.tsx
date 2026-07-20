import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PillIcon } from "@/components/icons/PatientIcons";

export function EmptyRxState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <Card className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-muted">
        <PillIcon className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold text-ink">Aún no tienes recetas</h2>
      <p className="mt-2 text-sm text-muted">
        Cuando un médico emita una prescripción a tu wallet, aparecerá aquí, leída directamente desde Stellar Soroban.
      </p>
      {error && <p className="mt-3 text-xs text-amber-600">Detalle: {error}</p>}
      <Button variant="secondary" className="mt-5" onClick={onRetry}>Actualizar</Button>
    </Card>
  );
}
