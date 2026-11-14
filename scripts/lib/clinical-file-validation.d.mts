export const CLINICAL_FILE_LIMITS: Readonly<{ bytes: number; timeoutMs: number; heapMiB: number; pixels: number; concurrency: number }>;
export function assertClinicalFileStructure(file: { content: Uint8Array; mediaType: string }): Promise<void>;
