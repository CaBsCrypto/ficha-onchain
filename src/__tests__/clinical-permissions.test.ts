import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClinicalPermissions } from '@/components/private-portal/ClinicalPermissions';
import { describe, expect, it } from 'vitest';
import type { ClinicalGrant } from '@/types/clinical';
import { clinicalPermissionCanReview, clinicalPermissionChange, clinicalPermissionChanged, clinicalPermissionError,
  clinicalPermissionKey, initialClinicalPermissionDraft } from '@/components/private-portal/clinical-permission-state';
const grant: ClinicalGrant = { doctorId: 7, doctorName: 'Médico de prueba', address: 'G' + 'A'.repeat(55),
  authorized: true, canRead: false, canAppend: false, revision: 0 };

describe('patient clinical permission drafts', () => {
  it('starts from observed permission flags without mutating the snapshot', () => {
    const draft = initialClinicalPermissionDraft(grant); draft.canRead = true;
    expect(grant.canRead).toBe(false); expect(grant.canAppend).toBe(false);
  });
  it.each([{ canRead: true, canAppend: false }, { canRead: false, canAppend: true }, { canRead: true, canAppend: true }])('preserves independent flags in %j', draft => {
    expect(clinicalPermissionChange(grant, draft)).toEqual({ action: 'set_permissions', doctorId: 7, expectedRevision: 0, ...draft });
  });
  it('does not prepare an unchanged draft', () => {
    const draft = initialClinicalPermissionDraft(grant);
    expect(clinicalPermissionCanReview(grant, draft)).toBe(false);
    expect(clinicalPermissionChanged(grant, draft)).toBe(false);
    expect(() => clinicalPermissionChange(grant, draft)).toThrow('clinical_permission_unchanged');
  });
  it('allows partial revocation for a currently authorized doctor', () => {
    const observed = { ...grant, canRead: true, canAppend: true, revision: 9 };
    expect(clinicalPermissionChange(observed, { canRead: true, canAppend: false })).toMatchObject({ canRead: true, canAppend: false, expectedRevision: 9 });
  });
  it('allows full withdrawal even after the doctor authorization has expired', () => {
    const expired = { ...grant, authorized: false, canRead: true, canAppend: true, revision: 11 };
    expect(clinicalPermissionCanReview(expired, { canRead: false, canAppend: false })).toBe(true);
    expect(clinicalPermissionChange(expired, { canRead: false, canAppend: false })).toMatchObject({ canRead: false, canAppend: false, expectedRevision: 11 });
  });
  it('blocks new/preserved positive permissions for a doctor without current authorization', () => {
    for (const draft of [{ canRead: true, canAppend: false }, { canRead: false, canAppend: true }]) {
      const expired = { ...grant, authorized: false, canRead: true, canAppend: true };
      expect(clinicalPermissionCanReview(expired, draft)).toBe(false);
      expect(() => clinicalPermissionChange(expired, draft)).toThrow('clinical_permission_withdrawal_only');
    }
  });
  it('binds a change to the observed revision and doctor id, never to a supplied wallet', () => {
    const prepared = clinicalPermissionChange({ ...grant, revision: 2 }, { canRead: true, canAppend: false });
    expect(prepared).toEqual({ action: 'set_permissions', doctorId: 7, canRead: true, canAppend: false, expectedRevision: 2 });
    expect(prepared).not.toHaveProperty('doctor'); expect(prepared).not.toHaveProperty('requestId');
  });
  it.each([{ doctorId: 0 }, { doctorId: 1.5 }, { revision: -1 }, { revision: NaN }])('rejects invalid snapshot identifiers %j', patch => {
    expect(() => clinicalPermissionChange({ ...grant, ...patch }, { canRead: true, canAppend: false })).toThrow('clinical_permission_invalid');
  });
  it('resets mounted drafts when revision, identity, flags or authorization changes', () => {
    for (const patch of [{ doctorId: 8 }, { address: 'G' + 'B'.repeat(55) }, { revision: 1 }, { canRead: true }, { canAppend: true }, { authorized: false }]) {
      expect(clinicalPermissionKey({ ...grant, ...patch })).not.toBe(clinicalPermissionKey(grant));
    }
    expect(clinicalPermissionKey({ ...grant, doctorName: 'Same identity with corrected name' })).toBe(clinicalPermissionKey(grant));
  });
  it('keeps current flags unchanged after preparing a permission change', () => {
    const observed = { ...grant }; clinicalPermissionChange(observed, { canRead: true, canAppend: false });
    expect(observed).toEqual(grant);
  });
  it('converts conflicts and failures to actionable Spanish messages without provider payloads', () => {
    expect(clinicalPermissionError(new Error('clinical_permission_conflict'))).toContain('Actualiza el historial');
    expect(clinicalPermissionError(new Error('doctor_not_authorized'))).toContain('puedes retirar');
    expect(clinicalPermissionError(new Error('provider secret=PRIVATE_DATA'))).not.toContain('PRIVATE_DATA');
    expect(clinicalPermissionError(new Error('private_writes_paused'))).toContain('temporalmente pausados');
  });
});

describe('clinical permission accessible presentation', () => {
  const render = (grants: ClinicalGrant[], disabled = false) => renderToStaticMarkup(createElement(ClinicalPermissions, {
    grants, disabled, onPrepare: async () => ({ prepared: true }),
  }));
  it('shows the empty state without inventing doctors or permissions', () => {
    const html = render([]);
    expect(html).toContain('Sin médicos autorizados disponibles');
    expect(html).not.toContain('type="checkbox"'); expect(html).not.toContain('type="submit"');
  });
  it('distinguishes homonymous doctors by the complete accessible wallet and visible shortened wallet', () => {
    const other = { ...grant, doctorId: 8, address: 'G' + 'B'.repeat(55) };
    const html = render([grant, other]);
    expect(html).toContain(grant.address); expect(html).toContain(other.address);
    expect(html).toContain('GAAAAAAA…AAAAAAAA'); expect(html).toContain('GBBBBBBB…BBBBBBBB');
    expect(html.match(/Elegir permisos para Médico de prueba/g)).toHaveLength(2);
  });
  it('labels independent native checkboxes and distinguishes observed permissions from the draft', () => {
    const html = render([{ ...grant, canRead: true }]);
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toContain('Leer mi historial'); expect(html).toContain('Agregar información');
    expect(html).toContain('Permisos consultados'); expect(html).toContain('Revisar cambio de permisos');
    expect(html).not.toContain('Permisos actualizados');
  });
  it('disables the fieldset when the parent has an operation or verification failure', () => {
    const html = render([grant], true);
    expect(html).toMatch(/<fieldset[^>]+disabled=""/);
    expect(html).toMatch(/<button[^>]+type="submit"[^>]+disabled=""/);
  });
  it('keeps an expired doctor visible for withdrawal and explains the downloaded-copy limit', () => {
    const html = render([{ ...grant, authorized: false, canRead: true, revision: 2 }]);
    expect(html).toContain('Sin autorización vigente'); expect(html).toContain('desmarcando ambas opciones');
    expect(html).toContain('No elimina copias');
  });
});
