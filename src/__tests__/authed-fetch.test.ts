import { afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ token: vi.fn() }));
vi.mock('@privy-io/react-auth', () => ({ getAccessToken: m.token }));
import { authedFetch } from '@/lib/auth/authed-fetch';
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it('does not acquire a token or issue HTTP after prior cancellation', async () => {
  const abort = new AbortController(); abort.abort(); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(authedFetch('/api/private-clinical-history', { signal: abort.signal })).rejects.toThrow();
  expect(m.token).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('does not issue late HTTP when token acquisition finishes after cancellation', async () => {
  let resolve!: (value: string) => void; m.token.mockReturnValue(new Promise<string>(yes => { resolve = yes; }));
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); const abort = new AbortController();
  const result = authedFetch('/api/private-clinical-history', { signal: abort.signal });
  abort.abort(); resolve('SYNTHETIC_LOCAL_TOKEN'); await expect(result).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
