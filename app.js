const content = await fetch('./lease-content.json').then(r => r.json());
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storageKey = 'ontario-lease-v1';
let data = {}, current = 1, reviewing = false, persisted = false, unsavedChanges = false, startupMessage = '';
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
const schemaFields=Object.fromEntries(Object.entries(schemas).flatMap(([section,items])=>items.filter(s=>s.key&&s.type!=='repeat').map(s=>[s.key,{...s,section:Number(section)}])));
const conditions={
 noticeEmails:['emailConsent','Yes'],emergency:['emergencyConsent','Yes'],
 end:['term','A fixed length of time'],otherTerm:['term','Other (e.g., daily, weekly)'],
 otherFrequency:['frequency','Other (e.g., weekly)'],
 laundryCharge:['service3','Yes'],guestCharge:['service4','Yes'],
 discountDetails:['discount','The lawful rent will be discounted as follows'],
 rentDeposit:['rentDepositRequired','The tenant will pay a rent deposit'],
 keyDeposit:['keyDepositRequired','The tenant will pay a refundable key deposit'],keys:['keyDepositRequired','The tenant will pay a refundable key deposit'],
 smokingRules:['smoking','Smoking rules'],additionalTerms:['additional','This agreement includes an attachment with additional terms']
};
function activeField(key,state=data){const condition=conditions[key];return !condition||state[condition[0]]===condition[1];}
function numericText(value){return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())&&Number.isFinite(Number(value));}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number(value.slice(0,4))>=1&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function normalizedDraft(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('The draft is not a lease object.');
 const next={};
 const forbidden=k=>['__proto__','constructor','prototype'].includes(k);
 for(const[key,value]of Object.entries(raw)){
  if(forbidden(key))throw Error('The draft contains an unsupported field.');
  if(Object.hasOwn(groups,key)){
   if(!Array.isArray(value)||!value.length||value.length>100)throw Error('The draft contains an invalid list.');
   next[key]=value.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.entries(row).some(([k,v])=>forbidden(k)||typeof v!=='string'))throw Error('The draft contains an invalid entry.');
    if(row._signatureDate&&!validDate(row._signatureDate))throw Error('A signature date is invalid.');
    if(row._signatureMode&&!['draw','type'].includes(row._signatureMode))throw Error('A signature method is invalid.');
    if(key==='rentExtras'&&row['Cost ($)']?.trim()&&!numericText(row['Cost ($)']))throw Error('A rent amount is invalid.');
    const clean={...row};
    if(key==='otherServices'&&row['Included (Yes / No)']?.trim()){const answer=row['Included (Yes / No)'].trim().toLowerCase();if(!['yes','no'].includes(answer))throw Error('Choose Yes or No for other services.');clean['Included (Yes / No)']=answer==='yes'?'Yes':'No';}
    return clean;
   });
  }else{
   if(typeof value!=='string')throw Error('Draft fields must contain text.');
   if(/^sig-(landlords|tenants)-\d+$/.test(key)&&value&&!validDate(value))throw Error('A signature date is invalid.');
   const spec=schemaFields[key];
   if(value&&spec?.type==='select'&&!spec.options.includes(value))throw Error('A draft selection is invalid.');
   if(value&&spec?.type==='date'&&!validDate(value))throw Error('A draft date is invalid.');
   if(value.trim()&&spec?.type==='number'&&!numericText(value))throw Error('A draft amount is invalid.');
   next[key]=value;
  }
 }
 for(const key of Object.keys(groups))if(!next[key])next[key]=[{}];
 return next;
}
let savedDraft=null;
try{savedDraft=localStorage.getItem(storageKey);}catch{startupMessage='Device storage is unavailable. Use Download draft to keep a copy of your information.';}
if(savedDraft!==null){try{data=normalizedDraft(JSON.parse(savedDraft));persisted=true;}catch{startupMessage='A saved draft could not be opened. Start a new draft or use Open draft to restore a downloaded copy.';}}
for(const key of Object.keys(groups))if(!data[key])data[key]=[{}];
function amountProblem(value,max=Infinity){
 if(!String(value??'').trim())return '';
 const n=Number(value),cents=n*100;
 if(!numericText(String(value))||n<0)return 'Enter a valid amount of zero or more.';
 if(!Number.isSafeInteger(Math.round(cents))||Math.abs(cents-Math.round(cents))>0.000001)return 'Enter an amount with no more than two decimal places.';
 if(n>max)return `Enter an amount no greater than $${max.toFixed(2)}.`;
 return '';
}
function draftIssues(){
 const issues=[];
 for(const spec of Object.values(schemaFields)){
  const v=data[spec.key];if(!activeField(spec.key)||!v)continue;
  let message='';
  if(spec.type==='number')message=amountProblem(v,spec.key==='nsf'?20:Infinity);
  if(spec.type==='date'&&!validDate(v))message='Enter a valid date.';
  if(spec.type==='select'&&!spec.options.includes(v))message='Choose an available option.';
  if(message)issues.push({key:spec.key,section:spec.section,message:`${spec.label}: ${message}`});
 }
 data.rentExtras.forEach((row,i)=>{const message=amountProblem(row['Cost ($)']);if(message)issues.push({key:`rentExtras:${i}:Cost ($)`,section:5,message:`Service or utility ${i+1}: ${message}`});});
 if(total()===null&&!issues.some(issue=>issue.key==='baseRent'||issue.key==='parkingRent'||issue.key.startsWith('rentExtras:')))issues.push({key:'baseRent',section:5,message:'The combined rent amount is outside the supported range.'});
 if(activeField('end')&&data.start&&data.end&&data.end<data.start)issues.push({key:'end',section:4,message:'The fixed term end date must be on or after the tenancy start date.'});
 if(data.partialFrom&&data.partialTo&&data.partialTo<data.partialFrom)issues.push({key:'partialTo',section:5,message:'The partial rental period must end on or after it starts.'});
 return issues;
}
function refreshConditions(){
 document.querySelectorAll('[data-condition]').forEach(label=>{
  const enabled=activeField(label.dataset.condition);label.hidden=!enabled;
  label.querySelectorAll('input,textarea,select').forEach(el=>{el.disabled=!enabled;if(!enabled)el.setCustomValidity('');});
 });
}
function invalidateSignatures(){
 const parties=[...data.landlords,...data.tenants];
 if(!parties.some(row=>signatureStrokes(row).length||row._signatureText?.trim()))return false;
 for(const row of parties){delete row._signatureStrokes;delete row._signatureText;delete row._signatureDate;}
 data._signaturesCleared='yes';return true;
}
function finishSigning(){if([...data.landlords,...data.tenants].every(hasSignature))delete data._signaturesCleared;}
function total() {
 const amounts=[data.baseRent,data.parkingRent,...data.rentExtras.map(row=>row['Cost ($)'])];
 if(amounts.some(v=>amountProblem(v)))return null;
 const cents=amounts.reduce((sum,v)=>sum+Math.round(Number(v||0)*100),0);
 return Number.isSafeInteger(cents)?(cents/100).toFixed(2):null;
}
function totalLabel(){const sum=total();return sum===null?'Check rent amounts':'$'+sum;}
function value(spec) {return data[spec.key] ?? spec.default ?? '';}
function control(spec,keyOverride,valOverride) {
 const key=keyOverride||spec.key, val=valOverride??value(spec), id='f-'+key;
 const conditional=Object.hasOwn(conditions,key),enabled=activeField(key),attrs=conditional?`data-condition="${esc(key)}" ${enabled?'':'hidden'}`:'',disabled=enabled?'':'disabled';
 if(spec.type==='select') return `<label class="field wide" for="${esc(id)}" ${attrs}><span>${esc(spec.label)}</span><select id="${esc(id)}" data-key="${esc(key)}" ${disabled}><option value="">Select an option</option>${spec.options.map(o=>`<option ${val===o?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
 if(spec.type==='total')return `<div class="rent-total"><span>${esc(spec.label)}</span><output id="rent-total">${totalLabel()}</output></div>`;
 return `<label class="field ${spec.type==='textarea'?'wide':''}" for="${esc(id)}" ${attrs}><span>${esc(spec.label)}</span>${spec.type==='textarea'?`<textarea id="${esc(id)}" rows="3" data-key="${esc(key)}" ${disabled}>${esc(val)}</textarea>`:`<input id="${esc(id)}" data-key="${esc(key)}" type="${spec.type}" value="${esc(val)}" ${disabled} ${spec.type==='number'?`min="0" step="0.01" ${spec.key==='nsf'?'max="20"':''}`:''}>`}</label>`;
}
function repeated(key) {
 const [name,labels]=groups[key];
 return `<div class="repeat wide">${data[key].map((row,i)=>`<div class="repeat-row"><div class="row-heading"><span>${name.toUpperCase()} ${String(i+1).padStart(2,'0')}</span>${data[key].length>1?`<button type="button" class="text-button danger" data-remove="${key}" data-index="${i}">Remove ${name.toLowerCase()} ${i+1}</button>`:''}</div><div class="fields">${labels.map(label=>control(label==='Included (Yes / No)'?choice('',label,['Yes','No']):f('',label,label==='Cost ($)'?'number':'text'),`${key}:${i}:${label}`,row[label]||'')).join('')}</div></div>`).join('')}<button class="add-button" data-add="${key}">＋ Add ${name.toLowerCase()}</button></div>`;
}
function signatureStrokes(row) {
 try {
  const strokes=JSON.parse(row._signatureStrokes||'[]');
  if(!Array.isArray(strokes)||strokes.length>100) return [];
  if(strokes.some(stroke=>!Array.isArray(stroke)||!stroke.length||stroke.length>4000||stroke.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))))return [];
  return strokes;
 }catch{return [];}
}
function signatureMode(row) { return row._signatureMode==='type'?'type':'draw'; }
function hasSignature(row) { return signatureMode(row)==='type'?Boolean(row._signatureText?.trim()):signatureStrokes(row).length>0; }
function migrateSignatureDates() {
 for(const g of ['landlords','tenants']) data[g].forEach((r,i)=>{const key=`sig-${g}-${i}`;if(data[key]&&!r._signatureDate)r._signatureDate=data[key];delete data[key];});
}
migrateSignatureDates();
function signatureEditor() {
 return `${data._signaturesCleared?'<p class="wide warning">Lease details changed after signing. Please have each party sign the updated agreement again.</p>':''}<p class="wide muted">Draw with your mouse, trackpad, or finger, or choose <strong>Type signature</strong>. Sign electronically only if all parties agree. You can also leave the signature blank and sign after printing.</p>${['landlords','tenants'].map(g=>`<div class="wide"><h3>${g==='landlords'?'Landlord(s)':'Tenant(s)'}</h3>${data[g].map((r,i)=>{
  const name=person(g,r)||`${g==='landlords'?'Landlord':'Tenant'} ${i+1}`, key=`${g}:${i}`, mode=signatureMode(r);
  return `<section class="signature-edit" data-signer="${key}" aria-label="Signature for ${esc(name)}"><div class="signer-heading"><strong>${esc(name)}</strong><span class="signature-status" role="status">${hasSignature(r)?'✓ Signature added':'Not signed yet'}</span></div><div class="signature-modes" role="group" aria-label="Signature method for ${esc(name)}"><button class="button" data-signature-mode="draw" data-signer-key="${key}" aria-pressed="${mode==='draw'}">Draw signature</button><button class="button" data-signature-mode="type" data-signer-key="${key}" aria-pressed="${mode==='type'}">Type signature</button></div><div class="signature-drawing" ${mode==='draw'?'':'hidden'}><p id="signature-help-${g}-${i}" class="signature-help">Click and hold while moving to sign. On a trackpad, click and drag.</p><canvas class="signature-pad" width="1000" height="280" data-signature-pad="${key}" role="img" aria-label="Draw signature for ${esc(name)}" aria-describedby="signature-help-${g}-${i}">Choose Type signature to sign using the keyboard.</canvas><span class="pad-caption" aria-hidden="true">Sign in the box above</span></div><div class="signature-typing" ${mode==='type'?'':'hidden'}>${control(f('',`Type signature for ${name}`),`${key}:_signatureText`,r._signatureText||'')}</div><div class="signature-actions"><button class="text-button" data-signature-undo="${key}" ${mode==='draw'&&signatureStrokes(r).length?'':'disabled'}>Undo last stroke</button><button class="text-button danger" data-signature-clear="${key}" ${hasSignature(r)||r._signatureText||signatureStrokes(r).length?'':'disabled'}>Clear signature</button></div>${control(date('',`Date signed for ${name} (optional)`),`${key}:_signatureDate`,r._signatureDate||'')}</section>`;
 }).join('')}</div>`).join('')}`;
}
function updateSignatureStatus(g,i) {
 const row=data[g][i], card=$(`[data-signer="${g}:${i}"]`);
 if(!card)return;
 card.querySelector('.signature-status').textContent=hasSignature(row)?'✓ Signature added':'Not signed yet';
 card.querySelector('[data-signature-undo]').disabled=signatureMode(row)!=='draw'||!signatureStrokes(row).length;
 card.querySelector('[data-signature-clear]').disabled=!row._signatureText&&!signatureStrokes(row).length;
}
function paintSignature(canvas,strokes) {
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.strokeStyle='#173c43';ctx.fillStyle='#173c43';ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';
 for(const stroke of strokes){if(!stroke.length)continue;ctx.beginPath();ctx.moveTo(stroke[0][0]*canvas.width,stroke[0][1]*canvas.height);for(const p of stroke.slice(1))ctx.lineTo(p[0]*canvas.width,p[1]*canvas.height);ctx.stroke();ctx.beginPath();ctx.arc(stroke[0][0]*canvas.width,stroke[0][1]*canvas.height,2,0,2*Math.PI);ctx.fill();}
}
function initializeSignaturePads() {
 document.querySelectorAll('[data-signature-pad]').forEach(canvas=>{
  const[g,i]=canvas.dataset.signaturePad.split(':'),row=data[g][i];let strokes=signatureStrokes(row),pointer=null;
  paintSignature(canvas,strokes);
  const point=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))].map(n=>Math.round(n*10000)/10000);};
  const store=()=>{row._signatureStrokes=JSON.stringify(strokes);row._signatureMode='draw';unsavedChanges=true;};
  canvas.addEventListener('pointerdown',e=>{
   if(pointer!==null||!e.isPrimary||e.button!==0||strokes.length>=100)return;
   e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);strokes.push([point(e)]);store();paintSignature(canvas,strokes);
  });
  canvas.addEventListener('pointermove',e=>{
   if(e.pointerId!==pointer)return;e.preventDefault();
   const stroke=strokes[strokes.length-1];const samples=e.getCoalescedEvents?.();for(const sample of (samples?.length?samples:[e]))if(stroke.length<4000)stroke.push(point(sample));store();paintSignature(canvas,strokes);
  });
  const finish=e=>{if(e.pointerId!==pointer)return;pointer=null;store();finishSigning();persist();updateSignatureStatus(g,i);};
  canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);canvas.addEventListener('lostpointercapture',finish);
 });
}
function printedSignature(row,name) {
 if(!hasSignature(row))return '<span class="unsigned-signature">Signature: ____________________</span>';
 if(signatureMode(row)==='type')return `<span class="printed-signature"><span class="signature-typed" role="img" aria-label="Typed signature of ${esc(name)}">${esc(row._signatureText)}</span><span class="signature-caption">Signature (typed)</span></span>`;
 const marks=signatureStrokes(row).map(stroke=>`<path d="${stroke.map((p,i)=>`${i?'L':'M'}${p[0]*1000} ${p[1]*280}`).join(' ')}"/><circle cx="${stroke[0][0]*1000}" cy="${stroke[0][1]*280}" r="2"/>`).join('');
 return `<span class="printed-signature"><svg class="signature-image" viewBox="0 0 1000 280" role="img" aria-label="Drawn signature of ${esc(name)}"><g fill="none" stroke="#173c43" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${marks}</g></svg><span class="signature-caption">Signature (drawn)</span></span>`;
}
function person(g,r){return g==='landlords'?r['Legal name']:[r['First name'],r['Last name']].filter(Boolean).join(' ');}
function persist(){if(!persisted)return false;try{localStorage.setItem(storageKey,JSON.stringify(data));unsavedChanges=false;$('#save-status').textContent='✓ Draft saved on this device';return true;}catch{$('#save-status').textContent='Could not save on this device. Use Download draft to keep your changes.';return false;}}
function setTextSize(large) {
 document.documentElement.classList.toggle('large-text',large);
 $('#text-size').setAttribute('aria-pressed',String(large));
 $('#text-size').textContent=large?'A− Standard text':'A+ Larger text';
 $('#text-size').title=large?'Return to standard text size':'Increase text size';
}
try { setTextSize(localStorage.getItem('ontario-lease-large-text')==='true'); } catch {}
const steps=[
 {label:'Parties & rental unit',title:'Parties and rental unit',sections:[2,1,3,4],description:'Enter the property, landlord, tenant, and tenancy details for your Ontario lease.'},
 {label:'Rent & payment terms',title:'Rent and payment terms',sections:[5,7,8,9],description:'Set the rent, payment schedule, discounts, and deposits.'},
 {label:'Services & utilities',title:'Services and utilities',sections:[6],description:'Choose the services included in the rent and who pays for utilities.'},
 {label:'Other provisions',title:'Other provisions',sections:[10,11,12,13,14,16],description:'Set the smoking and insurance requirements, then read the remaining lease terms.'},
 {label:'Additional terms',title:'Additional terms',sections:[15],description:'Include any additional terms you and the other parties have agreed to.'},
 {label:'Signatures',title:'Sign your agreement',sections:[17],description:'Each landlord and tenant can draw or type their own signature below.'},
 {label:'Review & print',title:'Review and print',sections:[]}
];
function stepIndex(){return steps.findIndex(step=>step.sections.includes(current));}
function navigation(){
 const active=reviewing?6:stepIndex();
 $('#navigation').innerHTML=steps.map((step,i)=>`<button class="nav-item ${active===i?'active':''}" data-step="${i}" aria-label="Step ${i+1}: ${esc(step.label)}" ${active===i?'aria-current="step"':''}><span class="nav-number">${i+1}</span><span class="step-name">${esc(step.label)}</span></button>`).join('');
}
function sectionCard(current){
 const section=content.sections[current],notes=section.notes;
 return `<section class="card" id="section-${current}" aria-labelledby="section-title-${current}"><div class="card-heading"><span class="small-icon">${current===1?'♧':'▤'}</span><div><h2 id="section-title-${current}">${esc(section.title)}</h2><p>Section ${current} of the Ontario Residential Tenancy Agreement. ${current===1?'Add the landlord and everyone renting the unit.':schemas[current].length?'Enter the details for this part of your lease.':'Read these terms before continuing.'}</p></div></div><div class="card-body"><div class="fields">${schemas[current].map(s=>s.type==='heading'?`<h3 class="wide">${esc(s.label)}</h3>`:s.type==='repeat'?repeated(s.key):s.type==='signatures'?signatureEditor():control(s)).join('')}</div>${notes.length?`<details class="legal-notes" ${schemas[current].length?'':'open'}><summary>Read agreement terms & important notes</summary>${notes.map(t=>`<p>${esc(t)}</p>`).join('')}</details>`:''}${current===2?'<p class="legal-notes">If the unit is a condominium, the tenant agrees to comply with the condominium declaration, by-laws and rules, as provided by the landlord.</p>':''}${current===10?'<p class="legal-notes">Under provincial law, smoking is not allowed in any indoor common areas of the building.</p>':''}${current===11?'<p class="legal-notes">If liability insurance is required and the landlord asks for proof of coverage, the tenant must provide it. It is up to the tenant to get contents insurance if they want it.</p>':''}</div></section>`;
}
function render(){
 reviewing=false;$('#validation-message').hidden=true;document.body.classList.remove('review-mode');$('#review-area').hidden=true;$('#form-area').hidden=false;document.querySelectorAll('.editor-only').forEach(e=>e.hidden=false);navigation();
 const index=stepIndex(),step=steps[index];
 $('#section-jump').innerHTML=Object.entries(content.sections).map(([n,s])=>`<option value="${n}" ${+n===current?'selected':''}>${n}. ${esc(s.title)}</option>`).join('');
 $('.progress').setAttribute('aria-valuenow',String(index+1));
 $('#title').textContent=step.title;$('#crumb').textContent=step.title;$('#step-label').textContent=`STEP ${index+1} OF 7`;
 $('#description').textContent=step.description;$('#progress-bar').style.width=`${(index+1)/7*100}%`;$('#section-count').textContent=`Step ${index+1} of 7`;$('#previous').disabled=index===0;
 $('#next').innerHTML=index===5?'Review agreement <span>→</span>':'Continue <span>→</span>';
 $('#form-area').innerHTML=(index===0?`<section class="card standard-card"><div class="card-heading"><h2>Standard agreement</h2><p>Your lease is based on Ontario’s standard form.</p></div><div class="card-body"><div class="standard-document"><span class="file-symbol" aria-hidden="true">▤</span><span>Standard Ontario Residential Tenancy Agreement</span><button class="text-button" id="preview-agreement">Preview →</button></div></div></section>`:'')+step.sections.map(sectionCard).join('');
 if(index===5)initializeSignaturePads();
}
function goToStep(index){
 if(!valid())return;
 if(index===6){review();return;}
 current=steps[index].sections[0];render();window.scrollTo(0,0);$('#title').focus({preventScroll:true});
}
function answer(label,val){return `<div class="answer"><dt>${esc(label)}</dt><dd>${val!==''&&val!=null?esc(val):'<span class="blank">Not entered</span>'}</dd></div>`;}
function reviewSection(n){const s=content.sections[n];return `<section class="print-section"><h2>${n}. ${esc(s.title)}</h2><dl>${schemas[n].map(spec=>{
 if(spec.type==='heading')return `<h3>${esc(spec.label)}</h3>`;
 if(spec.type==='repeat')return data[spec.key].map((r,i)=>`<div class="review-row"><h4>${groups[spec.key][0]} ${i+1}</h4>${groups[spec.key][1].map(l=>answer(l,r[l]||'')).join('')}</div>`).join('');
 if(spec.type==='signatures')return ['landlords','tenants'].map(g=>`<h3>${g==='landlords'?'Landlord(s)':'Tenant(s)'}</h3>${data[g].map((r,i)=>`<div class="signature-line"><span class="printed-signer-name">${esc(person(g,r)||'Name: ____________________')}</span>${printedSignature(r,person(g,r)||`${g==='landlords'?'Landlord':'Tenant'} ${i+1}`)}<span class="printed-signature-date">Date: ${esc(r._signatureDate||'________________')}</span></div>`).join('')}`).join('');
 if(spec.key==='additionalTerms'||!activeField(spec.key))return '';
 return answer(spec.label,spec.type==='total'?totalLabel():value(spec));
 }).join('')}</dl><div class="agreement-wording">${s.wording.map(t=>`<p>${esc(t)}</p>`).join('')}</div></section>`;}
