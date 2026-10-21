import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('keeps complete clinical schema and immutable-version protections equivalent',()=>{
 const cli=readFileSync('scripts/migrate.mjs','utf8');
 const remote=readFileSync('src/app/api/admin/migrate/route.ts','utf8');
 const block=cli.slice(cli.indexOf('step("clinical-history-v1"'),cli.indexOf('step("doctor onboarding requests"'));
 const normalize=(v:string)=>v.replace(/\s+/g,' ').trim();
 const expected=[...block.matchAll(/await sql`([\s\S]*?)`;/g)].map(m=>normalize(m[1]));
 const actual=[...remote.matchAll(/\["clinical_history_\d+", `([\s\S]*?)`\]/g)].map(m=>normalize(m[1]));
 expect(expected.length).toBe(12);expect(actual).toEqual(expected);
 expect(expected[0]).toContain('version BETWEEN 1 AND 4294967295');
 expect(expected[3]).toContain("(context->>'author'),operation_id");
 expect(expected[4]).toContain("OLD.state='confirmed'");
});
