import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/db';
import { canBookHostedAppointment, classifyHostedAppointment } from '@/lib/regular-appointments';

const { readHostedCaptureActive, loadHostedPrivateRxScope } = vi.hoisted(() => ({
  readHostedCaptureActive: vi.fn(),
  loadHostedPrivateRxScope: vi.fn(),
}));
vi.mock('../../scripts/lib/hosted-capture-store.mjs', async importOriginal => ({
  ...(await importOriginal<typeof import('../../scripts/lib/hosted-capture-store.mjs')>()), readHostedCaptureActive,
}));
vi.mock('../../scripts/lib/digital-cabs-rx-scope.mjs', async importOriginal => ({
  ...(await importOriginal<typeof import('../../scripts/lib/digital-cabs-rx-scope.mjs')>()), loadHostedPrivateRxScope,
}));

const patient = { userId: 'patient', email: 'patient@example.test' };
const doctor = { userId: 'doctor', email: 'doctor@example.test' };
const anotherPatient = { userId: 'another', email: 'another@example.test' };
const booking = { doctorId: 3, date: '2027-06-15', timeSlot: '09:00', type: 'Presencial' };
const scope = { phase: 'appointment', policyHash: 'approved', doctorId: 3, patient, slot: booking };

function fixture() {
  const query = vi.fn().mockResolvedValue([]);
  return { query, sql: { query } as unknown as Sql };
}

beforeEach(() => {
  vi.stubEnv('TRUSTLEAF_HOSTED_CAPTURE_ENABLED','true');
  readHostedCaptureActive.mockResolvedValue({
    phase: 'appointment', sha256: 'approved', approvalSha256: 'approved', patient, doctor,
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  });
  loadHostedPrivateRxScope.mockReturnValue(scope);
});
afterEach(() => vi.unstubAllEnvs());

it('keeps the approved reservation and its actors on the hosted route', async () => {
  const { sql } = fixture();
  await expect(classifyHostedAppointment(sql,{actor:patient,booking})).resolves.toEqual({kind:'scoped',scope});
  await expect(classifyHostedAppointment(sql,{actor:patient,booking:{...booking,timeSlot:'09:15'}})).resolves.toEqual({kind:'protected'});
  await expect(canBookHostedAppointment(sql,patient)).resolves.toBe(true);
  await expect(canBookHostedAppointment(sql,doctor)).resolves.toBe(false);
});

it('protects an overlapping ordinary reservation while allowing another doctor', async () => {
  const { sql, query } = fixture();
  query.mockResolvedValueOnce([{id:3}]).mockResolvedValueOnce([{reserved:true}]);
  await expect(classifyHostedAppointment(sql,{actor:anotherPatient,booking:{...booking,timeSlot:'08:50'}})).resolves.toEqual({kind:'protected'});
  expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(query.mock.calls[1][1]).toEqual([3,'2027-06-15','08:50','09:00']);
  await expect(classifyHostedAppointment(sql,{actor:anotherPatient,booking:{...booking,doctorId:4}})).resolves.toEqual({kind:'regular'});
});

it('keeps already booked hosted rows protected after the scope closes', async () => {
  const { sql, query } = fixture();
  query.mockResolvedValue([{sha256:'approved'}]);
  await expect(classifyHostedAppointment(sql,{actor:doctor,appointmentId:7})).resolves.toEqual({kind:'scoped',scope});
  readHostedCaptureActive.mockResolvedValue(null);
  await expect(classifyHostedAppointment(sql,{actor:doctor,appointmentId:7})).resolves.toEqual({kind:'protected'});
  expect(query.mock.calls[0][1]).toEqual([7,doctor.userId,doctor.email]);
});
