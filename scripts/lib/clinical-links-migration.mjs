import { databaseConnectionString } from './database-connection.mjs';

export function clinicalLinksMigrationConnection(env = process.env) {
  const connection = databaseConnectionString(env);
  try {
    const database = new URL(connection ?? '');
    if (env.TRUSTLEAF_CLINICAL_LINKS_PILOT_ENABLED !== 'true' ||
        !['preview', 'test'].includes(env.TRUSTLEAF_ENV ?? '') ||
        (env.VERCEL_ENV && (env.VERCEL_ENV !== 'preview' || env.TRUSTLEAF_ENV !== 'preview')) ||
        env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet' || !env.TRUSTLEAF_DATABASE_URL ||
        !['postgres:', 'postgresql:'].includes(database.protocol) ||
        !/^[a-z0-9.-]+\.neon\.tech$/.test(database.hostname) ||
        database.hostname !== env.TRUSTLEAF_DB_HOST || database.hostname !== env.TRUSTLEAF_CLINICAL_LINKS_DB_HOST ||
        /ep-(rapid-shadow-ahq94785|lingering-water-ahzh89z5)/.test(database.hostname) ||
        (env.PROD_DB_HOST_GUARD && database.hostname.includes(env.PROD_DB_HOST_GUARD)) ||
        [...database.searchParams.keys()].some(key => !['sslmode', 'channel_binding', 'connect_timeout', 'pgbouncer'].includes(key))) {
      throw Error();
    }
    return connection;
  } catch {
    throw new Error('clinical_links_pilot_target_not_authorized');
  }
}

/** Isolated preview migration, invoked only through the named migrate.mjs step. */
export function migrateClinicalLinksPilot(sql) {
  return sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS clinical_link_partners (
      partner_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      origin TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true
    )`,
    sql`CREATE TABLE IF NOT EXISTS clinical_link_partner_credentials (
      key_hash TEXT PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
      partner_id TEXT NOT NULL REFERENCES clinical_link_partners(partner_id),
      scopes TEXT[] NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      CHECK (scopes <@ ARRAY['clinical-links:bind','clinical-links:write','clinical-links:read','proofs:verify']::TEXT[])
    )`,
    sql`CREATE TABLE IF NOT EXISTS clinical_partner_bindings (
      binding_id UUID PRIMARY KEY,
      partner_id TEXT NOT NULL REFERENCES clinical_link_partners(partner_id),
      patient_user_id TEXT NOT NULL,
      partner_actor_ref TEXT CHECK (partner_actor_ref ~ '^[0-9a-f]{64}$'),
      partner_patient_ref UUID UNIQUE,
      claim_code_hash TEXT UNIQUE CHECK (claim_code_hash ~ '^[0-9a-f]{64}$'),
      confirmation_hash TEXT CHECK (confirmation_hash ~ '^[0-9a-f]{64}$'),
      confirmation_attempts INTEGER NOT NULL DEFAULT 0 CHECK (confirmation_attempts BETWEEN 0 AND 5),
      status TEXT NOT NULL CHECK (status IN ('pending','claimed','active','revoked')),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (binding_id, partner_id),
      CHECK (status <> 'active' OR (partner_actor_ref IS NOT NULL AND partner_patient_ref IS NOT NULL))
    )`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS clinical_partner_bindings_one_active_patient
      ON clinical_partner_bindings (partner_id, patient_user_id) WHERE status = 'active'`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS clinical_partner_bindings_one_active_actor
      ON clinical_partner_bindings (partner_id, partner_actor_ref) WHERE status = 'active'`,
    sql`CREATE INDEX IF NOT EXISTS clinical_partner_bindings_patient
      ON clinical_partner_bindings (patient_user_id, created_at DESC)`,
    sql`CREATE TABLE IF NOT EXISTS clinical_partner_links (
      link_ref UUID PRIMARY KEY,
      partner_id TEXT NOT NULL,
      binding_id UUID NOT NULL,
      resource_ref TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category = 'cannabis.prescription'),
      clinical_status TEXT NOT NULL CHECK (clinical_status IN ('active','revoked')),
      revision INTEGER NOT NULL CHECK (revision > 0),
      document_revision INTEGER NOT NULL CHECK (document_revision > 0 AND document_revision <= revision),
      occurred_at TIMESTAMPTZ NOT NULL,
      UNIQUE (partner_id, resource_ref),
      FOREIGN KEY (binding_id, partner_id) REFERENCES clinical_partner_bindings(binding_id, partner_id)
    )`,
    sql`CREATE TABLE IF NOT EXISTS clinical_link_events (
      partner_id TEXT NOT NULL REFERENCES clinical_link_partners(partner_id),
      event_id UUID NOT NULL,
      binding_id UUID NOT NULL,
      payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
      link_ref UUID NOT NULL REFERENCES clinical_partner_links(link_ref),
      revision INTEGER NOT NULL CHECK (revision > 0),
      result TEXT NOT NULL CHECK (result IN ('applied','stale')),
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (partner_id, event_id),
      FOREIGN KEY (binding_id, partner_id) REFERENCES clinical_partner_bindings(binding_id, partner_id)
    )`,
    sql`CREATE TABLE IF NOT EXISTS clinical_link_anchors (
      commitment TEXT PRIMARY KEY CHECK (commitment ~ '^[0-9a-f]{64}$'),
      link_ref UUID NOT NULL REFERENCES clinical_partner_links(link_ref),
      document_revision INTEGER NOT NULL CHECK (document_revision > 0),
      state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','confirmed','unavailable')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      transaction_xdr TEXT,
      transaction_hash TEXT CHECK (transaction_hash ~ '^[0-9a-f]{64}$'),
      confirmed_at TIMESTAMPTZ,
      UNIQUE (link_ref, document_revision),
      CHECK (state <> 'confirmed' OR (confirmed_at IS NOT NULL AND transaction_hash IS NOT NULL))
    )`,
    sql`CREATE INDEX IF NOT EXISTS clinical_link_anchors_pending
      ON clinical_link_anchors (available_at) WHERE state = 'pending'`,
    sql`CREATE TABLE IF NOT EXISTS clinical_link_audit (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      partner_id TEXT REFERENCES clinical_link_partners(partner_id),
      actor_type TEXT NOT NULL CHECK (actor_type IN ('patient','partner')),
      actor_ref TEXT NOT NULL,
      operation TEXT NOT NULL,
      outcome TEXT NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ]);
}
