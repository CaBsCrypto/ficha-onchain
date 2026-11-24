import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { clinicalLinksMigrationConnection } from './lib/clinical-links-migration.mjs';

const PARTNER = 'trustleaf-cannabis';
const SCOPES = ['clinical-links:bind', 'clinical-links:write', 'clinical-links:read', 'proofs:verify'];

async function main() {
  const sql = neon(clinicalLinksMigrationConnection());
  const key = process.env.TRUSTLEAF_CLINICAL_LINKS_PARTNER_CREDENTIAL ?? '';
  if (!/^tl_clp_[0-9a-f]{64}$/.test(key)) throw new Error('partner_credential_invalid');
  const hash = createHash('sha256').update(key).digest('hex');
  if (process.argv.includes('--revoke')) {
    await sql`UPDATE clinical_link_partner_credentials SET revoked_at = now()
      WHERE partner_id = ${PARTNER} AND key_hash = ${hash} AND revoked_at IS NULL`;
    console.log('Clinical links pilot credential revocation complete.');
    return;
  }
  const origin = process.env.TRUSTLEAF_CLINICAL_LINKS_PARTNER_ORIGIN ?? '';
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.hostname === 'cannabis.trustleaf.org') {
    throw new Error('partner_origin_invalid');
  }
  const scopes = process.argv.slice(2).map(arg => arg.startsWith('--scope=') ? arg.slice(8) : '');
  if (scopes.some(scope => !SCOPES.includes(scope))) throw new Error('partner_scope_invalid');
  await sql.transaction([
    sql`INSERT INTO clinical_link_partners (partner_id, name, origin) VALUES (${PARTNER}, 'TrustLeaf Cannabis', ${origin})
      ON CONFLICT (partner_id) DO NOTHING`,
    sql`INSERT INTO clinical_link_partner_credentials (key_hash, partner_id, scopes, expires_at)
      SELECT ${hash}, partner_id, ${scopes.length ? scopes : SCOPES}::TEXT[], now() + interval '24 hours'
      FROM clinical_link_partners WHERE partner_id = ${PARTNER} AND active AND origin = ${origin}
      ON CONFLICT (key_hash) DO NOTHING`,
  ]);
  const [credential] = await sql`SELECT 1 FROM clinical_link_partner_credentials c JOIN clinical_link_partners p USING (partner_id)
    WHERE c.key_hash = ${hash} AND c.partner_id = ${PARTNER} AND c.expires_at > now() AND c.revoked_at IS NULL
      AND p.active AND p.origin = ${origin}`;
  if (!credential) throw new Error('partner_credential_not_issued');
  console.log('Clinical links pilot credential is active.');
}

main().catch(() => {
  console.error('Clinical links pilot credential setup failed. Check the isolated target, registered origin and credential state.');
  process.exitCode = 1;
});
