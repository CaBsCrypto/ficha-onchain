import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';

export const CLINICAL_FILE_LIMITS = Object.freeze({ bytes: 3_000_000, timeoutMs: 5_000, heapMiB: 256, pixels: 32_000_000, concurrency: 2 });
const types = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const errors = new Set(['clinical_file_invalid', 'clinical_file_processing_limit']);
const failure = code => Object.assign(new Error(code), { code });

/** Injectable worker constructor is only for isolated tests; HTTP callers cannot select it. */
export function createClinicalFileValidator(spawn = options => new Worker(resolve(process.cwd(), 'scripts/lib/clinical-file-validation-worker.mjs'), options)) {
  let active = 0;
  return async function validate({ content, mediaType }) {
    if (!(content instanceof Uint8Array) || content.byteLength < 1 || content.byteLength > CLINICAL_FILE_LIMITS.bytes || !types.has(mediaType)) throw failure('clinical_file_invalid');
    if (active >= CLINICAL_FILE_LIMITS.concurrency) throw failure('clinical_file_validation_busy');
    active++;
    let worker, timer;
    const copy = Uint8Array.from(content);
    try {
      await new Promise((ok, reject) => {
        worker = spawn({ workerData: { content: copy.buffer, mediaType }, transferList: [copy.buffer], env: {}, execArgv: [],
          resourceLimits: { maxOldGenerationSizeMb: CLINICAL_FILE_LIMITS.heapMiB, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } });
        timer = setTimeout(() => reject(failure('clinical_file_processing_limit')), CLINICAL_FILE_LIMITS.timeoutMs);
        worker.once('message', result => {
          if (result && Object.keys(result).length === 1 && result.ok === true) ok();
          else reject(failure(errors.has(result?.error) ? result.error : 'clinical_file_invalid'));
        });
        worker.once('error', () => reject(failure('clinical_file_invalid')));
        worker.once('exit', () => reject(failure('clinical_file_invalid')));
      });
    } finally {
      clearTimeout(timer);
      // A slot is not reusable until termination has finished, including timed-out decoders.
      try { if (worker) await worker.terminate(); }
      finally { active--; if (copy.byteLength) copy.fill(0); }
    }
  };
}
export const assertClinicalFileStructure = createClinicalFileValidator();
