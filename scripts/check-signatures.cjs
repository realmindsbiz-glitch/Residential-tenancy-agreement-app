const assert = require('node:assert/strict');
const {join} = require('node:path');
const {readFileSync} = require('node:fs');
module.exports = async function checkSignatures({browser,base,output}) {
 const context=await browser.newContext({viewport:{width:1300,height:1100}});
 try {
  const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.getByLabel('Legal name',{exact:true}).fill('Owner A');
  await page.getByRole('button',{name:/Add landlord/}).click();
  await page.getByLabel('Legal name',{exact:true}).nth(1).fill('Owner B');
  await page.getByLabel('Last name',{exact:true}).fill('Tenant');
  await page.getByLabel('First name',{exact:true}).fill('Alex');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await page.locator('#section-jump').selectOption('17');
  const card=key=>page.locator(`[data-signer="${key}"]`);
  async function draw(key,offset=0) {
   const canvas=card(key).locator('canvas'); await canvas.scrollIntoViewIfNeeded();
   const box=await canvas.boundingBox();
   await page.mouse.move(box.x+box.width*.12,box.y+box.height*(.5+offset));await page.mouse.down();
   for(let j=1;j<=12;j++)await page.mouse.move(box.x+box.width*(.12+j*.05),box.y+box.height*(.5+Math.sin(j)*.18+offset),{steps:2});
   await page.mouse.up();
  }
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ontario-lease-v1')));
  await draw('landlords:0');
  assert.equal(await card('landlords:0').locator('.signature-status').textContent(),'✓ Signature added');
  let saved=await stored();const initial=JSON.parse(saved.landlords[0]._signatureStrokes);
  assert.equal(initial.length,1);assert.ok(initial[0].length>10);
  await draw('landlords:0',.1);assert.equal(JSON.parse((await stored()).landlords[0]._signatureStrokes).length,2);
  await card('landlords:0').getByRole('button',{name:'Undo last stroke'}).click();assert.equal(JSON.parse((await stored()).landlords[0]._signatureStrokes).length,1);
  await card('landlords:0').getByLabel('Date signed for Owner A (optional)',{exact:true}).fill('2026-10-15');
  await card('landlords:1').getByRole('button',{name:'Type signature',exact:true}).click();
  await page.getByLabel('Type signature for Owner B',{exact:true}).fill('Owner B');
  await card('landlords:1').getByLabel('Date signed for Owner B (optional)',{exact:true}).fill('2026-10-16');
  await card('tenants:0').getByRole('button',{name:'Type signature',exact:true}).click();
  await page.getByLabel('Type signature for Alex Tenant',{exact:true}).fill('Alex Tenant');
  await page.screenshot({path:join(output,'signature-editor.png'),fullPage:true});
  await page.reload();await page.locator('#section-jump').selectOption('17');
  assert.equal(await card('landlords:0').locator('.signature-status').textContent(),'✓ Signature added');
  assert.ok(await card('landlords:0').locator('canvas').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)));
  assert.equal(await page.getByLabel('Type signature for Owner B',{exact:true}).inputValue(),'Owner B');
  await page.locator('#review-top').click();assert.equal(await page.locator('.signature-image').count(),1);assert.equal(await page.locator('.signature-typed').count(),2);
  assert.ok(await page.locator('.signature-image path').getAttribute('d'));
  assert.ok((await page.locator('.signature-line').nth(0).textContent()).includes('2026-10-15'));
  await page.pdf({path:join(output,'signed-agreement.pdf'),format:'Letter',printBackground:true});
  await page.locator('.print-section').last().screenshot({path:join(output,'printed-signatures.png')});
  await page.getByRole('button',{name:/Keep editing/}).click();
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Download draft',exact:true}).click();const download=await downloadEvent;const draft=join(output,'signed-draft.json');await download.saveAs(draft);
  await card('landlords:0').getByRole('button',{name:'Clear signature',exact:true}).click();assert.equal(await card('landlords:0').locator('.signature-status').textContent(),'Not signed yet');
  await page.locator('#import-file').setInputFiles(draft);await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('imported'));
  assert.equal(await card('landlords:0').locator('.signature-status').textContent(),'✓ Signature added');assert.equal(await page.getByLabel('Type signature for Owner B',{exact:true}).inputValue(),'Owner B');
  // Removing a signer must not assign their signature/date to another signer.
  await page.locator('#section-jump').selectOption('1');await page.getByRole('button',{name:'Remove landlord 1',exact:true}).click();
  await page.locator('#section-jump').selectOption('17');assert.equal(await page.getByLabel('Type signature for Owner B',{exact:true}).inputValue(),'Owner B');assert.equal(await page.getByLabel('Date signed for Owner B (optional)',{exact:true}).inputValue(),'2026-10-16');
  await page.locator('#review-top').click();assert.equal(await page.locator('.signature-image').count(),0);assert.equal(await page.locator('.signature-typed').count(),2);
  await page.getByRole('button',{name:/Keep editing/}).click();
  // Renaming a party clears their prior signature, while other parties remain signed.
  await page.locator('#section-jump').selectOption('1');await page.getByLabel('Legal name',{exact:true}).fill('New Owner');await page.locator('#section-jump').selectOption('17');assert.equal(await card('landlords:0').locator('.signature-status').textContent(),'Not signed yet');assert.equal(await card('tenants:0').locator('.signature-status').textContent(),'✓ Signature added');
  // Older drafts retain their dates. Invalid vector data never becomes SVG markup.
  const oldDraft={version:1,data:{landlords:[{'Legal name':'Legacy Owner',_signatureStrokes:'[[["<script>",0]]]'}],tenants:[{}],rentExtras:[{}],otherServices:[{}],'sig-landlords-0':'2026-10-14'}};
  await page.locator('#import-file').setInputFiles({name:'old-draft.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oldDraft))});await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('imported'));
  assert.equal(await page.getByLabel('Date signed for Legacy Owner (optional)',{exact:true}).inputValue(),'2026-10-14');assert.equal(await card('landlords:0').locator('.signature-status').textContent(),'Not signed yet');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  // The downloadable preview also supports a drawn signature without network requests.
  const preview=await context.newPage();await preview.route('**/*',r=>r.abort());await preview.setContent(readFileSync(join(__dirname,'../Ontario-Lease-Preview.html'),'utf8'));await preview.locator('#section-jump').selectOption('17');const pad=preview.locator('canvas').first();await pad.scrollIntoViewIfNeeded();const box=await pad.boundingBox();await preview.mouse.move(box.x+30,box.y+40);await preview.mouse.down();await preview.mouse.move(box.x+140,box.y+75,{steps:12});await preview.mouse.up();await preview.locator('#review-top').click();assert.equal(await preview.locator('.signature-image').count(),1);await preview.close();
  assert.deepEqual(errors,[]);
 } finally {await context.close();}
 const touchContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 try {
  const page=await touchContext.newPage();await page.goto(base);await page.locator('#section-jump').selectOption('17');await page.getByRole('button',{name:'Save draft',exact:true}).click();
  const pad=page.locator('canvas').first();await pad.scrollIntoViewIfNeeded();const b=await pad.boundingBox();
  const cdp=await touchContext.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+30,y:b.y+40}]});
  for(let j=1;j<=6;j++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+30+j*20,y:b.y+40+j*3}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.locator('.signature-status').first().textContent(),'✓ Signature added');
  assert.ok(await page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('ontario-lease-v1')).landlords[0]._signatureStrokes)[0].length>1));
 }finally{await touchContext.close();}
 console.log('PASS: drawn/typed/touch signatures, undo/clear, dates, persistence, export/import, signer removal, rename, old drafts, offline preview, signed PDF.');
};
