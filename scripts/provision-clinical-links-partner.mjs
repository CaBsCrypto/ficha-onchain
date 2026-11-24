import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { clinicalLinksMigrationConnection } from './lib/clinical-links-migration.mjs';

const DEFAULT_PARTNER = 'trustleaf-cannabis';
const LEGACY_SCOPES = ['clinical-links:bind', 'clinical-links:write', 'clinical-links:read', 'proofs:verify'];
const SHARED_SCOPES = ['clinical-links:enroll', 'clinical-links:write', 'clinical-links:read', 'proofs:verify', 'prescriptions:issue'];

async function main() {
  const sql = neon(clinicalLinksMigrationConnection());
  const key = process.env.TRUSTLEAF_CLINICAL_LINKS_PARTNER_CREDENTIAL ?? '';
  if (!/^tl_clp_[0-9a-f]{64}$/.test(key)) throw new Error('partner_credential_invalid');
  const hash = createHash('sha256').update(key).digest('hex');
  const partnerId = process.env.TRUSTLEAF_CLINICAL_LINKS_PARTNER_ID ?? DEFAULT_PARTNER;
  if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(partnerId)) throw new Error('partner_id_invalid');
  if (process.argv.includes('--revoke')) {
    await sql`UPDATE clinical_link_partner_credentials SET revoked_at = now()
      WHERE partner_id = ${partnerId} AND key_hash = ${hash} AND revoked_at IS NULL`;
    console.log('Clinical links pilot credential revocation complete.');
    return;
  }
  const origin = process.env.TRUSTLEAF_CLINICAL_LINKS_PARTNER_ORIGIN ?? '';
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.hostname === 'trustleaf.org' || url.hostname.endsWith('.trustleaf.org') ||
      ['trustleaf.vercel.app', 'trustleaf-demo.vercel.app'].includes(url.hostname)) {
    throw new Error('partner_origin_invalid');
  }
  const clientId = process.env.TRUSTLEAF_CLINICAL_LINKS_PARTNER_PRIVY_CLIENT_ID ?? null;
  const name = process.env.TRUSTLEAF_CLINICAL_LINKS_PARTNER_NAME ?? (partnerId === DEFAULT_PARTNER ? 'TrustLeaf Cannabis' : '');
  if (!name || name.length > 120 || (clientId && (!/^[A-Za-z0-9_-]{6,128}$/.test(clientId) ||
      clientId === process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID)) || (!clientId && partnerId !== DEFAULT_PARTNER)) {
    throw new Error('partner_configuration_invalid');
  }
  const allowed = clientId ? SHARED_SCOPES : LEGACY_SCOPES;
  const scopes = process.argv.slice(2).map(arg => arg.startsWith('--scope=') ? arg.slice(8) : '');
  if (scopes.some(scope => !allowed.includes(scope))) throw new Error('partner_scope_invalid');
  const assigned = scopes.length ? scopes : allowed.filter(scope => partnerId === DEFAULT_PARTNER || scope !== 'prescriptions:issue');
  await sql.transaction([
    sql`INSERT INTO clinical_link_partners (partner_id, name, origin, privy_app_client_id) VALUES (${partnerId}, ${name}, ${origin}, ${clientId})
      ON CONFLICT (partner_id) DO UPDATE SET privy_app_client_id = excluded.privy_app_client_id
      WHERE clinical_link_partners.origin = excluded.origin AND clinical_link_partners.privy_app_client_id IS NULL`,
    sql`INSERT INTO clinical_link_partner_credentials (key_hash, partner_id, scopes, expires_at)
      SELECT ${hash}, partner_id, ${assigned}::TEXT[], now() + interval '24 hours'
      FROM clinical_link_partners WHERE partner_id = ${partnerId} AND active AND origin = ${origin}
        AND privy_app_client_id IS NOT DISTINCT FROM ${clientId}
      ON CONFLICT (key_hash) DO NOTHING`,
  ]);
  const [credential] = await sql`SELECT 1 FROM clinical_link_partner_credentials c JOIN clinical_link_partners p USING (partner_id)
    WHERE c.key_hash = ${hash} AND c.partner_id = ${partnerId} AND c.expires_at > now() AND c.revoked_at IS NULL
      AND c.scopes @> ${assigned}::TEXT[] AND p.active AND p.origin = ${origin}
      AND p.privy_app_client_id IS NOT DISTINCT FROM ${clientId}`;
  if (!credential) throw new Error('partner_credential_not_issued');
  console.log('Clinical links pilot credential is active.');
}

main().catch(() => {
  console.error('Clinical links pilot credential setup failed. Check the isolated target, registered origin and credential state.');
  process.exitCode = 1;
});
