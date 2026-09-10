/** Next's internal URL can differ from the incoming Host in local development. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === request.headers.get('host');
  } catch { return false; }
}
