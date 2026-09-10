import {it,expect} from 'vitest';
import {isSameOrigin} from '@/lib/auth/same-origin';
it('uses incoming host behind local Next URL rewriting',()=>{expect(isSameOrigin(new Request('http://localhost:3002',{headers:{host:'127.0.0.1:3002',origin:'http://127.0.0.1:3002'}}))).toBe(true);});
it.each(['https://evil.example','null','http://127.0.0.1:3003'])('rejects foreign or opaque origin %s',(origin)=>{expect(isSameOrigin(new Request('http://localhost:3002',{headers:{host:'127.0.0.1:3002',origin}}))).toBe(false);});