function review(force=false){if(!force&&!valid(true))return;reviewing=true;$('#validation-message').hidden=true;document.body.classList.add('review-mode');navigation();$('#form-area').hidden=true;document.querySelectorAll('.editor-only').forEach(e=>e.hidden=true);$('#review-area').hidden=false;
 const printIssues=draftIssues();
 const missing = ['street','city','start','baseRent'].filter(k=>!data[k]);
 $('#review-area').innerHTML=`<div class="review-tools no-print"><div><span class="eyebrow">YOUR AGREEMENT</span><h1>Review your lease</h1><p>Review all details below, then print or choose “Save as PDF” in your browser’s print dialog.</p></div><div class="review-buttons"><button class="button" id="back-edit">← Keep editing</button><button class="button primary" id="print">Print / Save as PDF →</button></div><p class="review-note">Web transcription of form 2229E (2020/12). The layout differs from the supplied PDF. Drawn or typed signatures are included below. Unsigned spaces remain blank for signing after printing. <a href="./original-lease.pdf" download>Original PDF</a></p>${data._signaturesCleared?'<p class="warning">Lease details changed after signing. Please return to Step 6 to sign the updated agreement.</p>':''}${missing.length?'<p class="warning">Some key details are still blank. You can return to editing or print a blank/partial agreement.</p>':''}</div><article class="paper">${printIssues.length?`<div class="print-validation-warning"><strong>DRAFT — entered values need correction</strong><ul>${printIssues.map(issue=>`<li>${esc(issue.message)}</li>`).join('')}</ul></div>`:''}<header class="paper-heading"><span>ONTARIO · FORM 2229E (2020/12)</span><h1>Residential Tenancy Agreement</h1><h2>(Standard Form of Lease)</h2><p>This tenancy agreement (or lease) is required for tenancies entered into on March 1, 2021 or later. It does not apply to care homes, sites in mobile home parks and land lease communities, most social housing, certain other special tenancies or co-operative housing (see Part A of General Information). Residential tenancies in Ontario are governed by the Residential Tenancies Act, 2006. This agreement cannot take away a right or responsibility under the Act. Under the Ontario Human Rights Code, everyone has the right to equal treatment in housing without discrimination or harassment. All sections of this agreement are mandatory and cannot be changed.</p></header>${Object.keys(content.sections).map(n=>reviewSection(+n)).join('')}${activeField('additionalTerms')&&data.additionalTerms?`<section class="attachment"><h2>Section 15 · Additional terms attachment</h2><p class="multiline">${esc(data.additionalTerms)}</p></section>`:''}<section class="appendix"><h2>Appendix: General Information</h2>${content.appendix.map(t=>/^[A-U]\. /.test(t)?`<h3>${esc(t)}</h3>`:`<p>${esc(t)}</p>`).join('')}</section></article>`;window.scrollTo(0,0);}
