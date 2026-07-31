/**
 * Días hábiles chilenos para plazos legales (Ley 20.584 art. 13).
 * ---------------------------------------------------------------------------
 * El prestador tiene 15 días hábiles para entregar la copia de la ficha.
 * "Hábil" aquí es lunes a viernes; los feriados chilenos se IGNORAN a
 * propósito: la lista cambia año a año (feriados irrenunciables, regionales,
 * los que el Congreso agrega por ley puntual) y mantenerla desactualizada es
 * peor que no tenerla — un plazo calculado sin feriados siempre es igual o
 * más corto que el real, así que el aviso al paciente nunca llega tarde.
 */

/** Suma `n` días hábiles (L-V) a una fecha, sin mutar la original. */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from.getTime());
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay(); // 0 = domingo, 6 = sábado
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

/** Días hábiles (L-V) que quedan entre `now` y `due`. 0 si ya venció. */
export function businessDaysUntil(now: Date, due: Date): number {
  if (now.getTime() >= due.getTime()) return 0;
  let count = 0;
  const d = new Date(now.getTime());
  // Comparamos por día calendario para que la hora del día no reste un día.
  d.setHours(0, 0, 0, 0);
  const end = new Date(due.getTime());
  end.setHours(0, 0, 0, 0);
  while (d.getTime() < end.getTime()) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/** Plazo legal del art. 13: 15 días hábiles desde el envío. */
export const PLAZO_LEGAL_DIAS_HABILES = 15;

export function dueDateFromSent(sentAt: Date): Date {
  return addBusinessDays(sentAt, PLAZO_LEGAL_DIAS_HABILES);
}
