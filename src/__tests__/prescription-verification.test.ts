import { createElement } from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrescriptionVerification, receiptUrl } from '@/components/private-portal/PrescriptionVerification';
import type { PrescriptionVerification as Verification } from '@/components/private-portal/types';

const sample: Verification = {network:'testnet',contract:'C'+'A'.repeat(55),rxId:'8',status:'Revoked',expiresAt:1900000000,expired:false,checkedAt:'2026-09-14T20:00:00Z',issuanceHash:'ab'.repeat(32),revocationHash:'cd'.repeat(32)};
describe('public prescription verification presentation',()=>{
  it('uses fixed Testnet URLs and rejects malformed hashes',()=>{
    expect(receiptUrl(sample.issuanceHash)).toBe(`https://stellar.expert/explorer/testnet/tx/${sample.issuanceHash}`);
    expect(receiptUrl('https://another.example')).toBeNull();expect(receiptUrl(null)).toBeNull();
  });
  it('prints full issuance and revocation hashes and a dated status',()=>{
    const html=renderToStaticMarkup(createElement(PrescriptionVerification,{verification:sample}));
    expect(html).toContain(sample.issuanceHash);expect(html).toContain(sample.revocationHash);
    expect(html).toContain('America/Santiago');expect(html).toContain('Revocada');
    expect(html).toContain('no publica el contenido privado');
  });
  it('does not invent a receipt for prepared documents or malformed hashes',()=>{
    const prepared=renderToStaticMarkup(createElement(PrescriptionVerification,{verification:{...sample,rxId:null,status:'Pending',issuanceHash:null,revocationHash:null}}));
    expect(prepared).toContain('Pendiente de emisión');expect(prepared).not.toContain('/tx/');expect(prepared).not.toContain('<img');
    const absent=renderToStaticMarkup(createElement(PrescriptionVerification,{verification:{...sample,issuanceHash:'bad',revocationHash:null}}));
    expect(absent).toContain('Recibo no disponible');expect(absent).not.toContain('/tx/');
  });
});
