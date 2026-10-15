import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../server.js';
let base;
before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});
after(()=>server.close());
test('serves the form and all 17 sections with appendix',async()=>{
 const home=await fetch(base);assert.equal(home.status,200);assert.match(await home.text(),/Review &amp; print|Review & print/);
 const r=await fetch(base+'/lease-content.json');const d=await r.json();assert.equal(Object.keys(d.sections).length,17);
 for(const letter of 'ABCDEFGHIJKLMNOPQRSTU')assert.ok(d.appendix.some(t=>t.startsWith(letter+'. ')),`Missing appendix ${letter}`);
});
test('preserves the original downloadable PDF',async()=>{const r=await fetch(base+'/original-lease.pdf');assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');assert.equal((await r.text()).slice(0,5),'%PDF-');});
test('rejects missing files and directory traversal',async()=>{for(const url of ['/missing','/..%2fserver.js']){const r=await fetch(base+url);assert.ok([403,404].includes(r.status));}});
