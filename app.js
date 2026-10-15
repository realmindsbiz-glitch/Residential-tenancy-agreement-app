const content = await fetch('./lease-content.json').then(r => r.json());
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storageKey = 'ontario-lease-v1';
let data = {}, current = 1, reviewing = false, persisted = false;
try { const stored = localStorage.getItem(storageKey); if (stored) { data = JSON.parse(stored); persisted = true; } } catch {}
const hints = {1:'Let’s start with the people entering into this agreement.',2:'Identify the rental unit and any parking included.',3:'Make it easy to stay in touch and deliver notices.',4:'Set the start date and length of the tenancy.',5:'Set out the rent, payment schedule, and payment details.',6:'Be clear about the services included and who pays for utilities.',17:'Review the agreement together. Print and sign when you’re ready.'};
const groups = {landlords:['Landlord', ['Legal name']], tenants:['Tenant', ['Last name','First name']], rentExtras:['Service or utility',['Description','Cost ($)']], otherServices:['Other service',['Description','Included (Yes / No)']]};
function field(key,label,type='text',extra={}) { return {key,label,type,...extra}; }
const f=field;
const choice=(key,label,options)=>f(key,label,'select',{options});
const yesno=(key,label)=>choice(key,label,['Yes','No']);
const money=(key,label)=>f(key,label,'number',{min:0,step:'0.01'});
const area=(key,label)=>f(key,label,'textarea');
const heading=label=>({type:'heading',label});
const repeat=key=>({type:'repeat',key});
const date=(key,label)=>f(key,label,'date');
const schemas={
1:[heading('Landlord(s)'),repeat('landlords'),heading('Tenant(s)'),repeat('tenants')],
2:[f('unit','Unit (e.g., unit 1 or basement unit)'),f('streetNumber','Street number'),f('street','Street name'),f('city','City / town'),f('province','Province','text',{default:'Ontario'}),f('postal','Postal code'),area('parking','Number of vehicle parking spaces and description'),yesno('condo','Is the rental unit in a condominium?')],
3:[heading('Address for giving notices or documents to the landlord'),f('noticeUnit','Unit'),f('noticeStreetNumber','Street number'),f('noticeStreet','Street name'),f('noticePO','PO box'),f('noticeCity','City / town'),f('noticeProvince','Province'),f('noticePostal','Postal code / ZIP code'),yesno('emailConsent','Do both parties agree to receive notices and documents by email, where allowed by the Landlord and Tenant Board’s Rules of Procedure?'),area('noticeEmails','If yes, provide email addresses'),yesno('emergencyConsent','Is the landlord providing phone and/or email contact information for emergencies or day-to-day communications?'),area('emergency','If yes, provide contact information')],
4:[date('start','This tenancy starts on'),choice('term','This tenancy agreement is for',['A fixed length of time','A monthly tenancy','Other (e.g., daily, weekly)']),date('end','Fixed term ending on'),f('otherTerm','Other tenancy — specify')],
5:[f('rentDay','a) Rent is to be paid on the … day (e.g., first)'),choice('frequency','Of each',['Month','Other (e.g., weekly)']),f('otherFrequency','Other payment frequency'),heading('b) Rent breakdown'),money('baseRent','Base rent for the rental unit ($)'),money('parkingRent','Parking ($)'),repeat('rentExtras'),f('total','Total rent / lawful rent ($)','total'),f('payee','c) Rent is payable to'),area('paymentMethods','d) Rent will be paid using the following methods'),heading('e) Partial first rental period (if applicable)'),money('partialRent','Partial rent ($)'),date('partialPayDate','Payment date'),date('partialFrom','Period from'),date('partialTo','Period to'),money('nsf','f) Landlord’s NSF administration charge ($, maximum $20)')],
6:[heading('Services included in the lawful rent'),...['Gas','Air conditioning','Additional storage space','On-site laundry','Guest parking'].map((s,i)=>yesno('service'+i,s)),choice('laundryCharge','On-site laundry charge (if included)',['No charge','Pay per use']),choice('guestCharge','Guest parking charge (if included)',['No charge','Pay per use']),repeat('otherServices'),area('servicesDetails','Details about services or additional services'),heading('Responsibility for utilities'),...['Electricity','Heat','Water'].map(s=>choice('utility'+s,s,['Landlord','Tenant'])),area('utilityDetails','If the tenant is responsible, provide details of the arrangement')],
7:[choice('discount','Rent discount',['There is no rent discount','The lawful rent will be discounted as follows']),area('discountDetails','Description of rent discount')],
8:[choice('rentDepositRequired','Rent deposit',['A rent deposit is not required','The tenant will pay a rent deposit']),money('rentDeposit','Rent deposit ($)')],
9:[choice('keyDepositRequired','Key deposit',['A key deposit is not required','The tenant will pay a refundable key deposit']),money('keyDeposit','Refundable key deposit ($)'),area('keys','Description and number of keys, access cards and remote entry devices')],
10:[choice('smoking','Additional rules on smoking',['None','Smoking rules']),area('smokingRules','Description of smoking rules')],
11:[choice('insurance','Tenant’s insurance',['There are no tenant insurance requirements','The tenant must have liability insurance at all times'])],
12:[],13:[],14:[],
15:[choice('additional','Additional terms',['There are no additional terms','This agreement includes an attachment with additional terms']),area('additionalTerms','Additional terms attachment (printed on a separate page)')],
16:[],17:[{type:'signatures'}]
};
for (const k of Object.keys(groups)) if (!Array.isArray(data[k]) || !data[k].length) data[k]=[{}];
function total() { return (Number(data.baseRent||0)+Number(data.parkingRent||0)+(data.rentExtras||[]).reduce((s,r)=>s+Number(r['Cost ($)']||0),0)).toFixed(2); }
function value(spec) {return data[spec.key] ?? spec.default ?? '';}
function control(spec,keyOverride,valOverride) {
 const key=keyOverride||spec.key, val=valOverride??value(spec), id='f-'+key;
 if(spec.type==='select') return `<label class="field wide" for="${esc(id)}"><span>${esc(spec.label)}</span><select id="${esc(id)}" data-key="${esc(key)}"><option value="">Select an option</option>${spec.options.map(o=>`<option ${val===o?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
 if(spec.type==='total')return `<div class="rent-total"><span>${esc(spec.label)}</span><output id="rent-total">$${total()}</output></div>`;
 return `<label class="field ${spec.type==='textarea'?'wide':''}" for="${esc(id)}"><span>${esc(spec.label)}</span>${spec.type==='textarea'?`<textarea id="${esc(id)}" rows="3" data-key="${esc(key)}">${esc(val)}</textarea>`:`<input id="${esc(id)}" data-key="${esc(key)}" type="${spec.type}" value="${esc(val)}" ${spec.type==='number'?`min="0" step="0.01" ${spec.key==='nsf'?'max="20"':''}`:''}>`}</label>`;
}
function repeated(key) {
 const [name,labels]=groups[key];
 return `<div class="repeat wide">${data[key].map((row,i)=>`<div class="repeat-row"><div class="row-heading"><span>${name.toUpperCase()} ${String(i+1).padStart(2,'0')}</span>${data[key].length>1?`<button type="button" class="text-button danger" data-remove="${key}" data-index="${i}">Remove ${name.toLowerCase()} ${i+1}</button>`:''}</div><div class="fields">${labels.map(label=>control(f('',label,label==='Cost ($)'?'number':'text'),`${key}:${i}:${label}`,row[label]||'')).join('')}</div></div>`).join('')}<button class="add-button" data-add="${key}">＋ Add ${name.toLowerCase()}</button></div>`;
}
function signatureEditor() {return `<p class="wide muted">Signature lines will be provided for every landlord and tenant listed in Section 1. Leave the lines blank to sign by hand after printing.</p>${['landlords','tenants'].map(g=>`<div class="wide"><h3>${g==='landlords'?'Landlord(s)':'Tenant(s)'}</h3>${data[g].map((r,i)=>`<div class="signature-edit"><strong>${esc(person(g,r)||`${g==='landlords'?'Landlord':'Tenant'} ${i+1}`)}</strong>${control(date(`sig-${g}-${i}`,'Date signed (optional)'))}<span class="muted">Signature: __________________________</span></div>`).join('')}</div>`).join('')}`;}
function person(g,r){return g==='landlords'?r['Legal name']:[r['First name'],r['Last name']].filter(Boolean).join(' ');}
function persist() {if(persisted){try{localStorage.setItem(storageKey,JSON.stringify(data));$('#save-status').textContent='✓ Draft saved on this device';}catch{$('#save-status').textContent='Storage unavailable — export your draft to keep it';}}}
function navigation(){ $('#navigation').innerHTML=Object.entries(content.sections).map(([i,s])=>`<button class="nav-item ${!reviewing&&+i===current?'active':''}" aria-label="Section ${i}: ${esc(s.title)}" data-section="${i}" ${!reviewing&&+i===current?'aria-current="step"':''}><span class="nav-number">${String(i).padStart(2,'0')}</span><span>${esc(s.title)}</span>${+i===current&&!reviewing?'<span class="nav-arrow">→</span>':''}</button>`).join('')+`<button class="nav-item ${reviewing?'active':''}" id="nav-review"><span class="nav-number">✓</span><span>Review & print</span></button>`; }
function render(){reviewing=false;document.body.classList.remove('review-mode');$('#review-area').hidden=true;$('#form-area').hidden=false;document.querySelectorAll('.editor-only').forEach(e=>e.hidden=false);navigation();
 const section=content.sections[current];$('#title').textContent=section.title;$('#crumb').textContent=section.title;$('#step-label').textContent=`SECTION ${String(current).padStart(2,'0')} OF 17`;$('#description').textContent=hints[current]||'Complete the details and review the terms for this section.';$('#progress-bar').style.width=`${current/17*100}%`;$('#section-count').textContent=`${current} of 17`;$('#previous').disabled=current===1;$('#next').innerHTML=current===17?'Review agreement <span>→</span>':'Continue <span>→</span>';
 const notes=section.notes;
 $('#form-area').innerHTML=`<section class="card"><div class="card-heading"><span class="small-icon">${current===1?'♧':'▤'}</span><div><h2>${esc(section.title)}</h2><p>${current===1?'Add everyone who will be a party to this agreement.':'Details for your residential tenancy agreement.'}</p></div></div><div class="fields">${schemas[current].map(s=>s.type==='heading'?`<h3 class="wide">${esc(s.label)}</h3>`:s.type==='repeat'?repeated(s.key):s.type==='signatures'?signatureEditor():control(s)).join('')}</div>${notes.length?`<div class="legal-notes">${notes.map(t=>`<p>${esc(t)}</p>`).join('')}</div>`:''}${current===2?'<p class="legal-notes">If the unit is a condominium, the tenant agrees to comply with the condominium declaration, by-laws and rules, as provided by the landlord.</p>':''}${current===10?'<p class="legal-notes">Under provincial law, smoking is not allowed in any indoor common areas of the building.</p>':''}${current===11?'<p class="legal-notes">If liability insurance is required and the landlord asks for proof of coverage, the tenant must provide it. It is up to the tenant to get contents insurance if they want it.</p>':''}</section>`;
}
function answer(label,val){return `<div class="answer"><dt>${esc(label)}</dt><dd>${val!==''&&val!=null?esc(val):'<span class="blank">Not entered</span>'}</dd></div>`;}
function reviewSection(n){const s=content.sections[n];return `<section class="print-section"><h2>${n}. ${esc(s.title)}</h2><dl>${schemas[n].map(spec=>{
 if(spec.type==='heading')return `<h3>${esc(spec.label)}</h3>`;
 if(spec.type==='repeat')return data[spec.key].map((r,i)=>`<div class="review-row"><h4>${groups[spec.key][0]} ${i+1}</h4>${groups[spec.key][1].map(l=>answer(l,r[l]||'')).join('')}</div>`).join('');
 if(spec.type==='signatures')return ['landlords','tenants'].map(g=>`<h3>${g==='landlords'?'Landlord(s)':'Tenant(s)'}</h3>${data[g].map((r,i)=>`<div class="signature-line"><span>${esc(person(g,r)||'Name: ____________________')}</span><span>Signature: ____________________</span><span>Date: ${esc(data[`sig-${g}-${i}`]||'________________')}</span></div>`).join('')}`).join('');
 if(spec.key==='additionalTerms')return '';
 return answer(spec.label,spec.type==='total'?'$'+total():value(spec));
 }).join('')}</dl><div class="agreement-wording">${s.wording.map(t=>`<p>${esc(t)}</p>`).join('')}</div></section>`;}
function review(force=false){if(!force&&!valid())return;reviewing=true;document.body.classList.add('review-mode');navigation();$('#form-area').hidden=true;document.querySelectorAll('.editor-only').forEach(e=>e.hidden=true);$('#review-area').hidden=false;
 const missing = ['street','city','start','baseRent'].filter(k=>!data[k]);
 $('#review-area').innerHTML=`<div class="review-tools no-print"><div><span class="eyebrow">YOUR AGREEMENT</span><h1>Ready for a final look.</h1><p>Review all details below, then print or choose “Save as PDF” in your browser’s print dialog.</p></div><div class="review-buttons"><button class="button" id="back-edit">← Keep editing</button><button class="button primary" id="print">Print / Save as PDF →</button></div><p class="review-note">Web transcription of form 2229E (2020/12). The layout differs from the supplied PDF. Blank signature lines are provided for signing after printing. <a href="./original-lease.pdf" download>Original PDF</a></p>${missing.length?'<p class="warning">Some key details are still blank. You can return to editing or print a blank/partial agreement.</p>':''}</div><article class="paper"><header class="paper-heading"><span>ONTARIO · FORM 2229E (2020/12)</span><h1>Residential Tenancy Agreement</h1><h2>(Standard Form of Lease)</h2><p>This tenancy agreement (or lease) is required for tenancies entered into on March 1, 2021 or later. It does not apply to care homes, sites in mobile home parks and land lease communities, most social housing, certain other special tenancies or co-operative housing (see Part A of General Information). Residential tenancies in Ontario are governed by the Residential Tenancies Act, 2006. This agreement cannot take away a right or responsibility under the Act. Under the Ontario Human Rights Code, everyone has the right to equal treatment in housing without discrimination or harassment. All sections of this agreement are mandatory and cannot be changed.</p></header>${Object.keys(content.sections).map(n=>reviewSection(+n)).join('')}${data.additionalTerms?`<section class="attachment"><h2>Section 15 · Additional terms attachment</h2><p class="multiline">${esc(data.additionalTerms)}</p></section>`:''}<section class="appendix"><h2>Appendix: General Information</h2>${content.appendix.map(t=>/^[A-U]\. /.test(t)?`<h3>${esc(t)}</h3>`:`<p>${esc(t)}</p>`).join('')}</section></article>`;window.scrollTo(0,0);}
function valid(){const invalid=$('#form-area input:invalid');if(!reviewing&&invalid){invalid.reportValidity();return false;}return true;}
document.addEventListener('input',e=>{const key=e.target.dataset.key;if(!key)return;if(key.includes(':')){const[g,i,l]=key.split(':');data[g][i][l]=e.target.value;}else data[key]=e.target.value;persist();const out=$('#rent-total');if(out)out.textContent='$'+total();});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.section){if(!valid())return;current=+b.dataset.section;render();window.scrollTo(0,0);}
 if(b.dataset.add){data[b.dataset.add].push({});persist();render();}
 if(b.dataset.remove){data[b.dataset.remove].splice(+b.dataset.index,1);persist();render();}
 if(['review-top','nav-review'].includes(b.id))review();
 if(b.id==='next'&&valid()){if(current===17)review();else{current++;render();window.scrollTo(0,0);}}
 if(b.id==='previous'){current=Math.max(1,current-1);render();window.scrollTo(0,0);}
 if(b.id==='back-edit')render();
 if(b.id==='print')window.print();
 if(b.id==='save-local'){persisted=true;persist();}
 if(b.id==='export'){const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ontario-lease-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 if(b.id==='import')$('#import-file').click();
 if(b.id==='clear')$('#confirm-clear').showModal();
 if(b.id==='cancel-clear')$('#confirm-clear').close();
 if(b.id==='confirm-delete'){data={};for(const k in groups)data[k]=[{}];try{localStorage.removeItem(storageKey);}catch{}persisted=false;current=1;$('#confirm-clear').close();$('#save-status').textContent='Draft cleared';render();}
});
$('#import-file').addEventListener('change',async e=>{try{const imported=JSON.parse(await e.target.files[0].text());if(imported.version!==1||!imported.data||typeof imported.data!=='object'||Array.isArray(imported.data))throw Error();const next=imported.data;for(const k in groups){if(!Array.isArray(next[k])||!next[k].length||next[k].length>100||next[k].some(r=>!r||typeof r!=='object'||Array.isArray(r)||Object.values(r).some(v=>typeof v!=='string')))throw Error();}for(const [k,v]of Object.entries(next)){if(!Object.hasOwn(groups,k)&&typeof v!=='string')throw Error();}data=next;persist();render();$('#save-status').textContent='✓ Draft imported';}catch{$('#save-status').textContent='Could not import. Choose a valid exported lease draft.';}e.target.value='';});
window.addEventListener('beforeprint',()=>{if(!reviewing)review(true);});
render();if(persisted)$('#save-status').textContent='✓ Saved draft restored from this device';
