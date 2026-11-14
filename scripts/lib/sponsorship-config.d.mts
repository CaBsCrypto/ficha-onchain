import { type SponsorshipPolicy } from './sponsorship-domain.mjs';
export declare const INTEGRATED_SPONSORSHIP_PATHS: readonly ["/api/private-clinical-operations", "/api/admin/doctor-authorizations"];
export type SponsorshipConfig = {
    policy: SponsorshipPolicy | null;
    paths: readonly string[];
};
export declare function loadSponsorshipConfig(env?: Record<string, string | undefined>): SponsorshipConfig;
export declare function assertSponsorshipPath(path: string, request: {
    method: string;
    purpose: 'spend' | 'reconcile_read';
}, config?: SponsorshipConfig): void;
