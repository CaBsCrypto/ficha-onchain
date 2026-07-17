/**
 * Soroban read client — server-side.
 * ---------------------------------------------------------------------------
 * Wraps the deployed DoctorRegistry + PrescriptionSoulbound contracts with
 * typed, read-only helpers backed by `simulateTransaction` (no signing, no
 * funded source required). Also enumerates prescriptions via `getEvents`.
 *
 * NOTE on enumeration: the PrescriptionSoulbound contract has no on-chain index
 * of prescriptions by patient or doctor, and the id counter is not exposed via a
 * getter. The only way to discover ids is to scan the `rx_mint` events emitted
 * on mint. We therefore query the RPC event log (filtered by the doctor/patient
 * address topic) and then fetch each record with `get_prescription`. This is the
 * canonical pattern on Soroban; its limitation is the RPC event retention window
 * (~7 days on the public testnet node). A production build would additionally
 * mirror events into an off-chain index (e.g. via a Horizon/Zephyr indexer).
 */
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import {
  CONTRACT_IDS,
  NETWORK_PASSPHRASE,
  SOROBAN_RPC_URL,
} from "./config";
import type { PrescriptionType } from "@/types";

export const server = new rpc.Server(SOROBAN_RPC_URL, {
  allowHttp: SOROBAN_RPC_URL.startsWith("http://"),
});

/** Any valid, existing account works as a simulation source. */
const SIM_SOURCE =
  process.env.NEXT_PUBLIC_DEMO_DOCTOR_WALLET ??
  "GAAG2XS7WM332FV5WOXXE4BZ56LVA474AZB4QDYPSSWJ3FLLLYH7ZZI2";

/** Raw statuses as encoded by the Soroban `Status` enum (see contract). */
export type RxStatus =
  | "Registrada"
  | "Activa"
  | "Bloqueada"
  | "ConsumoParcial"
  | "Quemada"
  | "Revocada";

export interface OnChainPrescription {
  id: string;
  doctorWallet: string;
  patientWallet: string;
  rxHash: string; // hex
  medication: string;
  dosage: string;
  unitsTotal: number;
  balance: number;
  timestamp: number; // ledger unix seconds
  status: RxStatus;
  /**
   * Decreto 41 (MINSAL) clinical content. These fields live in the off-chain
   * FHIR document that `rxHash` anchors — the Soroban contract does NOT store
   * them, so they are only present once an off-chain FHIR store is wired in
   * (Phase 0 TODO). The patient / pharmacy views render them when available and
   * degrade gracefully to the on-chain subset otherwise.
   */
  prescriptionType?: PrescriptionType;
  diagnosis?: string;
  cie10Code?: string;
  refills?: number;
}

/** Invoke a read-only contract method via simulation, returning the native value. */
export async function callRead<T = unknown>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<T> {
  const contract = new Contract(contractId);
  const source = new Account(SIM_SOURCE, "0");
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new ContractCallError(sim.error);
  }
  if (!sim.result?.retval) {
    throw new ContractCallError(`No return value from ${method}`);
  }
  return scValToNative(sim.result.retval) as T;
}

/** Distinguishable error so callers can map contract error codes (e.g. NotFound). */
export class ContractCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractCallError";
  }
}

const addr = (a: string) => new Address(a).toScVal();

// --- DoctorRegistry ---------------------------------------------------------

/**
 * Asks DoctorRegistry whether this wallet may issue prescriptions.
 *
 * Throws if the chain cannot be reached. It used to swallow every error and
 * return false, which made "the network is unreachable" indistinguishable from
 * "this doctor is not registered" — an SDK too old to parse the ledger's XDR
 * silently downgraded every mint to a simulated one, and the UI reported
 * success. Callers must decide what an unreachable chain means for them.
 */
export async function isDoctorAuthorized(wallet: string): Promise<boolean> {
  return callRead<boolean>(
    CONTRACT_IDS.doctorRegistry,
    "is_authorized",
    [addr(wallet)],
  );
}

export interface DoctorRecord {
  wallet: string;
  fullName: string;
  licenseId: string;
  authorized: boolean;
  /**
   * Named permissions granted on-chain, e.g. ["CANNABIS", "MNT_HLTH"].
   * Empty array when none have been granted or wallet is unknown.
   */
  permissions: string[];
}

/**
 * Fetch the Vec<Symbol> permissions stored under a doctor wallet.
 * scValToNative decodes Symbol values as plain strings, so the result is
 * a string[] on the TypeScript side.
 */
export async function getDoctorPermissions(wallet: string): Promise<string[]> {
  try {
    const raw = await callRead<unknown>(
      CONTRACT_IDS.doctorRegistry,
      "get_permissions",
      [addr(wallet)],
    );
    // scValToNative maps Vec<Symbol> → string[] (each Symbol becomes its name)
    if (Array.isArray(raw)) return raw.map(String);
    return [];
  } catch {
    return [];
  }
}

/**
 * Check whether a doctor holds a specific named permission.
 * `permission` must match the Soroban Symbol string exactly, e.g. "CANNABIS".
 */
export async function hasDoctorPermission(
  wallet: string,
  permission: string,
): Promise<boolean> {
  try {
    return await callRead<boolean>(
      CONTRACT_IDS.doctorRegistry,
      "has_permission",
      [addr(wallet), nativeToScVal(permission, { type: "symbol" })],
    );
  } catch {
    return false;
  }
}

