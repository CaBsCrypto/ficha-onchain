export const WAITLIST_MAX_BODY_BYTES = 1024;
export const WAITLIST_EMAIL_MAX_LENGTH = 254;

export function normalizeWaitlistEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= WAITLIST_EMAIL_MAX_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Enforces the actual streamed byte count, including requests without Content-Length. */
export async function readWaitlistBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > WAITLIST_MAX_BODY_BYTES) throw new Error('body_too_large');
  if (!request.body) throw new Error('invalid_json');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > WAITLIST_MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error('body_too_large');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally { reader.releaseLock(); }
}
