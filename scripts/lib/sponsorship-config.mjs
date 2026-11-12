import { assertPolicy, deny } from './sponsorship-domain.mjs';
export const INTEGRATED_SPONSORSHIP_PATHS = ['/api/private-clinical-operations', '/api/admin/doctor-authorizations'];
export function loadSponsorshipConfig(env = process.env) {
    try {
        const policy = Object.freeze({ enabled: env.TRUSTLEAF_SPONSORSHIP_ENABLED === 'true',
            sponsorDailyLimitStroops: env.TRUSTLEAF_SPONSORSHIP_SPONSOR_DAILY_LIMIT_STROOPS ?? '',
            patientDailyLimitStroops: env.TRUSTLEAF_SPONSORSHIP_PATIENT_DAILY_LIMIT_STROOPS ?? '',
            maxFeeStroops: env.TRUSTLEAF_SPONSORSHIP_MAX_FEE_STROOPS ?? '',
            emergencyReserveStroops: env.TRUSTLEAF_SPONSORSHIP_EMERGENCY_RESERVE_STROOPS ?? '',
            encounterLimitStroops: env.TRUSTLEAF_SPONSORSHIP_ENTRY_LIMIT_STROOPS ?? '' });
        assertPolicy(policy);
        const paths = (env.TRUSTLEAF_SPONSORSHIP_PATHS ?? '').split(',').filter(Boolean);
        if (!paths.length || !paths.every(p => /^\/api\/[a-zA-Z0-9/_\[\]-]+$/.test(p)))
            return { policy: null, paths: [] };
        const integrated = paths.filter(p => INTEGRATED_SPONSORSHIP_PATHS.includes(p));
        if (!integrated.length)
            return { policy: null, paths: [] };
        return { policy, paths: Object.freeze(integrated) };
    }
    catch {
        return { policy: null, paths: [] };
    }
}
export function assertSponsorshipPath(path, request, config = loadSponsorshipConfig()) {
    if (request.purpose === 'reconcile_read' && request.method === 'GET')
        return;
    if (request.purpose !== 'spend' || request.method !== 'POST')
        deny('sponsorship_path_disabled');
    assertPolicy(config.policy);
    if (!INTEGRATED_SPONSORSHIP_PATHS.includes(path) || !config.paths.includes(path))
        deny('sponsorship_path_disabled');
}
