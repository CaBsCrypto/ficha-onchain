import { assertPrivateEnvironment, assertPrivateWrites, PrivateFlowError } from '@/lib/private-config';

export const CLINICAL_ID = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
export const CLINICAL_WASM = '29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0';
export function assertClinicalEnvironment(write = false) {
  assertPrivateEnvironment();
  if (process.env.TRUSTLEAF_CLINICAL_WEB_ENABLED !== 'true' || process.env.CLINICAL_HISTORY_PRIVATE_CONTRACT_ID !== CLINICAL_ID) {
    throw new PrivateFlowError('clinical_configuration_unavailable', 503);
  }
  if (write) assertPrivateWrites();
}
