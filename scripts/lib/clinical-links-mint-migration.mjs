export function clinicalLinkMintStatements(sql) {
  return [
    sql`CREATE TABLE IF NOT EXISTS clinical_partner_prescriptions (
      id UUID PRIMARY KEY,
      partner_id TEXT NOT NULL,
      binding_id UUID NOT NULL,
      partner_patient_ref UUID NOT NULL,
      patient_user_id TEXT NOT NULL,
      doctor_user_id TEXT NOT NULL,
      appointment_id INTEGER NOT NULL UNIQUE REFERENCES prescription_booking_requests(appointment_id) ON DELETE RESTRICT,
      consultation_ref UUID NOT NULL,
      document_id TEXT NOT NULL CHECK (document_id ~ '^[A-Za-z0-9_-]{16,64}$'),
      document_version INTEGER NOT NULL CHECK (document_version > 0),
      commitment TEXT NOT NULL CHECK (commitment ~ '^[0-9a-f]{64}$' AND commitment !~ '^0+$'),
      issuance_id TEXT NOT NULL UNIQUE REFERENCES prescription_booking_requests(issuance_id) ON DELETE RESTRICT,
      consent_request_id UUID NOT NULL UNIQUE,
      mint_request_id UUID NOT NULL UNIQUE,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (binding_id, partner_id) REFERENCES clinical_partner_bindings(binding_id, partner_id),
      UNIQUE (partner_id, consultation_ref),
      UNIQUE (partner_id, document_id, document_version)
    )`,
    sql`CREATE INDEX IF NOT EXISTS clinical_partner_prescriptions_patient
      ON clinical_partner_prescriptions(patient_user_id, created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS clinical_partner_prescriptions_doctor
      ON clinical_partner_prescriptions(doctor_user_id, created_at DESC)`,
  ];
}
