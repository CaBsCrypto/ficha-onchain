/** Browser-safe identity of one immutable issuance attempt, reused on retry. */
export interface PrescriptionIssuance {
  id: string;
  issuedAt: string;
}

export function isPrescriptionIssuance(value: unknown): value is PrescriptionIssuance {
  if (!value || typeof value !== "object") return false;
  const { id, issuedAt } = value as PrescriptionIssuance;
  return typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) &&
    typeof issuedAt === "string" && Number.isFinite(Date.parse(issuedAt)) &&
    new Date(issuedAt).toISOString() === issuedAt;
}

/** Store only identity + digest in the tab, never the clinical payload. */
export function pendingIssuance(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  payloadDigest: string,
): PrescriptionIssuance {
  const saved = storage.getItem(key);
  if (saved) {
    const pending = JSON.parse(saved);
    if (!isPrescriptionIssuance(pending.issuance) || pending.digest !== payloadDigest) {
      throw new Error("Hay una emisión pendiente. Conserva sus datos y verifica su resultado antes de crear otra receta.");
    }
    return pending.issuance;
  }
  const issuance = { id: crypto.randomUUID(), issuedAt: new Date().toISOString() };
  storage.setItem(key, JSON.stringify({ issuance, digest: payloadDigest }));
  return issuance;
}
