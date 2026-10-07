export function requireClinicalDoctorWindow(authorized, record, nowSeconds = Math.floor(Date.now() / 1000)) {
  const end = Number(record?.valid_until);
  if (authorized !== true || record?.revoked !== false || !Number.isSafeInteger(end) ||
      !Number.isSafeInteger(nowSeconds) || end < nowSeconds + 900) throw Error('clinical_doctor_not_ready');
}
export function requireClinicalRunAvailable(runId, clinicalAttempts, prescriptionAttempts) {
  if (!Array.isArray(clinicalAttempts) || !Array.isArray(prescriptionAttempts) || prescriptionAttempts.length ||
      clinicalAttempts.some(row => row.run_id !== runId || row.state !== 'submitted')) throw Error('clinical_source_busy');
}
