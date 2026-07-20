export function LoadingList() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-3xl border border-slate-200/70 bg-white" />
      ))}
      <p className="text-center text-xs text-muted">Cargando desde Soroban…</p>
    </div>
  );
}
