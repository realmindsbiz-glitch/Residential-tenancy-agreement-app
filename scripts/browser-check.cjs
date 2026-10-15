const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {existsSync,mkdtempSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const output=mkdtempSync(join(tmpdir(),'lease-check-'));
(async()=>{const {server}=await import('../server.js');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;let browser;try{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Parties to the Agreement',exact:true}).first().waitFor();
await page.getByLabel('Legal name',{exact:true}).fill('Example Landlord');await page.getByLabel('Last name',{exact:true}).fill('Tenant');await page.getByLabel('First name',{exact:true}).fill('Alex');
await page.getByRole('button',{name:/Add tenant/}).click();assert.equal(await page.getByLabel('Last name',{exact:true}).count(),2);await page.getByLabel('Last name',{exact:true}).nth(1).fill('Second');await page.getByLabel('First name',{exact:true}).nth(1).fill('Jamie');await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.reload();assert.equal(await page.getByLabel('Legal name',{exact:true}).inputValue(),'Example Landlord');
await page.screenshot({path:join(output,'desktop.png'),fullPage:true});
assert.equal(await page.getByLabel('Legal name',{exact:true}).evaluate(e=>getComputedStyle(e).fontSize),'18px');
await page.locator('#text-size').click();assert.equal(await page.locator('#text-size').getAttribute('aria-pressed'),'true');
await page.reload();assert.equal(await page.locator('#text-size').getAttribute('aria-pressed'),'true');assert.equal(await page.getByLabel('Legal name',{exact:true}).inputValue(),'Example Landlord');
await page.locator('#section-jump').selectOption('4');assert.equal(await page.locator('#title').textContent(),'Parties and rental unit');await page.locator('#section-jump').selectOption('1');
await page.locator('#text-size').click();

const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download draft',exact:true}).click();const downloaded=await downloadPromise;const draftPath=join(output,'draft.json');await downloaded.saveAs(draftPath);
await page.getByRole('button',{name:'Clear draft',exact:true}).click();await page.getByRole('button',{name:'Clear draft',exact:true}).last().click();assert.equal(await page.getByLabel('Legal name',{exact:true}).inputValue(),'');
await page.locator('#import-file').setInputFiles(draftPath);await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('imported'));assert.equal(await page.getByLabel('Legal name',{exact:true}).inputValue(),'Example Landlord');
assert.equal(await page.locator('#navigation [data-step]').count(),7);
await page.locator('[data-step="1"]').click();assert.equal(await page.locator('#title').textContent(),'Rent and payment terms');
await page.getByLabel('Base rent for the rental unit ($)',{exact:true}).fill('2000');await page.locator('#next').click();assert.equal(await page.locator('#title').textContent(),'Services and utilities');
await page.locator('#previous').click();assert.equal(await page.getByLabel('Base rent for the rental unit ($)',{exact:true}).inputValue(),'2000');
await page.locator('[data-step="5"]').click();assert.equal(await page.locator('canvas').count(),3);await page.locator('#next').click();assert.equal(await page.locator('#navigation [aria-current="step"]').getAttribute('data-step'),'6');await page.getByRole('button',{name:/Keep editing/}).click();
for(let n=2;n<=17;n++){await page.locator('#section-jump').selectOption(String(n));assert.ok(await page.locator('#section-'+n).isVisible());}

await page.locator('#section-jump').selectOption('5');await page.getByLabel('Base rent for the rental unit ($)',{exact:true}).fill('2100');await page.getByLabel('Parking ($)',{exact:true}).fill('75');await page.getByLabel('Cost ($)',{exact:true}).fill('25.50');assert.equal(await page.locator('#rent-total').textContent(),'$2200.50');
await page.getByLabel('f) Landlord’s NSF administration charge ($, maximum $20)',{exact:true}).fill('21');await page.locator('#review-top').click();assert.equal(await page.locator('#review-area').isVisible(),false);await page.getByLabel('f) Landlord’s NSF administration charge ($, maximum $20)',{exact:true}).fill('20');await page.locator('#review-top').click();assert.equal(await page.locator('.print-section').count(),17);assert.equal(await page.locator('.signature-line').count(),3);assert.ok((await page.locator('.paper').textContent()).includes('$2200.50'));assert.equal(await page.locator('.appendix h3').count(),21);
await page.pdf({path:join(output,'print.pdf'),format:'Letter',printBackground:true});await page.screenshot({path:join(output,'review.png'),fullPage:false});await page.getByRole('button',{name:'Keep editing',exact:false}).click();
await page.setViewportSize({width:390,height:844});await page.locator('#section-jump').selectOption('1');await page.screenshot({path:join(output,'mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
await page.locator('#text-size').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
await page.screenshot({path:join(output,'mobile-large-text.png'),fullPage:true});await page.locator('#section-jump').selectOption('12');assert.equal(await page.locator('#section-12 .legal-notes').getAttribute('open'),'');await page.locator('#section-jump').selectOption('1');
await page.locator('#text-size').click();

await page.getByRole('button',{name:'Clear draft',exact:true}).click();await page.getByRole('button',{name:'Keep editing',exact:true}).click();assert.equal(await page.getByLabel('Legal name',{exact:true}).inputValue(),'Example Landlord');assert.deepEqual(errors,[]);
for(const width of [320,768,1024]){await page.setViewportSize({width,height:900});await page.locator('#text-size').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`Overflow at ${width}px`);await page.locator('#text-size').click();}
const standalone=await browser.newPage();const requests=[];standalone.on('request',r=>requests.push(r.url()));await standalone.route('**/*',r=>r.abort());await standalone.setContent(readFileSync(join(__dirname,'../Ontario-Lease-Preview.html'),'utf8'));await standalone.getByLabel('Legal name',{exact:true}).fill('Standalone preview check');await standalone.locator('#text-size').click();await standalone.locator('#section-jump').selectOption('5');await standalone.getByLabel('Base rent for the rental unit ($)',{exact:true}).fill('1800');await standalone.locator('#review-top').click();assert.equal(await standalone.locator('.print-section').count(),17);assert.ok((await standalone.locator('.paper').textContent()).includes('Standalone preview check'));assert.deepEqual(requests,[]);await standalone.pdf({path:join(output,'standalone-print.pdf'),format:'Letter'});await standalone.close();
await require('./check-signatures.cjs')({browser,base,output});
await require('./check-draft-safety.cjs')({browser,base,output});
await require('./check-complete-lease.cjs')({browser,base,output});
console.log('PASS: fields, repeated parties, persistence, total, validation, 17 print sections, signatures, appendix, PDF, mobile, larger text persistence, section jump, clear cancellation, offline standalone preview.');console.log('Artifacts: '+output);}finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
