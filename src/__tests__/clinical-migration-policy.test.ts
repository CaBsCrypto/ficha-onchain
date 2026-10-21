import {expect,it} from 'vitest';
import {clinicalMigrationConnection} from '../../scripts/lib/clinical-migration-policy.mjs';
const host='ep-isolated-release.c-3.us-east-1.aws.neon.tech';
const url=`postgresql://fixture:fixture@${host}/test?sslmode=require`;
const env={TRUSTLEAF_DATABASE_URL:url,DATABASE_URL:'postgresql://fixture:fixture@unrelated.example/test',TRUSTLEAF_DB_HOST:host,TRUSTLEAF_ENV:'test',VERCEL_ENV:'production',NEXT_PUBLIC_STELLAR_NETWORK:'testnet',CLINICAL_HISTORY_PRIVATE_CONTRACT_ID:'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U',TRUSTLEAF_PRIVATE_WRITES_ENABLED:'false',TRUSTLEAF_CLINICAL_MIGRATION:'true',TRUSTLEAF_CLINICAL_WEB_MIGRATION:'true'};
it('migrates only the effective dedicated, pinned Testnet destination',()=>{
 expect(clinicalMigrationConnection(env,true)).toBe(url);
});
it.each([
 {TRUSTLEAF_DATABASE_URL:''},{TRUSTLEAF_DATABASE_URL:undefined},{TRUSTLEAF_DB_HOST:'different.example'},
 {TRUSTLEAF_DATABASE_URL:url+'&host=other.example'}, {TRUSTLEAF_DATABASE_URL:url+'&options=-csearch_path%3Devil'},
 {TRUSTLEAF_PRIVATE_WRITES_ENABLED:'true'},{TRUSTLEAF_PRIVATE_WRITES_ENABLED:undefined},
 {VERCEL_ENV:'preview'},{NEXT_PUBLIC_STELLAR_NETWORK:'mainnet'},{CLINICAL_HISTORY_PRIVATE_CONTRACT_ID:'wrong'},
 {TRUSTLEAF_CLINICAL_MIGRATION:'false'},{TRUSTLEAF_CLINICAL_WEB_MIGRATION:'false'},
 {TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET:''},{TRUSTLEAF_CLINICAL_CREATE_ONCE_RELAYER:''},{TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL:''},
 {TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_WALLET:''},{TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_RELAYER:''},{TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_UNTIL:''},
 ...['ep-lingering-water-ahzh89z5-pooler','ep-rapid-shadow-ahq94785-pooler'].map(endpoint=>({TRUSTLEAF_DATABASE_URL:`postgresql://fixture:fixture@${endpoint}.c-3.us-east-1.aws.neon.tech/test`,TRUSTLEAF_DB_HOST:`${endpoint}.c-3.us-east-1.aws.neon.tech`}))
])('rejects an unauthorized migration without leaking configuration %#',changes=>{
 expect(()=>clinicalMigrationConnection({...env,...changes},true)).toThrow(/^clinical_migration_target_not_authorized$/);
});
it('keeps explicitly selected dev migrations and rejects a contradictory local pin',()=>{
 const dev='ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech';
 const local={...env,TRUSTLEAF_ENV:'local',VERCEL_ENV:'',TRUSTLEAF_DB_HOST:dev,TRUSTLEAF_DATABASE_URL:`postgresql://fixture:fixture@${dev}/test`};
 expect(clinicalMigrationConnection(local,true)).toBe(local.TRUSTLEAF_DATABASE_URL);
 expect(()=>clinicalMigrationConnection({...local,TRUSTLEAF_DB_HOST:host},true)).toThrow();
});
