import 'server-only';
import { assertClinicalFileStructure } from '../../../scripts/lib/clinical-file-validation.mjs';
import { PrivateFlowError } from '@/lib/private-config';
import type { ClinicalFile } from '@/types/clinical';

/** New uploads only. Historical versions continue to use their existing integrity protocol. */
export async function validateNewClinicalFile(file: ClinicalFile): Promise<void> {
  const suffix = file.fileName.toLowerCase().split('.').pop();
  const allowed = file.mediaType === 'application/pdf' ? ['pdf'] : file.mediaType === 'image/png' ? ['png'] : ['jpg', 'jpeg'];
  if (!allowed.includes(suffix ?? '')) throw new PrivateFlowError('clinical_file_invalid', 400);
  const content = Buffer.from(file.base64, 'base64');
  try { await assertClinicalFileStructure({ content, mediaType: file.mediaType }); }
  catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'clinical_file_validation_busy') throw new PrivateFlowError(code, 503);
    throw new PrivateFlowError(code === 'clinical_file_processing_limit' ? code : 'clinical_file_invalid', 400);
  } finally { content.fill(0); }
}
