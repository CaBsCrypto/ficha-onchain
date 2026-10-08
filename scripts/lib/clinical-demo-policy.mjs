export function requireClinicalDoctorWindow(authorized, record, nowSeconds = Math.floor(Date.now() / 1000)) {
  const end = Number(record?.valid_until);
  if (authorized !== true || record?.revoked !== false || !Number.isSafeInteger(end) ||
      !Number.isSafeInteger(nowSeconds) || end < nowSeconds + 900) throw Error('clinical_doctor_not_ready');
}
export function requireClinicalRunAvailable(runId, clinicalAttempts, prescriptionAttempts) {
  if (!Array.isArray(clinicalAttempts) || !Array.isArray(prescriptionAttempts) || prescriptionAttempts.length ||
      clinicalAttempts.some(row => row.run_id !== runId || row.state !== 'submitted')) throw Error('clinical_source_busy');
}
export function requireClinicalBalance(account, wallet) {
  const native = account?.balances?.filter(balance => balance.asset_type === 'native');
  const value = native?.[0]?.balance;
  if (account?.account_id !== wallet || native?.length !== 1 || typeof value !== 'string' ||
      !/^\d{1,16}(?:\.\d{1,7})?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) < 5) throw Error('clinical_account_not_ready');
}
