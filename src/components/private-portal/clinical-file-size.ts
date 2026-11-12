/** Display only: exact original bytes are never changed or rounded away. */
export function formatClinicalFileSize(bytes: number, language: 'es' | 'en' = 'es'): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return language === 'en' ? 'Size unavailable' : 'Tamaño no disponible';
  const locale = language === 'en' ? 'en-US' : 'es-CL';
  const exact = bytes.toLocaleString(locale) + (bytes === 1 ? ' byte' : ' bytes');
  if (bytes < 1000) return exact;
  const divisor = bytes < 1_000_000 ? 1000 : 1_000_000;
  const unit = bytes < 1_000_000 ? 'kB' : 'MB';
  return (bytes / divisor).toLocaleString(locale, { maximumFractionDigits: 2 }) + ' ' + unit + ' (' + exact + ')';
}
