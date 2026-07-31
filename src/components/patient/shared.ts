import { truncateHash } from "@/lib/stellar/config";
import type { AuthorizedDoctor } from "@/components/patient/types";

/** Row shape of /api/patient/grants. */
export interface PatientGrant {
  grantee_wallet: string;
  grantee_name: string | null;
  tx_hash: string | null;
  mode: string;
  granted_at: string;
  revoked_at: string | null;
  verified?: boolean;
}

export function grantToDoctor(g: PatientGrant): AuthorizedDoctor {
  return {
    wallet: g.grantee_wallet,
    name: g.grantee_name ?? "Médico " + truncateHash(g.grantee_wallet, 4, 3),
    specialty: g.verified ? "Registrado en DoctorRegistry" : "No verificado on-chain",
    grantedAt: String(g.granted_at).split("T")[0],
    verified: Boolean(g.verified),
  };
}
