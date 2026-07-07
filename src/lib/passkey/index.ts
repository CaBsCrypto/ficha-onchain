"use client";
/**
 * Passkey authentication seam (client-side).
 * ---------------------------------------------------------------------------
 * One stable interface, two implementations chosen at runtime:
 *
 *   NEXT_PUBLIC_PASSKEY_ENABLED=false (default)
 *     → MOCK: simulates the Face ID / Touch ID prompt and returns a hardcoded,
 *       funded testnet wallet per role. No infra required — the build and the
 *       whole demo flow work out of the box.
 *
 *   NEXT_PUBLIC_PASSKEY_ENABLED=true
 *     → REAL: lazy-imports `passkey-kit` and creates/connects a smart-wallet
 *       secured by a device passkey. Requires a deployed wallet-factory WASM
 *       hash + a submitter (Launchtube / PasskeyServer). `passkey-kit` is only
 *       imported in this branch so it never enters the bundle when disabled.
 */
import type { Role } from "@/types";

export interface PasskeySession {
  role: Role;
  address: string;
  /** Base64 passkey credential id (real mode only). */
  keyId?: string;
  mock: boolean;
}

const STORAGE_KEY = "trustleaf.session";

export function passkeyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PASSKEY_ENABLED === "true";
}

const DEMO_WALLETS: Record<Role, string> = {
  doctor:
    process.env.NEXT_PUBLIC_DEMO_DOCTOR_WALLET ??
    "GAAG2XS7WM332FV5WOXXE4BZ56LVA474AZB4QDYPSSWJ3FLLLYH7ZZI2",
  patient:
    process.env.NEXT_PUBLIC_DEMO_PATIENT_WALLET ??
    "GD7WGS7MACGCZCECTNO5V3CH3FORZ2JQYILB5VDCQOYYEAJQOS2V4ZFW",
};

/** Authenticate (register or connect) a passkey wallet for the given role. */
export async function loginWithPasskey(
  role: Role,
  opts: { register?: boolean } = {},
): Promise<PasskeySession> {
  const session = passkeyEnabled()
    ? await realLogin(role, opts.register ?? false)
    : await mockLogin(role);
  saveSession(session);
  return session;
}

async function mockLogin(role: Role): Promise<PasskeySession> {
  // Simulate the platform authenticator round-trip so the UI feels real.
  await new Promise((r) => setTimeout(r, 1400));
  return { role, address: DEMO_WALLETS[role], mock: true };
}

async function realLogin(
  role: Role,
  register: boolean,
): Promise<PasskeySession> {
  // Lazy import keeps passkey-kit (and its browser-only deps) out of the bundle
  // unless real passkeys are actually enabled. `turbopackIgnore` leaves this as a
  // runtime import so the bundler never tries to compile passkey-kit's TS source
  // at build time (it only needs to resolve when NEXT_PUBLIC_PASSKEY_ENABLED=true,
  // where a proper transpile/loader would be configured alongside the infra).
  const { PasskeyKit } = await import(/* turbopackIgnore: true */ "passkey-kit");
  const walletWasmHash = process.env.NEXT_PUBLIC_WALLET_WASM_HASH;
  if (!walletWasmHash) {
    throw new Error(
      "Passkey real mode requires NEXT_PUBLIC_WALLET_WASM_HASH (deployed wallet factory).",
    );
  }
  const kit = new PasskeyKit({
    rpcUrl:
      process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
      "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    walletWasmHash,
  });

  const appName = "TrustLeaf";
  const userName = `${role}@trustleaf.org`;
  const result = register
    ? await kit.createWallet(appName, userName)
    : await kit.connectWallet();

  // NOTE: for createWallet the returned deploy tx (result.signedTx) must be
  // submitted via a PasskeyServer/Launchtube before the contract wallet exists.
  // Wire that submitter here once the infra token is provisioned.
  return {
    role,
    address: result.contractId,
    keyId: "keyIdBase64" in result ? result.keyIdBase64 : undefined,
    mock: false,
  };
}

// --- session persistence (client) ------------------------------------------

export function saveSession(session: PasskeySession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(role?: Role): PasskeySession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as PasskeySession;
    if (role && session.role !== role) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
