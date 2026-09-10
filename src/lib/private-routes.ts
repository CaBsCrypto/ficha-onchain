// Retired routes stay retired independently of the private write switch.
const pages=new Set(['/','/login','/doctor','/patient','/admin','/admin/doctors','/legal']);
const api=new Set(['/api/privy/stellar-wallet','/api/doctor-status','/api/doctors','/api/appointments',
  '/api/prescription-bookings','/api/doctor/profile','/api/doctor/availability','/api/doctor/slots',
  '/api/doctor/onboarding','/api/admin/whoami','/api/admin/doctors','/api/admin/doctor-authorizations','/api/admin/doctor-onboarding','/api/admin/migrate',
  '/api/private-prescriptions','/api/private-operations']);
export function isPrivatePortalPath(pathname:string,localDiagnostic=false) {
  const path=pathname.replace(/\/+$/,'')||'/';
  if(path.startsWith('/_next/')||/^\/(?:images|fonts|icons|models)\//.test(path)||/^\/[^/]+\.(?:svg|png|jpg|webp|ico|woff2?)$/i.test(path))return true;
  if(localDiagnostic&&(path==='/privy-check'||path==='/api/privy/signing-check'))return true;
  if(pages.has(path)||api.has(path))return true;
  if(/^\/api\/private-consultations\/[1-9][0-9]*$/.test(path))return true;
  const id='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  return new RegExp(`^/api/private-operations/${id}(?:/confirm)?$`,'i').test(path)||new RegExp(`^/api/private-prescriptions/${id}/document$`,'i').test(path);
}
