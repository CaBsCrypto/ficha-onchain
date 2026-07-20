// Date helpers shared by the Licencias tab and the license card.

export function addDaysPatient(iso: string, n: number): string {
  // Take the date portion — iso may be a full timestamp from Neon; appending
  // 'T12:00:00' to that yields an Invalid Date and toISOString() throws.
  const d = new Date((iso ?? '').slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fmtDatePatient(iso: string): string {
  const d = new Date(iso + (iso.includes('T') ? '' : 'T12:00:00'));
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}
