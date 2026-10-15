const assert=require('node:assert/strict');
const {join}=require('node:path');
module.exports=async function checkCompleteLease({browser,base,output}){
 const context=await browser.newContext();
 try{
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.getByRole('button',{name:'Save draft',exact:true}).click();
  const expected=[];
  const selections={discount:1,rentDepositRequired:1,keyDepositRequired:1,smoking:1,additional:1,frequency:1};
  for(let step=0;step<5;step++){
   await p.locator(`[data-step="${step}"]`).click();
   for(const input of await p.locator('#form-area [data-key]').all()){
    if(await input.isDisabled())continue;
    const k=await input.getAttribute('data-key'),tag=await input.evaluate(e=>e.tagName),type=await input.getAttribute('type');
    if(tag==='SELECT'){
     const options=await input.locator('option').allTextContents();await input.selectOption(options[(selections[k]??0)+1]);
    }else if(type==='number')await input.fill(k==='baseRent'?'2400':k==='parkingRent'?'100':'12.34');
    else if(type==='date')await input.fill(k==='end'?'2027-10-15':'2026-10-15');
    else{const text='Entered '+k;await input.fill(text);expected.push(text);}
   }
  }
  assert.ok(expected.length>=25,'Expected a representative complete lease, not an empty form');
  await p.locator('[data-step="5"]').click();
  for(const card of await p.locator('[data-signer]').all()){
   await card.getByRole('button',{name:'Type signature',exact:true}).click();
   await card.locator('[data-key$=":_signatureText"]').fill('Signed complete lease');
   await card.locator('input[type="date"]').fill('2026-10-15');
  }
  await p.locator('#next').click();assert.ok(await p.locator('#review-area').isVisible());assert.equal(await p.locator('.print-validation-warning').count(),0);
  const printed=await p.locator('.paper').textContent();for(const text of expected)assert.ok(printed.includes(text),'Missing entered information in print: '+text);
  assert.equal(await p.locator('.signature-typed').count(),2);assert.equal(await p.locator('.print-section').count(),17);assert.equal(await p.locator('.appendix h3').count(),21);assert.equal(await p.locator('.attachment').count(),1);assert.ok(!printed.includes('Ministry of 5160 Yonge Street'));
  await p.pdf({path:join(output,'complete-filled-lease.pdf'),format:'Letter',printBackground:true});
  await p.reload();await p.locator('#review-top').click();assert.ok((await p.locator('.paper').textContent()).includes('Entered additionalTerms'));assert.equal(await p.locator('.signature-typed').count(),2);
  assert.deepEqual(errors,[]);console.log('PASS: complete seven-step lease entry, all entered details in print, additional terms, both signatures, appendix, reload, and PDF.');
 }finally{await context.close();}
};
