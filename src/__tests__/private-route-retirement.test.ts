import {afterEach,describe,expect,it,vi} from 'vitest';
import {isPrivatePortalPath} from '@/lib/private-routes';
import {proxy} from '@/proxy';
import {NextRequest} from 'next/server';
afterEach(()=>vi.unstubAllEnvs());
const retired=[
  '/api/mint','/api/revoke','/api/relay','/api/mcp','/api/ficha','/api/licenses','/api/prescriptions/activate',
  '/api/prescriptions','/api/doctor/prescriptions','/api/stellar-wallet-binding','/api/consent','/api/consultations',
  '/api/admin/sandbox','/api/admin/mcp','/api/dispense','/api/dispensary','/api/ai/chat','/api/ai/extract',
  '/ficha','/licenses','/dispensary','/sandbox','/admin/licenses','/doctor/ficha','/patient/ficha','/patient/licenses',
];
describe('retired modules cannot return through the write kill switch',()=>{
  it.each(['true','false'])('blocks all retired API and page paths when writes=%s',flag=>{
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED',flag);vi.stubEnv('TRUSTLEAF_PRIVATE_PORTAL_ENABLED',flag);
    for(const path of retired){
      expect(isPrivatePortalPath(path),path).toBe(false);
      expect(isPrivatePortalPath(path+'/'),path+' trailing slash').toBe(false);
      const response=proxy(new NextRequest('https://trustleaf.example.test'+path));
      expect(response.status,path).toBe(410);
    }
  });
  it.each(['json','png','svg','ico','jpg','webp','woff2'])('does not treat a forbidden API with .%s suffix as a public asset',suffix=>{
    for(const path of ['/api/mcp','/api/ficha','/api/mint','/api/admin/sandbox','/api/doctor/legacy']){
      expect(isPrivatePortalPath(`${path}.${suffix}`)).toBe(false);
      expect(proxy(new NextRequest(`https://trustleaf.example.test${path}.${suffix}`)).status).toBe(410);
    }
  });
  it('allows the current appointment and operation lifecycle routes with exact resource IDs',()=>{
    const id='12121212-1212-4212-8212-121212121212';
    for(const path of ['/doctor','/patient','/admin/doctors','/api/admin/doctor-authorizations','/api/appointments','/api/doctor/availability','/api/doctor/slots',
      '/api/private-consultations/11',`/api/private-operations/${id}`,`/api/private-operations/${id}/confirm`,`/api/private-prescriptions/${id}/document`])expect(isPrivatePortalPath(path),path).toBe(true);
    for(const path of ['/api/private-consultations/0','/api/private-consultations/1/extra','/api/private-operations/not-a-uuid','/api/private-prescriptions/1/document'])expect(isPrivatePortalPath(path),path).toBe(false);
  });
  it('limits the signing diagnostic to the explicit local-only exception',()=>{
    expect(isPrivatePortalPath('/privy-check')).toBe(false);expect(isPrivatePortalPath('/api/privy/signing-check')).toBe(false);
    expect(isPrivatePortalPath('/privy-check',true)).toBe(true);expect(isPrivatePortalPath('/api/privy/signing-check',true)).toBe(true);
    vi.stubEnv('TRUSTLEAF_PRIVY_SIGNING_CHECK','true');vi.stubEnv('VERCEL','1');
    expect(proxy(new NextRequest('https://preview.example.test/api/privy/signing-check')).status).toBe(410);
  });
});
