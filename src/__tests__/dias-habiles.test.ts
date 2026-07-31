/**
 * Cálculo de días hábiles (L-V) para el plazo de la Ley 20.584 art. 13.
 * Fechas construidas con new Date(y, m, d) — locales, sin sorpresas de UTC.
 */
import { describe, it, expect } from "vitest";
import {
  addBusinessDays,
  businessDaysUntil,
  dueDateFromSent,
  PLAZO_LEGAL_DIAS_HABILES,
} from "@/lib/dias-habiles";

describe("addBusinessDays", () => {
  it("salta el fin de semana: viernes + 1 hábil = lunes", () => {
    const viernes = new Date(2026, 6, 3); // vie 3 jul 2026
    expect(addBusinessDays(viernes, 1).getDay()).toBe(1); // lunes
    expect(addBusinessDays(viernes, 1).getDate()).toBe(6);
  });

  it("desde un sábado, 1 hábil cae el lunes siguiente", () => {
    const sabado = new Date(2026, 6, 4); // sáb 4 jul 2026
    const r = addBusinessDays(sabado, 1);
    expect(r.getDay()).toBe(1);
    expect(r.getDate()).toBe(6);
  });

  it("5 hábiles desde un lunes = lunes siguiente", () => {
    const lunes = new Date(2026, 6, 6); // lun 6 jul 2026
    const r = addBusinessDays(lunes, 5);
    expect(r.getDay()).toBe(1);
    expect(r.getDate()).toBe(13);
  });

  it("15 hábiles = 3 semanas calendario cuando parte en día de semana", () => {
    const lunes = new Date(2026, 6, 6);
    const r = addBusinessDays(lunes, 15);
    expect(r.getDate()).toBe(27); // lun 27 jul — exactamente 21 días después
    expect(r.getDay()).toBe(1);
  });

  it("no muta la fecha original", () => {
    const d = new Date(2026, 6, 6);
    addBusinessDays(d, 10);
    expect(d.getDate()).toBe(6);
  });
});

describe("dueDateFromSent", () => {
  it("aplica el plazo legal de 15 días hábiles", () => {
    const sent = new Date(2026, 6, 6);
    const due = dueDateFromSent(sent);
    expect(due.getTime()).toBe(addBusinessDays(sent, PLAZO_LEGAL_DIAS_HABILES).getTime());
  });
});

describe("businessDaysUntil", () => {
  it("cuenta solo días de semana", () => {
    const vie = new Date(2026, 6, 3);
    const lun = new Date(2026, 6, 6);
    expect(businessDaysUntil(vie, lun)).toBe(1); // sáb y dom no cuentan
  });

  it("devuelve 0 cuando el plazo ya venció", () => {
    const despues = new Date(2026, 6, 10);
    const antes = new Date(2026, 6, 6);
    expect(businessDaysUntil(despues, antes)).toBe(0);
  });

  it("la hora del día no resta un día completo", () => {
    const now = new Date(2026, 6, 6, 23, 30); // lun por la noche
    const due = new Date(2026, 6, 7, 0, 15);  // mar en la madrugada
    expect(businessDaysUntil(now, due)).toBe(1);
  });

  it("un plazo completo recién enviado muestra 15 hábiles", () => {
    const sent = new Date(2026, 6, 6, 12, 0);
    const due = dueDateFromSent(sent);
    expect(businessDaysUntil(sent, due)).toBe(PLAZO_LEGAL_DIAS_HABILES);
  });
});
