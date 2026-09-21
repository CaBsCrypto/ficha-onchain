import { describe, expect, it } from 'vitest';
import { footerHrefFor } from '@/components/landing/Footer';

const retired = ['/verify', '/traction', '/mcp', '/licenses', '/ficha', '/dispensary', '/sandbox'];

describe('footer link resolution', () => {
  it.each([
    ['Verify', '#'], ['Verificar', '#'], ['Verificação', '#'],
    ['Trabaja con nosotros', '#'], ['Careers', '#'],
    ['Privacidad', '#'], ['Términos', '#'], ['Seguridad', '#'],
  ])('%s never resolves to a live navigation target', (label, expected) => {
    expect(footerHrefFor(label)).toBe(expected);
  });

  it.each(['Problema', 'Problem'])('%s anchors to the problem section', (label) => expect(footerHrefFor(label)).toBe('#problem'));
  it.each(['Solución', 'Solution', 'Solução'])('%s anchors to the solution section', (label) => expect(footerHrefFor(label)).toBe('#solution'));
  it.each(['Cómo funciona', 'How it works'])('%s anchors to the how section', (label) => expect(footerHrefFor(label)).toBe('#how'));

  it('preserves current public access routes without exposing administration', () => {
    expect(footerHrefFor('Médicos')).toBe('/login/doctor');
    expect(footerHrefFor('Pacientes')).toBe('/login/patient');
    expect(footerHrefFor('Admin')).toBe('#');
  });

  it('never emits a path retired with 410 in production', () => {
    const labels = ['Problem', 'Solution', 'How it works', 'Roadmap', 'Verify', 'About', 'Contact', 'Careers', 'Privacy', 'Terms', 'Security',
      'Problema', 'Solución', 'Cómo funciona', 'Verificar', 'Nosotros', 'Contacto', 'Trabaja con nosotros', 'Privacidad', 'Términos', 'Seguridad'];
    for (const label of labels) {
      const href = footerHrefFor(label);
      expect(retired.some(p => href.startsWith(p)), `${label} -> ${href}`).toBe(false);
    }
  });
});
