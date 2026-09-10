import type { rpc } from '@stellar/stellar-sdk';

export const PRIVATE_REGISTRY_ID: string;
export interface PrivateDoctorAuthorization {
  commitment: string;
  schema_version: number;
  version: number;
  valid_until: number;
  revoked: boolean;
}
export function readAuthorization(args: {
  wallet: string;
  source: string;
  registryId: string;
  expectedAdmin: string;
  server?: rpc.Server;
}): Promise<{ authorization: PrivateDoctorAuthorization | null; authorized: boolean; admin: string }>;