function valid(all=false){
 const nativeInvalid=$('#form-area input:invalid:not(:disabled)');
 const issues=draftIssues().filter(issue=>all||steps[stepIndex()].sections.includes(issue.section));
 if(issues.length){
  const issue=issues[0];
  if(!steps[stepIndex()].sections.includes(issue.section)||reviewing){current=issue.section;render();}
  const input=document.getElementById('f-'+issue.key);
  $('#validation-message').textContent=issue.message;$('#validation-message').hidden=false;
  if(input){input.setCustomValidity(issue.message);input.reportValidity();input.focus();}
  return false;
 }
 if(nativeInvalid&&!reviewing){nativeInvalid.reportValidity();return false;}
 return true;
}
document.addEventListener('input',e=>{
 const key=e.target.dataset.key;if(!key)return;document.querySelectorAll('[data-key]').forEach(input=>input.setCustomValidity(''));$('#validation-message').hidden=true;
 let signaturesCleared=false;
 if(key.includes(':')){
  const[g,i,l]=key.split(':');
  if(!l.startsWith('_signature')&&data[g][i][l]!==e.target.value)signaturesCleared=invalidateSignatures();
  data[g][i][l]=e.target.value;if(l==='_signatureText'){finishSigning();updateSignatureStatus(g,i);}
 }else{
  if(data[key]!==e.target.value)signaturesCleared=invalidateSignatures();data[key]=e.target.value;
 }
 unsavedChanges=true;refreshConditions();persist();
 if(signaturesCleared)$('#save-status').textContent='Lease details changed. Please sign the updated agreement again in Step 6.';
 const out=$('#rent-total');if(out)out.textContent=totalLabel();
});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.signatureMode){const[g,i]=b.dataset.signerKey.split(':');data[g][i]._signatureMode=b.dataset.signatureMode;unsavedChanges=true;persist();render();document.querySelector(`[data-signer-key="${g}:${i}"][data-signature-mode="${b.dataset.signatureMode}"]`).focus({preventScroll:true});}
 if(b.dataset.signatureClear){const[g,i]=b.dataset.signatureClear.split(':');delete data[g][i]._signatureStrokes;delete data[g][i]._signatureText;unsavedChanges=true;persist();render();}
 if(b.dataset.signatureUndo){const[g,i]=b.dataset.signatureUndo.split(':'),strokes=signatureStrokes(data[g][i]);strokes.pop();data[g][i]._signatureStrokes=JSON.stringify(strokes);unsavedChanges=true;persist();render();}
 if(b.id==='text-size'){const large=!document.documentElement.classList.contains('large-text');setTextSize(large);try{localStorage.setItem('ontario-lease-large-text',String(large));}catch{}}
 if(b.dataset.step!==undefined)goToStep(Number(b.dataset.step));
 if(b.dataset.add){if(data[b.dataset.add].length>=100){$('#save-status').textContent='A draft can contain up to 100 entries in each list.';return;}invalidateSignatures();data[b.dataset.add].push({});unsavedChanges=true;persist();render();}
 if(b.dataset.remove){invalidateSignatures();data[b.dataset.remove].splice(+b.dataset.index,1);unsavedChanges=true;persist();render();}
 if(['review-top','preview-agreement'].includes(b.id))review();
 if(b.id==='next'&&valid()){persist();goToStep(stepIndex()+1);}
 if(b.id==='previous')goToStep(Math.max(0,stepIndex()-1));
 if(b.id==='back-edit')render();
 if(b.id==='print')window.print();
 if(b.id==='save-local'){persisted=true;persist();}
 if(b.id==='export'){const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ontario-lease-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 if(b.id==='import')$('#import-file').click();
 if(b.id==='clear')$('#confirm-clear').showModal();
 if(b.id==='cancel-clear')$('#confirm-clear').close();
 if(b.id==='confirm-delete'){data={};for(const k in groups)data[k]=[{}];let removed=true;try{localStorage.removeItem(storageKey);}catch{removed=false;}persisted=false;unsavedChanges=false;current=1;$('#confirm-clear').close();$('#save-status').textContent=removed?'Draft cleared. Save a draft to keep new changes.':'Fields cleared, but saved browser data could not be removed. Clear site data in your browser settings.';render();}
});
$('#import-file').addEventListener('change',async e=>{
 try{
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>8*1024*1024)throw Error('The draft file is too large (maximum 8 MB).');
  const imported=JSON.parse(await file.text());if(imported.version!==1)throw Error('Choose a version 1 lease draft.');
  const next=normalizedDraft(imported.data);data=next;migrateSignatureDates();unsavedChanges=true;
  const saved=persist();render();$('#save-status').textContent=saved?'✓ Draft imported and saved on this device':'✓ Draft imported. Use Save draft or Download draft to keep it.';
 }catch{$('#save-status').textContent='Could not open that draft. Your current information has been kept. Choose a valid downloaded lease draft.';}
 e.target.value='';
});
$('#section-jump').addEventListener('change',e=>{if(!valid()){e.target.value=String(current);return;}current=Number(e.target.value);render();document.getElementById('section-'+current).scrollIntoView({block:'start'});document.getElementById('section-title-'+current).setAttribute('tabindex','-1');document.getElementById('section-title-'+current).focus({preventScroll:true});});
window.addEventListener('beforeunload',e=>{if(unsavedChanges){e.preventDefault();e.returnValue='';}});
window.addEventListener('beforeprint',()=>{if(!reviewing)review(true);});
render();if(startupMessage)$('#save-status').textContent=startupMessage;else if(persisted)$('#save-status').textContent='✓ Saved draft restored from this device';
