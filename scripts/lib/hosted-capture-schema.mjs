// This targeted migration is shared by the dev script and the authenticated hosted migration.
import { CLINICAL_RESILIENCE_SCHEMA_SQL } from './clinical-resilience-schema.mjs';

export const HOSTED_CAPTURE_SCHEMA_SQL = [
  ...CLINICAL_RESILIENCE_SCHEMA_SQL,
  `CREATE TABLE IF NOT EXISTS hosted_capture_manifests (
    sha256 TEXT PRIMARY KEY CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    run_id UUID NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('create','grant-note','pdf','appointment','attest','close')),
    bytes BYTEA NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 8192),
    predecessor_sha256 TEXT REFERENCES hosted_capture_manifests(sha256),
    base_sha256 TEXT REFERENCES hosted_capture_manifests(sha256),
    base_receipt_hash TEXT CHECK (base_receipt_hash ~ '^[a-f0-9]{64}$'),
    expires_at BIGINT NOT NULL CHECK (expires_at > 0),
    staged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS hosted_capture_requests (
    request_id UUID PRIMARY KEY,
    sha256 TEXT NOT NULL REFERENCES hosted_capture_manifests(sha256),
    phase TEXT NOT NULL CHECK (phase IN ('create','grant-note','pdf','attest','issuance','close'))
  )`,
  `CREATE TABLE IF NOT EXISTS hosted_capture_verifications (
    sha256 TEXT PRIMARY KEY REFERENCES hosted_capture_manifests(sha256),
    predecessor_sha256 TEXT NOT NULL REFERENCES hosted_capture_manifests(sha256),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS hosted_capture_activations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sha256 TEXT NOT NULL REFERENCES hosted_capture_manifests(sha256),
    phase TEXT NOT NULL CHECK (phase IN ('create','grant-note','pdf','appointment','attest','issuance','close','shutdown')),
    activated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (sha256, phase)
  )`,
  `CREATE OR REPLACE FUNCTION trustleaf_hosted_capture_immutable() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'hosted_capture_immutable'; END $$`,
  `DO $$ DECLARE relation TEXT;
    BEGIN
      FOREACH relation IN ARRAY ARRAY['hosted_capture_manifests','hosted_capture_requests','hosted_capture_verifications','hosted_capture_activations'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS hosted_capture_immutable ON %I', relation);
        EXECUTE format('CREATE TRIGGER hosted_capture_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION trustleaf_hosted_capture_immutable()', relation);
      END LOOP;
    END $$`,
];
