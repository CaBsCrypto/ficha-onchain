import { describe, expect, it } from 'vitest';
import { legacyLoginDestination } from '@/lib/auth/login-route';
import { isPrivatePortalPath } from '@/lib/private-routes';

describe('role entry routes', () => {
  it.each(['patient', 'doctor', 'admin'])('preserves a legacy %s destination and language', role => {
    expect(legacyLoginDestination({ role, lang: 'pt' })).toBe(`/login/${role}?lang=pt`);
    expect(isPrivatePortalPath(`/login/${role}`)).toBe(true);
  });
  it('defaults to patient and never redirects to arbitrary caller URLs', () => {
    expect(legacyLoginDestination({})).toBe('/login/patient');
    expect(legacyLoginDestination({ role: '//evil.test', lang: 'x', next: 'https://evil.test' })).toBe('/login/patient');
    expect(legacyLoginDestination({ role: ['admin', 'patient'] })).toBe('/login/patient');
    expect(isPrivatePortalPath('/login/pharmacy')).toBe(false);
    expect(isPrivatePortalPath('/login/admin/extra')).toBe(false);
  });
});