export async function getDoctor(wallet: string): Promise<DoctorRecord | null> {
  try {
    const [raw, permissions] = await Promise.all([
      callRead<{
        wallet: string;
        full_name: string;
        license_id: string;
        authorized: boolean;
      }>(CONTRACT_IDS.doctorRegistry, "get_doctor", [addr(wallet)]),
      getDoctorPermissions(wallet),
    ]);
    return {
      wallet: raw.wallet,
      fullName: raw.full_name,
      licenseId: raw.license_id,
      authorized: raw.authorized,
      permissions,
    };
  } catch {
    return null; // DoctorNotFound
  }
}

// --- PrescriptionSoulbound --------------------------------------------------

function decodeStatus(status: unknown): RxStatus {
  // scValToNative maps a unit-like enum to its variant name (string) or an
  // object/number depending on SDK version — normalize all shapes here.
  if (typeof status === "string") return status as RxStatus;
  const order: RxStatus[] = [
    "Registrada",
    "Activa",
    "Bloqueada",
    "ConsumoParcial",
    "Quemada",
    "Revocada",
  ];
  if (typeof status === "number") return order[status] ?? "Registrada";
  if (status && typeof status === "object") {
    const tag = (status as { tag?: string }).tag;
    if (tag) return tag as RxStatus;
  }
  return "Registrada";
}

function toHex(bytes: unknown): string {
  if (bytes instanceof Uint8Array) return Buffer.from(bytes).toString("hex");
  if (Buffer.isBuffer(bytes)) return bytes.toString("hex");
  return String(bytes ?? "");
}

/** Map a raw scValToNative `Prescription` struct into our camelCase shape. */
function mapPrescription(raw: Record<string, unknown>): OnChainPrescription {
  return {
    id: String(raw.id),
    doctorWallet: String(raw.doctor_wallet),
    patientWallet: String(raw.patient_wallet),
    rxHash: toHex(raw.rx_hash),
    medication: String(raw.medication),
    dosage: String(raw.dosage),
    unitsTotal: Number(raw.units_total),
    balance: Number(raw.balance),
    timestamp: Number(raw.timestamp),
    status: decodeStatus(raw.status),
  };
}

export async function getPrescription(
  id: string | number | bigint,
): Promise<OnChainPrescription | null> {
  try {
    const raw = await callRead<Record<string, unknown>>(
      CONTRACT_IDS.prescriptionSoulbound,
      "get_prescription",
      [nativeToScVal(BigInt(id), { type: "u64" })],
    );
    return mapPrescription(raw);
  } catch {
    return null; // NotFound
  }
}

/**
 * Enumerate a patient's prescriptions via the contract's direct getter
 * `get_prescriptions_by_patient(patient) -> Vec<Prescription>`.
 *
 * This is preferred over {@link listPrescriptions}' `rx_mint` event scan: it is a
 * single read backed by the contract's own per-patient index, so it does not
 * depend on the RPC node's ~7-day event retention window (which silently drops
 * older prescriptions once the window rolls over). Returns newest-first.
 */
export async function getPrescriptionsByPatient(
  patient: string,
): Promise<OnChainPrescription[]> {
  const raw = await callRead<unknown>(
    CONTRACT_IDS.prescriptionSoulbound,
    "get_prescriptions_by_patient",
    [addr(patient)],
  );
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => mapPrescription(r as Record<string, unknown>))
    .sort((a, b) => Number(b.id) - Number(a.id));
}

/**
 * Enumerate prescriptions by scanning `rx_mint` events. `role` selects which
 * address topic to match: minted events carry topics
 *   [ symbol("rx_mint"), doctor_wallet, patient_wallet ].
 */
export async function listPrescriptions(
  wallet: string,
  role: "doctor" | "patient",
): Promise<OnChainPrescription[]> {
  const ids = await findPrescriptionIds(wallet, role);
  const records = await Promise.all(ids.map((id) => getPrescription(id)));
  return records
    .filter((r): r is OnChainPrescription => r !== null)
    .sort((a, b) => Number(b.id) - Number(a.id));
}

async function findPrescriptionIds(
  wallet: string,
  role: "doctor" | "patient",
): Promise<string[]> {
  const latest = await server.getLatestLedger();
  // Stay inside the node's retention window (~120960 ledgers on testnet).
  const startLedger = Math.max(1, latest.sequence - 100_000);

  const walletTopic = new Address(wallet).toScVal().toXDR("base64");
  const mintTopic = xdr.ScVal.scvSymbol("rx_mint").toXDR("base64");
  // topics: [ "rx_mint", doctor, patient ] — wildcard the slot we don't filter.
  const topicFilter =
    role === "doctor"
      ? [mintTopic, walletTopic, "*"]
      : [mintTopic, "*", walletTopic];

  const ids = new Set<string>();
  let cursor: string | undefined;
  // Page through results (RPC caps ~ per-page); cap total pages defensively.
  for (let page = 0; page < 20; page += 1) {
    // getEvents takes either a ledger range or a cursor, never both — SDK v14
    // types them as mutually exclusive rather than accepting an ambiguous mix.
    const filters: rpc.Api.EventFilter[] = [
      {
        type: "contract",
        contractIds: [CONTRACT_IDS.prescriptionSoulbound],
        topics: [topicFilter],
      },
    ];
    const res: rpc.Api.GetEventsResponse = await server.getEvents(
      cursor
        ? { filters, cursor, limit: 100 }
        : { filters, startLedger, limit: 100 },
    );
    for (const ev of res.events ?? []) {
      try {
        ids.add(String(scValToNative(ev.value)));
      } catch {
        /* skip malformed */
      }
    }
    if (!res.cursor || (res.events?.length ?? 0) === 0) break;
    cursor = res.cursor;
  }
  return [...ids];
}
