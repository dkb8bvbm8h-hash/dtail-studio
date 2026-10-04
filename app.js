const CONFIG = window.DTAIL_CONFIG || {};
const HAS_CLOUD = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
const supabaseLib = window.supabase || null;
const supabase = (HAS_CLOUD && supabaseLib) ? supabaseLib.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey) : null;
if (HAS_CLOUD && !supabase) console.warn('Supabase könyvtár nem töltődött be; helyi mód használható, felhőszinkron nem érhető el.');

const SERVICES = [
  { id:'fresh', name:'Fresh Interior', price:19990, desc:'Gyors, prémium belső frissítés' },
  { id:'deep', name:'Deep Interior', price:39990, desc:'Mélytisztítás, extrakció, foltkezelés' }
];
const EXTRAS = [
  { id:'extract', name:'Extra kárpittisztítás / extrakció', price:5000 },
  { id:'pet', name:'Állatszőr eltávolítás', price:9990 },
  { id:'ozone', name:'Ózonos szagtalanítás', price:2000 },
  { id:'trunk', name:'Csomagtér mélytisztítás', price:4990 },
  { id:'spot', name:'Erős / speciális foltkezelés', price:4990 }
];

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('hu-HU').format(Math.round(Number(n) || 0)) + ' Ft';
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const uid = p => `${p || 'DT'}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
const localKey = 'dtail_studio_v3_local';
const goalKey = 'dtail_studio_v3_goal';

const state = { jobs:[], customers:[], cars:[], stock:[], goal:1000000, photos:{}, session:null, cloud:HAS_CLOUD, sync:'local', selectedService:SERVICES[0], selectedExtras:[], editingJobId:null, editingCustomerId:null, editingStockId:null, calMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1), realtime:null, realtimeReloadTimer:null };

function legacyDefaultStock(){ return [
  {id:'s1',name:'ADBL Interior Cleaner',qty:72,unit:'%',min:25,price:4500,category:'Vegyszer'},
  {id:'s2',name:'ADBL APC',qty:31,unit:'%',min:25,price:5200,category:'Vegyszer'},
  {id:'s3',name:'ADBL Snow Foam',qty:63,unit:'%',min:20,price:6900,category:'Vegyszer'},
  {id:'s4',name:'ADBL Tire Dressing',qty:55,unit:'%',min:20,price:5900,category:'Vegyszer'},
  {id:'s5',name:'Mikroszálas kendő',qty:18,unit:'db',min:8,price:1200,category:'Textil'},
  {id:'s6',name:'Kárpittisztító vegyszer',qty:22,unit:'%',min:20,price:7900,category:'Vegyszer'}
];}

function loadLocal(){
  let parsed={}; try { parsed=JSON.parse(localStorage.getItem(localKey)||'{}'); } catch { parsed={}; }
  if(parsed.jobs) state.jobs=parsed.jobs;
  if(parsed.customers) state.customers=parsed.customers;
  if(parsed.cars) state.cars=parsed.cars;
  if(parsed.stock) state.stock=parsed.stock;
  if(typeof parsed.goal==='number') state.goal=parsed.goal;
  if(parsed.photos && typeof parsed.photos==='object') state.photos=parsed.photos;
  const oldJobs=readOld('dtail_jobs'); const oldCustomers=readOld('dtail_customers'); const oldStock=readOld('dtail_inventory_v2');
  if(!state.jobs.length && oldJobs.length) state.jobs=migrateJobs(oldJobs);
  if(!state.customers.length && oldCustomers.length) state.customers=oldCustomers;
  if(!state.stock.length) state.stock=oldStock.length ? normalizeStock(oldStock) : legacyDefaultStock();
  if(!Number(localStorage.getItem(goalKey))) state.goal=Number(localStorage.getItem('dtail_goal_v2')) || state.goal;
}
function readOld(k){ try { const v=JSON.parse(localStorage.getItem(k)||'[]'); return Array.isArray(v)?v:[]; } catch { return []; } }
function migrateJobs(arr){ return arr.map(j=>({
  id:j.id||uid('DT'), customerId:j.customerId||null, carId:j.carId||null, customerName:j.customerName||'Ismeretlen ügyfél', phone:j.phone||'', car:j.car||'Ismeretlen autó', plate:(j.plate||'').toUpperCase(), year:Number(j.year)||null, km:Number(j.km)||0,
  serviceId:j.serviceId||SERVICES.find(s=>s.name===j.serviceName)?.id||'fresh', serviceName:j.serviceName||'Fresh Interior', servicePrice:Number(j.servicePrice)||0,
  extras:Array.isArray(j.extras)?j.extras:[], discount:Number(j.discount)||0, cost:Number(j.cost)||0, total:Number(j.total)||0, status:j.status||'open', paymentMethod:j.paymentMethod||'', note:j.note||'', checklist:j.checklist||{before:false,damage:false,after:false},
  startAt:j.startAt||j.date||j.createdAt||new Date().toISOString(), endAt:j.endAt||new Date(new Date(j.date||Date.now()).getTime()+180*60000).toISOString(), closedAt:j.closedAt||null, createdAt:j.createdAt||new Date().toISOString(), updatedAt:new Date().toISOString(), timerStartedAt:null, timerSeconds:Number(j.timerSeconds)||0
})); }
function normalizeStock(arr){ return arr.map(x=>({id:x.id||uid('ST'),name:x.name||'Új termék',qty:Number(x.qty)||0,unit:x.unit||'db',min:Number(x.min ?? x.min_qty)||0,price:Number(x.price ?? x.unit_price)||0,category:x.category||'Egyéb'})); }
function saveLocal(){ localStorage.setItem(localKey, JSON.stringify({jobs:state.jobs,customers:state.customers,cars:state.cars,stock:state.stock,goal:state.goal,photos:state.photos,savedAt:new Date().toISOString()})); localStorage.setItem(goalKey,String(state.goal)); }

function setSync(mode,label){ state.sync=mode; const ids=[['syncDot',mode],['settingsSyncDot',mode]]; ids.forEach(([id,m])=>{ const el=$(id); if(el){el.classList.toggle('local',m==='local');el.classList.toggle('error',m==='error');} }); if($('syncLabel')) $('syncLabel').textContent=label||mode.toUpperCase(); if($('settingsSyncText')) $('settingsSyncText').textContent=label||mode.toUpperCase(); }

async function loadCloud(){
  if(!supabase || !state.session) return;
  setSync('cloud','SYNC…');
  const uid=state.session.user.id;
  const [jobs,customers,cars,stock,settings]=await Promise.all([
    supabase.from('jobs').select('*').eq('user_id',uid).order('start_at',{ascending:false}),
    supabase.from('customers').select('*').eq('user_id',uid).order('name'),
    supabase.from('cars').select('*').eq('user_id',uid).order('created_at'),
    supabase.from('inventory').select('*').eq('user_id',uid).order('name'),
    supabase.from('studio_settings').select('*').eq('user_id',uid).maybeSingle()
  ]);
  for(const r of [jobs,customers,cars,stock,settings]) if(r.error) throw r.error;
  state.jobs=(jobs.data||[]).map(dbJob);
  state.customers=(customers.data||[]).map(dbCustomer);
  state.cars=(cars.data||[]).map(dbCar);
  state.stock=(stock.data||[]).map(dbStock);
  state.goal=Number(settings.data?.monthly_goal||1000000);
  saveLocal();
  await loadPhotoMeta();
  setSync('cloud','CLOUD SYNC');
}

function dbJob(j){ return {...j, customerName:j.customer_name, phone:j.phone||'', car:j.car_label, plate:j.plate||'', year:j.year, km:j.km||0, serviceId:j.service_id, serviceName:j.service_name, servicePrice:Number(j.service_price||0), extras:j.extras||[], discount:Number(j.discount||0), cost:Number(j.cost||0), total:Number(j.total||0), startAt:j.start_at, endAt:j.end_at, timerSeconds:Number(j.timer_seconds||0), timerStartedAt:j.timer_started_at, checklist:j.checklist||{}, createdAt:j.created_at, updatedAt:j.updated_at, closedAt:j.closed_at}; }
function dbCustomer(c){ return {...c, id:c.id, name:c.name, phone:c.phone||'', email:c.email||'', note:c.note||''}; }
function dbCar(c){ return {...c, makeModel:c.make_model, plate:c.plate||'', year:c.year, color:c.color||'', km:c.km||0}; }
function dbStock(s){ return {id:s.id,name:s.name,qty:Number(s.qty||0),unit:s.unit||'db',min:Number(s.min_qty||0),price:Number(s.unit_price||0),category:s.category||'Egyéb',updatedAt:s.updated_at}; }

async function saveJobCloud(j){
  const payload={id:j.id,user_id:state.session.user.id,customer_id:j.customerId||null,car_id:j.carId||null,customer_name:j.customerName,phone:j.phone,car_label:j.car,plate:j.plate,year:j.year||null,km:j.km||0,service_id:j.serviceId,service_name:j.serviceName,service_price:j.servicePrice,extras:j.extras,discount:j.discount,cost:j.cost,total:j.total,status:j.status,payment_method:j.paymentMethod||'',note:j.note||'',checklist:j.checklist||{},start_at:j.startAt,end_at:j.endAt,timer_seconds:j.timerSeconds||0,timer_started_at:j.timerStartedAt||null,closed_at:j.closedAt||null,updated_at:new Date().toISOString()};
  const {data,error}=await supabase.from('jobs').upsert(payload).select().single(); if(error) throw error; return dbJob(data);
}
async function saveCustomerCloud(c){ const p={id:c.id,user_id:state.session.user.id,name:c.name,phone:c.phone||'',email:c.email||'',note:c.note||'',updated_at:new Date().toISOString()}; const {data,error}=await supabase.from('customers').upsert(p).select().single();if(error)throw error;return dbCustomer(data); }
async function saveCarCloud(c){ const p={id:c.id,user_id:state.session.user.id,customer_id:c.customerId,make_model:c.makeModel,plate:c.plate||'',year:c.year||null,color:c.color||'',km:c.km||0,updated_at:new Date().toISOString()}; const {data,error}=await supabase.from('cars').upsert(p).select().single();if(error)throw error;return dbCar(data); }
async function saveStockCloud(s){ const p={id:s.id,user_id:state.session.user.id,name:s.name,qty:s.qty,unit:s.unit,min_qty:s.min,unit_price:s.price,category:s.category||'Egyéb',updated_at:new Date().toISOString()}; const {data,error}=await supabase.from('inventory').upsert(p).select().single();if(error)throw error;return dbStock(data); }
async function deleteCloud(table,id){ const {error}=await supabase.from(table).delete().eq('id',id).eq('user_id',state.session.user.id);if(error)throw error; }
async function saveGoalCloud(){ const {error}=await supabase.from('studio_settings').upsert({user_id:state.session.user.id,monthly_goal:state.goal,updated_at:new Date().toISOString()});if(error)throw error; }

async function loadPhotoMeta(){
  if(!supabase || !state.session) return;
  const {data,error}=await supabase.from('job_photos').select('*').eq('user_id',state.session.user.id).order('created_at'); if(error) throw error; state.photos={};
  for(const row of data||[]){ state.photos[row.job_id]=(state.photos[row.job_id]||[]); const {data:urlData}=await supabase.storage.from('job-photos').createSignedUrl(row.storage_path,3600); state.photos[row.job_id].push({id:row.id,label:row.label||'Fotó',url:urlData?.signedUrl||'',storagePath:row.storage_path}); }
}

async function uploadPhoto(jobId,file,label){
  const compressed=await compressImage(file,1600,.82); const path=`${state.session.user.id}/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const {error:upErr}=await supabase.storage.from('job-photos').upload(path,compressed,{contentType:'image/jpeg',upsert:false}); if(upErr) throw upErr;
  const {data:row,error:dbErr}=await supabase.from('job_photos').insert({user_id:state.session.user.id,job_id:jobId,label,storage_path:path}).select().single(); if(dbErr) throw dbErr;
  const {data:urlData}=await supabase.storage.from('job-photos').createSignedUrl(path,3600); const item={id:row.id,label,url:urlData?.signedUrl||'',storagePath:path}; state.photos[jobId]=(state.photos[jobId]||[]); state.photos[jobId].push(item); return item;
}
function compressImage(file,maxSide,quality){ return new Promise((resolve,reject)=>{ const img=new Image();const fr=new FileReader();fr.onload=()=>{img.onload=()=>{let w=img.width,h=img.height,s=Math.min(1,maxSide/Math.max(w,h));const c=document.createElement('canvas');c.width=Math.round(w*s);c.height=Math.round(h*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);c.toBlob(b=>b?resolve(b):reject(new Error('Kép tömörítési hiba')),'image/jpeg',quality)};img.onerror=reject;img.src=fr.result};fr.onerror=reject;fr.readAsDataURL(file); }); }

function localPhotoData(jobId){ return (state.photos[jobId]||[]); }

function nowLocalInput(date=new Date()){ const d=new Date(date.getTime()-date.getTimezoneOffset()*60000); return d.toISOString().slice(0,16); }
function parseLocal(s){ const d=new Date(s); return isNaN(d)?new Date():d; }
function fmtDate(d){ return new Intl.DateTimeFormat('hu-HU',{dateStyle:'medium'}).format(new Date(d)); }
function fmtTime(d){ return new Intl.DateTimeFormat('hu-HU',{hour:'2-digit',minute:'2-digit'}).format(new Date(d)); }
function sameDay(a,b){ return new Date(a).toDateString()===new Date(b).toDateString(); }
function isClosed(j){ return j.status==='closed' || !!j.closedAt; }
function monthJobs(){ const now=new Date(); return state.jobs.filter(j=>{const d=new Date(j.startAt);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&isClosed(j)}); }
function currentDayJobs(){ const now=new Date(); return state.jobs.filter(j=>sameDay(j.startAt,now)); }
function stockState(x){ const q=Number(x.qty)||0,min=Number(x.min)||0;if(q<=0)return'critical';if(min>0&&q<=min/2)return'critical';if(min>0&&q<=min)return'low';return'ok'; }
function stockLabel(x){ const s=stockState(x); return s==='critical'?'RENDELÉS SZÜKSÉGES':s==='low'?'HAMAROSAN RENDELNI':'RENDBEN'; }
function stockValue(x){ const q=Number(x.qty)||0,p=Number(x.price)||0; return x.unit==='%' ? p*(q/100) : q*p; }
function stockPercent(x){ const q=Number(x.qty)||0,min=Number(x.min)||0; if(x.unit==='%') return Math.max(0,Math.min(100,q)); const target=Math.max(min*3,1); return Math.max(0,Math.min(100,q/target*100)); }
function serviceById(id){ return SERVICES.find(x=>x.id===id)||SERVICES[0]; }
function calcJobTotal(){ const base=state.selectedService?.price||0;const extras=state.selectedExtras.reduce((s,x)=>s+x.price,0);const discount=Number($('fDiscount')?.value)||0;return Math.max(0,base+extras-discount); }

function showView(v){ document.querySelectorAll('.view').forEach(x=>x.classList.remove('active')); const target=$('view-'+v); if(target) target.classList.add('active'); document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v)); const names={dashboard:['Dashboard','D-Tail Studio · Premium detailing workspace'],jobs:['Munkák','Munkalapok és előzmények'],customers:['Ügyfelek & autók','CRM és kezelési előzmények'],calendar:['Naptár','Időpontok és műhelyterv'],inventory:['Készlet','Készletszint és rendelési riasztások'],analytics:['Pénzügyek','Bevétel, költség és fedezet'],ai:['D-Tail AI','Üzleti intelligencia'],settings:['Rendszer','Felhős szinkron és beállítások']}; if(names[v]){$('pageTitle').textContent=names[v][0];$('pageSub').textContent=names[v][1];} closeDrawer(); renderAll(); }
function closeDrawer(){ $('sidebar')?.classList.remove('open');$('drawerOverlay')?.classList.remove('show'); }
function toast(t){ const el=$('toast');el.textContent=t;el.classList.add('show');clearTimeout(window._toast);window._toast=setTimeout(()=>el.classList.remove('show'),2200); }
function closeModal(id){ $(id)?.classList.remove('show'); }

function openNewJob(prefill={}){ state.editingJobId=null;state.selectedService=SERVICES[0];state.selectedExtras=[];$('jobModalTitle').textContent='Új munkalap / időpont';['fCustomer','fPhone','fCar','fPlate','fYear','fKm','fNote'].forEach(id=>$(id).value='');$('fCost').value=0;$('fDiscount').value=0;$('fDuration').value=prefill.duration||180; $('fDate').value=prefill.startAt?nowLocalInput(new Date(prefill.startAt)):nowLocalInput(new Date());['cBefore','cDamage','cAfter'].forEach(id=>$(id).checked=false); renderServiceChoices();renderCart(); $('jobModal').classList.add('show'); }
function openEditJob(id){ const j=state.jobs.find(x=>x.id===id);if(!j)return;state.editingJobId=id;state.selectedService=serviceById(j.serviceId);state.selectedExtras=(j.extras||[]).map(x=>({...x}));$('jobModalTitle').textContent=`Munkalap szerkesztése · ${j.id}`;$('fCustomer').value=j.customerName||'';$('fPhone').value=j.phone||'';$('fCar').value=j.car||'';$('fPlate').value=j.plate||'';$('fYear').value=j.year||'';$('fKm').value=j.km||'';$('fDate').value=nowLocalInput(new Date(j.startAt));$('fDuration').value=Math.max(15,Math.round((new Date(j.endAt)-new Date(j.startAt))/60000)||180);$('fCost').value=j.cost||0;$('fDiscount').value=j.discount||0;$('fNote').value=j.note||'';$('cBefore').checked=!!j.checklist?.before;$('cDamage').checked=!!j.checklist?.damage;$('cAfter').checked=!!j.checklist?.after;renderServiceChoices();renderCart();$('jobModal').classList.add('show'); }
function renderServiceChoices(){ $('serviceGrid').innerHTML=SERVICES.map(s=>`<div class="service ${state.selectedService?.id===s.id?'selected':''}" data-service-id="${s.id}"><b>${esc(s.name)}</b><span>${money(s.price)}</span><p>${esc(s.desc)}</p></div>`).join(''); $('extraGrid').innerHTML=EXTRAS.map(s=>`<div class="service ${state.selectedExtras.some(e=>e.id===s.id)?'selected':''}" data-extra-id="${s.id}"><b>${esc(s.name)}</b><span>+${money(s.price)}</span></div>`).join('');document.querySelectorAll('[data-service-id]').forEach(el=>el.addEventListener('click',()=>{state.selectedService=serviceById(el.dataset.serviceId);renderServiceChoices();renderCart();}));document.querySelectorAll('[data-extra-id]').forEach(el=>el.addEventListener('click',()=>{const x=EXTRAS.find(e=>e.id===el.dataset.extraId);state.selectedExtras=state.selectedExtras.some(e=>e.id===x.id)?state.selectedExtras.filter(e=>e.id!==x.id):[...state.selectedExtras,x];renderServiceChoices();renderCart();})); }
function findConflicts(startAt,endAt,excludeId=null){ const s=new Date(startAt),e=new Date(endAt);return state.jobs.filter(j=>j.id!==excludeId&&!isClosed(j)).filter(j=>{const js=new Date(j.startAt),je=new Date(j.endAt);return s<je&&e>js;}); }
function renderCart(){ const sum=calcJobTotal(); const dis=Number($('fDiscount').value)||0; $('cartLines').innerHTML=`<div class="cartline"><span>${esc(state.selectedService?.name||'')}</span><b>${money(state.selectedService?.price||0)}</b></div>`+state.selectedExtras.map(x=>`<div class="cartline"><span>${esc(x.name)}</span><b>+${money(x.price)}</b></div>`).join('')+(dis?`<div class="cartline"><span>Kedvezmény</span><b>−${money(dis)}</b></div>`:'');$('cartTotal').textContent=money(sum); renderConflict(); }
function renderConflict(){ const start=parseLocal($('fDate').value);const dur=Math.max(15,Number($('fDuration').value)||180);const end=new Date(start.getTime()+dur*60000);const conflicts=findConflicts(start,end,state.editingJobId);const box=$('conflictNotice'); if(!conflicts.length){box.style.display='none';box.innerHTML='';return;}box.style.display='block';box.innerHTML=`<b>Időpontütközés</b><br>${conflicts.map(j=>`${fmtTime(j.startAt)}–${fmtTime(j.endAt)} · ${esc(j.customerName)} · ${esc(j.car)}`).join('<br>')}`; }
async function saveJob(){
  const start=parseLocal($('fDate').value); const duration=Math.max(15,Number($('fDuration').value)||180);const end=new Date(start.getTime()+duration*60000);const conflicts=findConflicts(start,end,state.editingJobId); if(conflicts.length && !confirm('Az időpont ütközik egy másik nyitott munkával. Mentsük így is?')) return;
  const payload={id:state.editingJobId||uid('DT'),customerName:$('fCustomer').value.trim()||'Ismeretlen ügyfél',phone:$('fPhone').value.trim(),car:$('fCar').value.trim()||'Ismeretlen autó',plate:$('fPlate').value.trim().toUpperCase(),year:Number($('fYear').value)||null,km:Number($('fKm').value)||0,startAt:start.toISOString(),endAt:end.toISOString(),serviceId:state.selectedService.id,serviceName:state.selectedService.name,servicePrice:state.selectedService.price,extras:state.selectedExtras.map(x=>({id:x.id,name:x.name,price:x.price})),discount:Number($('fDiscount').value)||0,cost:Number($('fCost').value)||0,total:calcJobTotal(),status:state.editingJobId?(state.jobs.find(x=>x.id===state.editingJobId)?.status||'open'):'open',paymentMethod:state.editingJobId?(state.jobs.find(x=>x.id===state.editingJobId)?.paymentMethod||''):'',note:$('fNote').value.trim(),checklist:{before:$('cBefore').checked,damage:$('cDamage').checked,after:$('cAfter').checked},createdAt:state.editingJobId?(state.jobs.find(x=>x.id===state.editingJobId)?.createdAt||new Date().toISOString()):new Date().toISOString(),updatedAt:new Date().toISOString(),closedAt:state.editingJobId?(state.jobs.find(x=>x.id===state.editingJobId)?.closedAt||null):null,timerSeconds:state.editingJobId?(state.jobs.find(x=>x.id===state.editingJobId)?.timerSeconds||0):0,timerStartedAt:state.editingJobId?(state.jobs.find(x=>x.id===state.editingJobId)?.timerStartedAt||null):null};
  try{
    let saved=payload; linkCustomerAndCar(saved); if(state.cloud){ let c=getCustomerForJob(saved); if(c){ const savedC=await saveCustomerCloud(c); const ci=state.customers.findIndex(x=>x.id===c.id); if(ci>=0)state.customers[ci]=savedC; saved.customerId=savedC.id; } const car=getCarForJob(saved); if(car){ const savedCar=await saveCarCloud(car); const vi=state.cars.findIndex(x=>x.id===car.id); if(vi>=0)state.cars[vi]=savedCar; saved.carId=savedCar.id; } saved=await saveJobCloud(saved); } const idx=state.jobs.findIndex(x=>x.id===payload.id); if(idx>=0)state.jobs[idx]={...state.jobs[idx],...saved};else state.jobs.unshift(saved); saveLocal(); closeModal('jobModal'); toast(state.cloud?'Munkalap mentve · CLOUD SYNC':'Munkalap mentve · LOCAL');renderAll();openDetail(saved.id);
  }catch(e){console.error(e);setSync('error','SYNC HIBA');toast('Mentés hiba: '+(e.message||'ismeretlen'));}
}
function linkCustomerAndCar(j){
  let c=state.customers.find(x=>x.id===j.customerId) || state.customers.find(x=>x.name.toLowerCase()===j.customerName.toLowerCase());
  if(!c){c={id:uid('CU'),name:j.customerName,phone:j.phone||'',email:'',note:'',createdAt:new Date().toISOString()};state.customers.push(c);}else{c.phone=j.phone||c.phone;}
  j.customerId=c.id;
  let car=state.cars.find(x=>x.id===j.carId) || state.cars.find(x=>x.customerId===c.id&&x.makeModel===j.car&&x.plate===j.plate);
  if(!car){car={id:uid('CAR'),customerId:c.id,makeModel:j.car,plate:j.plate,year:j.year,color:'',km:j.km||0,createdAt:new Date().toISOString()};state.cars.push(car);} else {car.year=j.year||car.year;car.km=j.km||car.km;}
  j.carId=car.id;
}

function openDetail(id){const j=state.jobs.find(x=>x.id===id);if(!j)return;const photos=localPhotoData(id);const customer=getCustomerForJob(j);const car=getCarForJob(j);$('detailTitle').textContent=`${j.id} · ${j.customerName}`;$('detailBody').innerHTML=`
  <div class="grid two"><div>
    <div class="insight"><b>${esc(j.customerName)}</b><p>${esc(j.phone||'Nincs telefon')}</p></div>
    <div class="insight"><b>${esc(j.car)}</b><p>${esc(j.plate||'Nincs rendszám')} · ${j.year?esc(j.year):'Évjárat —'} · ${j.km?Number(j.km).toLocaleString('hu-HU')+' km':'Km —'}</p></div>
    <div class="insight"><b>${esc(j.serviceName)}</b><p>${(j.extras||[]).map(x=>esc(x.name)).join(' · ')||'Nincs extra'}</p></div>
    <div class="insight"><b>Időpont</b><p>${fmtDate(j.startAt)} · ${fmtTime(j.startAt)}–${fmtTime(j.endAt)}</p></div>
    <div class="insight"><b>Megjegyzés</b><p>${esc(j.note||'Nincs megjegyzés')}</p></div>
  </div><div>
    <div class="insight"><b>${money(j.total)}</b><p>${j.paymentMethod?esc(j.paymentMethod):'Fizetés még nincs rögzítve'} · ${isClosed(j)?'LEZÁRVA':'NYITOTT'}</p></div>
    <div class="insight"><b>Folyamat</b><p>${j.checklist?.before?'✓':''} BEFORE · ${j.checklist?.damage?'✓':''} SÉRÜLÉS · ${j.checklist?.after?'✓':''} AFTER</p></div>
    <div class="grid" style="gap:8px"><button class="secondary" data-detail-edit="${id}">✎ Szerkesztés</button><button class="secondary" data-detail-payment="${id}">💳 Fizetés</button><button class="secondary" data-detail-timer="${id}">⏱ Munkaidő</button><button class="secondary" data-detail-close="${id}">${isClosed(j)?'↩ Újranyitás':'✓ Munkalap lezárása'}</button><button class="secondary" data-detail-print="${id}">▣ Dizájnos PDF / munkalap</button></div>
  </div></div>
  <div class="section-kicker" style="font-size:9px;color:var(--dim);letter-spacing:.14em;font-weight:800;margin-top:17px">FOTÓDOKUMENTÁCIÓ</div>
  <div class="grid two" style="margin-top:10px"><div class="info-box">Telefonról is tölthetsz képet közvetlenül a munkalaphoz. Cloud módban a képek minden eszközről elérhetők.</div><div><select id="photoLabel" class="select"><option>BEFORE</option><option>PROCESS</option><option>AFTER</option><option>Sérülés</option></select></div></div>
  <input type="file" id="photoInput" accept="image/*" capture="environment" multiple class="input" style="margin-top:10px">
  <div class="photo-grid" style="margin-top:10px">${photos.length?photos.map(p=>`<div class="photo"><img src="${p.url || p.data || ''}" alt=""><small>${esc(p.label||'Fotó')}</small></div>`).join(''):'<div class="empty">Még nincs fotó ehhez a munkalaphoz.</div>'}</div>
  <div class="subtle" style="margin-top:12px">Ügyfél: ${customer?'kapcsolva':'—'} · Autó: ${car?'kapcsolva':'—'}</div>`;$('detailModal').classList.add('show');$('detailBody').querySelector('[data-detail-edit]')?.addEventListener('click',()=>{closeModal('detailModal');openEditJob(id);});$('detailBody').querySelector('[data-detail-payment]')?.addEventListener('click',()=>setPayment(id));$('detailBody').querySelector('[data-detail-timer]')?.addEventListener('click',()=>toggleTimer(id));$('detailBody').querySelector('[data-detail-close]')?.addEventListener('click',()=>closeJob(id));$('detailBody').querySelector('[data-detail-print]')?.addEventListener('click',()=>printJob(id));$('photoInput').addEventListener('change',e=>handlePhotos(id,e.target.files)); }
function getCustomerForJob(j){return state.customers.find(c=>c.id===j.customerId)||state.customers.find(c=>c.name.toLowerCase()===j.customerName.toLowerCase());}
function getCarForJob(j){return state.cars.find(c=>c.id===j.carId)||state.cars.find(c=>c.customerId===j.customerId&&c.makeModel===j.car&&c.plate===j.plate);}
async function handlePhotos(jobId,files){ if(!files?.length)return; const label=$('photoLabel').value; try{if(state.cloud){for(const f of files)await uploadPhoto(jobId,f,label);}else{for(const f of files){const blob=await compressImage(f,1500,.8);const data=await blobToDataUrl(blob);state.photos[jobId]=(state.photos[jobId]||[]);state.photos[jobId].push({id:uid('PH'),label,url:data,data});}}saveLocal();openDetail(jobId);toast('Fotó(k) hozzáadva');}catch(e){console.error(e);toast('Fotó feltöltési hiba');} }
function fileToDataUrl(file){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(file);});}
function blobToDataUrl(blob){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(blob);});}
async function setPayment(id){const j=state.jobs.find(x=>x.id===id);if(!j)return;const m=prompt('Fizetési mód: Készpénz / Átutalás / Bankkártya',j.paymentMethod||'Bankkártya');if(!m)return;j.paymentMethod=m.trim();try{if(state.cloud)Object.assign(j,await saveJobCloud(j));saveLocal();toast('Fizetési mód mentve');openDetail(id);renderAll();}catch(e){toast('Mentés hiba');}}
async function closeJob(id){const j=state.jobs.find(x=>x.id===id);if(!j)return;const wasClosed=isClosed(j);if(wasClosed){j.status='open';j.closedAt=null;}else{if(!j.paymentMethod){toast('Előbb válassz fizetési módot');return;}j.status='closed';j.closedAt=new Date().toISOString();}try{if(state.cloud)Object.assign(j,await saveJobCloud(j));saveLocal();toast(wasClosed?'Munkalap újranyitva':'Munkalap lezárva');openDetail(id);renderAll();}catch(e){toast('Mentés hiba');}}
function toggleTimer(id){const j=state.jobs.find(x=>x.id===id);if(!j)return;if(j.timerStartedAt){j.timerSeconds=(j.timerSeconds||0)+Math.max(0,Math.round((Date.now()-new Date(j.timerStartedAt).getTime())/1000));j.timerStartedAt=null;toast('Munkaidő leállítva');}else{j.timerStartedAt=new Date().toISOString();toast('Munkaidő elindítva');}if(state.cloud)saveJobCloud(j).then(saved=>Object.assign(j,saved)).catch(()=>{});saveLocal();openDetail(id);}

function renderDashboard(){ const m=monthJobs();const todayClosed=currentDayJobs().filter(isClosed);const open=state.jobs.filter(j=>!isClosed(j));const today=currentDayJobs().sort((a,b)=>new Date(a.startAt)-new Date(b.startAt));$('sToday').textContent=money(todayClosed.reduce((s,j)=>s+j.total,0));$('sTodayJobs').textContent=`${todayClosed.length} lezárt munka`;$('sMonth').textContent=money(m.reduce((s,j)=>s+j.total,0));$('sMonthJobs').textContent=`${m.length} lezárt munka`;$('sOpen').textContent=open.length;$('sAvg').textContent=money(m.length?m.reduce((s,j)=>s+j.total,0)/m.length:0);$('todayText').textContent=new Intl.DateTimeFormat('hu-HU',{dateStyle:'full'}).format(new Date());$('todayJobs').innerHTML=today.length?today.map(j=>`<div class="jobrow"><div class="jobmain"><b>${fmtTime(j.startAt)}–${fmtTime(j.endAt)} · ${esc(j.customerName)}</b><p>${esc(j.car)} · ${esc(j.serviceName)}</p></div><div style="text-align:right"><span class="badge ${isClosed(j)?'ok':'warn'}">${isClosed(j)?'Lezárt':'Nyitott'}</span><div class="money" style="margin-top:5px">${money(j.total)}</div></div></div>`).join(''):'<div class="empty">Ma még nincs beírt időpont.</div>';const rev=m.reduce((s,j)=>s+j.total,0),pct=Math.min(100,state.goal?rev/state.goal*100:0);$('goalLabel').textContent=`${money(rev)} / ${money(state.goal)}`;$('goalBar').style.width=`${pct}%`;$('goalText').textContent=pct>=100?'A havi cél teljesítve.':`A havi cél ${pct.toFixed(0)}%-án állsz. ${money(state.goal-rev)} van hátra.`;$('studioMode').textContent=open.length?'MUNKÁBAN':'SZABAD';}
function stockCard(x){const s=stockState(x);return `<div class="card stock ${s}"><div class="stocktop"><b>${esc(x.name)}</b><small>${Number(x.qty)||0}${x.unit==='%'?'%':' '+esc(x.unit)}</small></div><div class="bar"><div class="fill" style="width:${stockPercent(x)}%"></div></div><div class="stocktop"><span class="badge ${s==='critical'?'danger':s==='low'?'warn':'ok'}">${stockLabel(x)}</span><small>min. ${Number(x.min)||0} ${esc(x.unit)}</small></div><div class="subtle" style="margin-top:8px">Érték: <b>${money(stockValue(x))}</b></div></div>`;}
function renderJobs(){const q=($('jobSearch')?.value||'').toLowerCase();const f=$('jobFilter')?.value||'all';const a=state.jobs.filter(j=>(f==='all'||(f==='open'&&!isClosed(j))||(f==='closed'&&isClosed(j)))&&JSON.stringify(j).toLowerCase().includes(q)).sort((x,y)=>new Date(y.startAt)-new Date(x.startAt));$('jobsTable').innerHTML=a.length?a.map(j=>`<tr><td><b>${esc(j.id)}</b><br><span style="font-size:9px;color:var(--dim)">${fmtDate(j.startAt)}</span></td><td>${esc(j.customerName)}<br><span style="color:var(--muted)">${esc(j.car)} ${j.plate?'· '+esc(j.plate):''}</span></td><td>${esc(j.serviceName)}</td><td>${fmtTime(j.startAt)}–${fmtTime(j.endAt)}</td><td>${money(j.total)}</td><td><span class="badge ${isClosed(j)?'ok':'warn'}">${isClosed(j)?'Lezárt':'Nyitott'}</span></td><td><button class="secondary" data-open-job="${j.id}">Megnyitás</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nincs találat.</td></tr>';document.querySelectorAll('[data-open-job]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.openJob)));}
function buildCustomers(){const map=new Map(state.customers.map(c=>[c.id,{...c,jobs:[],cars:[]} ]));for(const car of state.cars){const c=map.get(car.customerId);if(c)c.cars.push(car);}for(const j of state.jobs){let c=map.get(j.customerId)||[...map.values()].find(x=>x.name.toLowerCase()===j.customerName.toLowerCase());if(!c){c={id:uid('CU'),name:j.customerName,phone:j.phone||'',email:'',note:'',jobs:[],cars:[]};map.set(c.id,c);}c.jobs.push(j);}return [...map.values()];}
function customerLevel(n){return n>=20?'GOLD':n>=10?'SILVER':n>=5?'BRONZE':'NEW';}
function renderCustomers(){const q=($('customerSearch')?.value||'').toLowerCase();const a=buildCustomers().filter(c=>JSON.stringify(c).toLowerCase().includes(q));$('customerTable').innerHTML=a.length?a.map(c=>{const cj=c.jobs.filter(isClosed);const spend=cj.reduce((s,j)=>s+j.total,0);return `<tr><td><b>${esc(c.name)}</b><br><span style="color:var(--muted)">${esc(c.phone||'')}</span></td><td>${c.cars.length?c.cars.map(x=>`${esc(x.makeModel)}${x.plate?' · '+esc(x.plate):''}`).join('<br>'):'—'}</td><td>${cj.length}</td><td>${money(spend)}</td><td><span class="badge neutral">${customerLevel(cj.length)}</span></td><td><button class="secondary" data-edit-customer="${c.id}">Megnyitás</button></td></tr>`;}).join(''):'<tr><td colspan="6" class="empty">Nincs ügyfél.</td></tr>';document.querySelectorAll('[data-edit-customer]').forEach(b=>b.addEventListener('click',()=>openCustomer(b.dataset.editCustomer)));}
function openCustomer(id=null){state.editingCustomerId=id;const c=id?state.customers.find(x=>x.id===id):null;$('customerModalTitle').textContent=c?'Ügyfél szerkesztése':'Új ügyfél';$('cuName').value=c?.name||'';$('cuPhone').value=c?.phone||'';$('cuEmail').value=c?.email||'';$('cuNote').value=c?.note||'';$('customerModal').classList.add('show');}
async function saveCustomer(){const c={id:state.editingCustomerId||uid('CU'),name:$('cuName').value.trim()||'Ismeretlen',phone:$('cuPhone').value.trim(),email:$('cuEmail').value.trim(),note:$('cuNote').value.trim(),createdAt:state.editingCustomerId?(state.customers.find(x=>x.id===state.editingCustomerId)?.createdAt||new Date().toISOString()):new Date().toISOString()};try{const saved=state.cloud?await saveCustomerCloud(c):c;const idx=state.customers.findIndex(x=>x.id===c.id);if(idx>=0)state.customers[idx]={...state.customers[idx],...saved};else state.customers.push(saved);saveLocal();closeModal('customerModal');renderAll();toast('Ügyfél mentve');}catch(e){toast('Mentés hiba');}}

function renderCalendar(){const m=state.calMonth;const y=m.getFullYear(),mo=m.getMonth();$('calTitle').textContent=new Intl.DateTimeFormat('hu-HU',{month:'long',year:'numeric'}).format(m).replace(/^./,c=>c.toUpperCase());const first=new Date(y,mo,1);const start=(first.getDay()+6)%7;const days=new Date(y,mo+1,0).getDate();const prevDays=new Date(y,mo,0).getDate();const totalCells=Math.ceil((start+days)/7)*7;let html=['H','K','Sze','Cs','P','Szo','V'].map(x=>`<div class="cal-dow">${x}</div>`).join('');for(let i=0;i<totalCells;i++){const dayNum=i-start+1;let d,muted=false;if(dayNum<1){d=new Date(y,mo-1,prevDays+dayNum);muted=true;}else if(dayNum>days){d=new Date(y,mo+1,dayNum-days);muted=true;}else d=new Date(y,mo,dayNum);const ev=state.jobs.filter(j=>sameDay(j.startAt,d)).sort((a,b)=>new Date(a.startAt)-new Date(b.startAt));html+=`<div class="cal-day ${muted?'muted ':''}${sameDay(d,new Date())?'today':''}"><div class="cal-num">${d.getDate()}</div>${ev.slice(0,4).map(j=>`<button class="cal-event ${isClosed(j)?'closed':''}" data-cal-job="${j.id}">${fmtTime(j.startAt)} · ${esc(j.customerName)}</button>`).join('')}${ev.length>4?`<div class="subtle">+${ev.length-4} további</div>`:''}</div>`;}$('calendarGrid').innerHTML=html;document.querySelectorAll('[data-cal-job]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.calJob)));const today=currentDayJobs().sort((a,b)=>new Date(a.startAt)-new Date(b.startAt));$('calendarDate').textContent=new Intl.DateTimeFormat('hu-HU',{dateStyle:'full'}).format(new Date());$('calendarToday').innerHTML=today.length?`<div class="timeline">${today.map(j=>`<div class="timeline-item"><div class="timeline-time">${fmtTime(j.startAt)}</div><div class="timeline-card"><b>${esc(j.customerName)}</b><p class="subtle" style="margin:3px 0 0">${esc(j.car)} · ${esc(j.serviceName)}</p></div><span class="badge ${isClosed(j)?'ok':'warn'}">${isClosed(j)?'Lezárt':'Nyitott'}</span></div>`).join('')}</div>`:'<div class="calendar-empty">Nincs mai időpont.</div>';const next=state.jobs.filter(j=>!isClosed(j)&&new Date(j.startAt)>new Date()).sort((a,b)=>new Date(a.startAt)-new Date(b.startAt)).slice(0,8);$('upcoming').innerHTML=next.length?next.map(j=>`<div class="jobrow"><div class="jobmain"><b>${fmtDate(j.startAt)} · ${fmtTime(j.startAt)}</b><p>${esc(j.customerName)} · ${esc(j.car)}</p></div><button class="secondary" data-open-upcoming="${j.id}">Megnyitás</button></div>`).join(''):'<div class="empty">Nincs következő időpont.</div>';document.querySelectorAll('[data-open-upcoming]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.openUpcoming)));}

function renderInventory(){
  const rank={critical:0,low:1,ok:2};
  const s=[...state.stock].sort((a,b)=>(rank[stockState(a)]??9)-(rank[stockState(b)]??9));
  $('inventoryVisualMeta').textContent=`${s.length} tétel · ${s.filter(x=>stockState(x)==='critical').length} piros · ${s.filter(x=>stockState(x)==='low').length} sárga`;
  $('dashStock').innerHTML=s.length?s.map(stockCard).join(''):'<div class="empty">Nincs készlettétel.</div>';
  $('inventoryVisual').innerHTML=s.length?s.map(stockCard).join(''):'<div class="empty">Nincs készlettétel.</div>';
  $('invCount').textContent=s.length;
  $('invCritical').textContent=s.filter(x=>stockState(x)==='critical').length;
  $('invLow').textContent=s.filter(x=>stockState(x)==='low').length;
  $('invValue').textContent=money(s.reduce((sum,x)=>sum+stockValue(x),0));
  $('inventoryEditor').innerHTML=s.length?s.map(inventoryRow).join(''):'<tr><td colspan="8" class="empty">Nincs készlettétel.</td></tr>';
}
function inventoryRow(x){const s=stockState(x);return `<tr data-stock-id="${esc(x.id)}"><td><input class="stock-name" value="${esc(x.name)}"></td><td><input class="qty-input stock-qty" type="number" step="0.01" value="${Number(x.qty)||0}"></td><td><select class="stock-unit">${['db','liter','ml','kg','%'].map(u=>`<option ${x.unit===u?'selected':''}>${u}</option>`).join('')}</select></td><td><input class="stock-min" type="number" step="0.01" value="${Number(x.min)||0}"></td><td><input class="stock-price" type="number" step="1" value="${Number(x.price)||0}"></td><td class="inventory-row-value">${money(stockValue(x))}</td><td><span class="badge ${s==='critical'?'danger':s==='low'?'warn':'ok'}">${stockLabel(x)}</span></td><td><button class="danger-btn" data-delete-stock="${x.id}">Törlés</button></td></tr>`;}
async function saveInventoryInline(){const rows=[...document.querySelectorAll('#inventoryEditor tr[data-stock-id]')];try{const next=[];for(const tr of rows){const x={id:tr.dataset.stockId,name:tr.querySelector('.stock-name').value.trim()||'Új termék',qty:Number(tr.querySelector('.stock-qty').value)||0,unit:tr.querySelector('.stock-unit').value,min:Number(tr.querySelector('.stock-min').value)||0,price:Number(tr.querySelector('.stock-price').value)||0,category:'Egyéb'};let saved=state.cloud?await saveStockCloud(x):x;next.push(saved);}state.stock=next;saveLocal();renderAll();toast('Készlet mentve');}catch(e){console.error(e);setSync('error','SYNC HIBA');toast('Készlet mentési hiba');}}
function addStock(){state.editingStockId=null;$('stockModalTitle').textContent='Új készlettétel';$('stockName').value='';$('stockCategory').value='';$('stockQty').value='0';$('stockUnit').value='db';$('stockMin').value='1';$('stockPrice').value='0';$('stockModal').classList.add('show');}
async function saveStock(){const x={id:state.editingStockId||uid('ST'),name:$('stockName').value.trim()||'Új termék',qty:Number($('stockQty').value)||0,unit:$('stockUnit').value,min:Number($('stockMin').value)||0,price:Number($('stockPrice').value)||0,category:$('stockCategory').value.trim()||'Egyéb'};try{const saved=state.cloud?await saveStockCloud(x):x;const idx=state.stock.findIndex(s=>s.id===x.id);if(idx>=0)state.stock[idx]={...state.stock[idx],...saved};else state.stock.push(saved);saveLocal();closeModal('stockModal');renderAll();toast('Készlettétel mentve');}catch(e){toast('Készlet mentési hiba');}}
async function deleteStock(id){if(!confirm('Biztosan törlöd ezt a készlettételt?'))return;try{if(state.cloud)await deleteCloud('inventory',id);state.stock=state.stock.filter(x=>x.id!==id);saveLocal();renderAll();toast('Készlettétel törölve');}catch(e){toast('Törlés hiba');}}

function renderAnalytics(){const a=monthJobs(),rev=a.reduce((s,j)=>s+j.total,0),cost=a.reduce((s,j)=>s+(j.cost||0),0);$('aRevenue').textContent=money(rev);$('aCost').textContent=money(cost);$('aMargin').textContent=money(rev-cost);$('aAvg').textContent=money(a.length?rev/a.length:0);const svc={};a.forEach(j=>svc[j.serviceName]=(svc[j.serviceName]||0)+j.total);$('serviceMix').innerHTML=Object.entries(svc).sort((x,y)=>y[1]-x[1]).map(([n,v])=>`<div class="jobrow"><div class="jobmain"><b>${esc(n)}</b><p>${a.filter(j=>j.serviceName===n).length} munka</p></div><div class="money">${money(v)}</div></div>`).join('')||'<div class="empty">Nincs adat.</div>';const pay={};a.forEach(j=>pay[j.paymentMethod||'Nincs rögzítve']=(pay[j.paymentMethod||'Nincs rögzítve']||0)+j.total);$('paymentMix').innerHTML=Object.entries(pay).map(([n,v])=>`<div class="jobrow"><div class="jobmain"><b>${esc(n)}</b></div><div class="money">${money(v)}</div></div>`).join('')||'<div class="empty">Nincs adat.</div>';$('financeTable').innerHTML=a.length?a.map(j=>`<tr><td>${fmtDate(j.startAt)}</td><td>${esc(j.customerName)}</td><td>${esc(j.serviceName)}</td><td>${money(j.total)}</td><td>${money(j.cost||0)}</td><td>${money(j.total-(j.cost||0))}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">Nincs lezárt munka ebben a hónapban.</td></tr>';}
function alerts(){const a=[];const s=state.stock;s.filter(x=>stockState(x)==='critical').forEach(x=>a.push(['🔴','Készletkritikus: '+x.name,'Rendelés szükséges.']));s.filter(x=>stockState(x)==='low').forEach(x=>a.push(['🟡','Hamarosan rendelni: '+x.name,'A készlet a minimumszint közelében van.']));const open=state.jobs.filter(j=>!isClosed(j));if(open.length>=3)a.push(['🟠','Sok nyitott munkalap',`Jelenleg ${open.length} nyitott munka van.`]);const upcoming=state.jobs.filter(j=>!isClosed(j)&&new Date(j.startAt)>new Date()&&new Date(j.startAt)<new Date(Date.now()+86400000));if(upcoming.length)a.push(['🔵','24 órán belüli időpont',`${upcoming.length} közelgő munka.`]);return a;}
function renderAlerts(){const a=alerts();$('dashAlerts').innerHTML=a.length?a.map(x=>`<div class="insight"><b>${x[0]} ${esc(x[1])}</b><p>${esc(x[2])}</p></div>`).join(''):'<div class="insight"><b>✓ Minden rendben</b><p>Nincs kritikus riasztás.</p></div>';$('aiAlerts').innerHTML=$('dashAlerts').innerHTML;}
function insightHtml(){const a=alerts(),m=monthJobs(),rev=m.reduce((s,j)=>s+j.total,0),top={};m.forEach(j=>top[j.serviceName]=(top[j.serviceName]||0)+1);const t=Object.entries(top).sort((x,y)=>y[1]-x[1])[0];return a.slice(0,4).map(x=>`<div class="insight"><b>${x[0]} ${esc(x[1])}</b><p>${esc(x[2])}</p></div>`).join('')+`<div class="insight"><b>💰 ${money(rev)} havi lezárt bevétel</b><p>${m.length} lezárt munkából.</p></div>`+(t?`<div class="insight"><b>📈 ${esc(t[0])}</b><p>${t[1]} alkalom ebben a hónapban.</p></div>`:'');}
function renderAI(){const h=insightHtml();$('aiInsightsDash').innerHTML=h;$('aiInsightsFull').innerHTML=h;}
function localAnswer(q){const t=q.toLowerCase(),m=monthJobs(),rev=m.reduce((s,j)=>s+j.total,0),crit=state.stock.filter(x=>stockState(x)==='critical'),low=state.stock.filter(x=>stockState(x)==='low'),top={};m.forEach(j=>top[j.serviceName]=(top[j.serviceName]||0)+1);const topx=Object.entries(top).sort((a,b)=>b[1]-a[1])[0];if(t.includes('rendel'))return crit.length?`Rendelés szükséges: ${crit.map(x=>`${x.name} (${x.qty} ${x.unit})`).join(', ')}.`+(low.length?` Hamarosan: ${low.map(x=>x.name).join(', ')}.`:''):low.length?`Hamarosan rendelni: ${low.map(x=>`${x.name} (${x.qty} ${x.unit})`).join(', ')}.`:'Jelenleg nincs rendelési riasztás.';if(t.includes('bevét')||t.includes('kerest'))return `Az aktuális hónap lezárt bevétele ${money(rev)}, ${m.length} munkából.`;if(t.includes('szolgáltatás')||t.includes('legtöbb'))return topx?`A leggyakoribb szolgáltatás ${topx[0]} (${topx[1]} alkalom).`:'Még nincs elég adat.';if(t.includes('esedék')||t.includes('visszahív')){const cutoff=Date.now()-60*24*60*60*1000;const cs=buildCustomers().filter(c=>c.jobs.some(j=>new Date(j.startAt).getTime()<cutoff));return cs.length?`Érdemes átnézni: ${cs.map(c=>c.name).slice(0,8).join(', ')}.`:'Nincs 60 napnál régebbi kezelés alapján egyértelmű visszahívási lista.';}return'A helyi D-Tail AI a munkalapokból, bevételből, ügyfelekből és készletből tud elemezni.';}
function aiQuestion(q,target='aiFullAnswer'){const answer=$(target);answer.innerHTML=`<b>D-Tail AI · LOCAL</b><br>${esc(localAnswer(q)).replace(/\n/g,'<br>')}`;answer.classList.add('show');}

function subscribeRealtime(){
  if(!supabase || !state.session) return;
  if(state.realtime){supabase.removeChannel(state.realtime);state.realtime=null;}
  state.realtime=supabase.channel('dtail-workspace-'+state.session.user.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'jobs',filter:`user_id=eq.${state.session.user.id}`},scheduleCloudReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'customers',filter:`user_id=eq.${state.session.user.id}`},scheduleCloudReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'cars',filter:`user_id=eq.${state.session.user.id}`},scheduleCloudReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'inventory',filter:`user_id=eq.${state.session.user.id}`},scheduleCloudReload)
    .subscribe();
}
function scheduleCloudReload(){
  clearTimeout(state.realtimeReloadTimer);
  state.realtimeReloadTimer=setTimeout(async()=>{try{await loadCloud();subscribeRealtime();renderAll();}catch(e){console.error(e);}},450);
}

function renderSettings(){ $('goalInput').value=state.goal; $('cloudStateLabel').textContent=state.cloud?(state.session?'CLOUD SYNC':'CLOUD CONFIGURED'):'LOCAL MODE'; if($('cloudSettings')){ if(!state.cloud){$('cloudSettings').innerHTML='<div class="info-box" style="margin-top:12px"><b>Cloud nincs bekapcsolva.</b><br>Szerkeszd a <code>config.js</code> fájlt a Supabase URL-lel és anon/publishable kulccsal, majd töltsd fel újra a Vercel/GitHub projektre.</div>';}else{$('cloudSettings').innerHTML=`<div class="setting-row"><div><b>Bejelentkezve</b><p>${esc(state.session?.user?.email||'Nincs aktív munkamenet')}</p></div><button class="secondary" id="logoutBtn">Kijelentkezés</button></div>`;$('logoutBtn')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.reload();});}} }

function exportData(){const payload={version:3,exportedAt:new Date().toISOString(),jobs:state.jobs,customers:state.customers,cars:state.cars,stock:state.stock,goal:state.goal};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.download='dtail-studio-backup-v3.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function importJson(file){const text=await file.text();const x=JSON.parse(text);if(Array.isArray(x.jobs))state.jobs=migrateJobs(x.jobs);if(Array.isArray(x.customers))state.customers=x.customers;if(Array.isArray(x.cars))state.cars=x.cars;if(Array.isArray(x.stock))state.stock=normalizeStock(x.stock);if(typeof x.goal==='number')state.goal=x.goal;saveLocal();if(state.cloud){for(const c of state.customers)await saveCustomerCloud(c);for(const car of state.cars)await saveCarCloud(car);for(const s of state.stock)await saveStockCloud(s);for(const j of state.jobs)await saveJobCloud(j);await saveGoalCloud();await loadCloud();}renderAll();toast('Biztonsági mentés betöltve');}
async function importLegacy(){const oldJobs=readOld('dtail_jobs'),oldCustomers=readOld('dtail_customers'),oldStock=readOld('dtail_inventory_v2');if(!oldJobs.length&&!oldCustomers.length&&!oldStock.length){toast('Nem találtam régi D-Tail localStorage adatot.');return;}if(!confirm('A régi helyi adatok bekerüljenek a V3 rendszerbe?'))return;state.jobs=migrateJobs(oldJobs);state.customers=oldCustomers;state.stock=oldStock.length?normalizeStock(oldStock):legacyDefaultStock();saveLocal();if(state.cloud){for(const c of state.customers)await saveCustomerCloud(c);for(const s of state.stock)await saveStockCloud(s);for(const j of state.jobs)await saveJobCloud(j);await loadCloud();}renderAll();toast('Régi adatok importálva');}
function clearLocal(){if(!confirm('A helyi cache törlődik. Cloud módban a felhős adatokat ez NEM törli. Folytatod?'))return;localStorage.removeItem(localKey);localStorage.removeItem(goalKey);location.reload();}

function printJob(id){const j=state.jobs.find(x=>x.id===id);if(!j)return;const photos=localPhotoData(id);const subtotal=(j.servicePrice||0)+(j.extras||[]).reduce((s,x)=>s+Number(x.price||0),0);$('printSheet').innerHTML=`<div class="print-page"><div class="print-header"><div class="print-brand"><div class="print-mark">DT</div><div><div class="print-title">D-Tail Studio</div><div class="print-sub">Premium detailing · A részletek számítanak.</div></div></div><div class="print-id"><b>${esc(j.id)}</b>${fmtDate(j.startAt)}<br>${fmtTime(j.startAt)}–${fmtTime(j.endAt)}</div></div><div class="print-grid"><div class="print-card"><h4>Ügyfél</h4><p><b>${esc(j.customerName)}</b><br>${esc(j.phone||'—')}</p></div><div class="print-card"><h4>Jármű</h4><p><b>${esc(j.car)}</b><br>${esc(j.plate||'—')} · ${j.year||'—'} · ${j.km?Number(j.km).toLocaleString('hu-HU')+' km':'—'}</p></div></div><div class="print-card"><h4>Szolgáltatás és tételek</h4><table class="print-items"><thead><tr><th>Tétel</th><th style="text-align:right">Érték</th></tr></thead><tbody><tr><td>${esc(j.serviceName)}</td><td style="text-align:right">${money(j.servicePrice)}</td></tr>${(j.extras||[]).map(x=>`<tr><td>${esc(x.name)}</td><td style="text-align:right">${money(x.price)}</td></tr>`).join('')}</tbody></table><div class="print-total"><div class="print-total-row"><span>Részösszeg</span><b>${money(subtotal)}</b></div><div class="print-total-row"><span>Kedvezmény</span><b>−${money(j.discount||0)}</b></div><div class="print-total-row final"><span>Fizetendő</span><b>${money(j.total)}</b></div><div class="print-total-row"><span>Fizetési mód</span><b>${esc(j.paymentMethod||'—')}</b></div></div></div><div class="print-grid" style="margin-top:12px"><div class="print-card"><h4>Munkajegyzet</h4><p>${esc(j.note||'Nincs megjegyzés.').replace(/\n/g,'<br>')}</p></div><div class="print-card"><h4>Státusz</h4><p><b>${isClosed(j)?'LEZÁRVA':'NYITOTT'}</b><br>Anyagköltség: ${money(j.cost||0)}</p></div></div><div class="print-checklist"><div class="check-box">${j.checklist?.before?'☑':'☐'} BEFORE fotók</div><div class="check-box">${j.checklist?.damage?'☑':'☐'} Sérülés rögzítve</div><div class="check-box">${j.checklist?.after?'☑':'☐'} AFTER fotók</div></div>${photos.length?`<div class="print-photos">${photos.slice(0,6).map(p=>`<div class="print-photo"><img src="${p.url||p.data||''}"><small>${esc(p.label||'Fotó')}</small></div>`).join('')}</div>`:''}<div class="print-footer"><span>D-Tail Studio · ${esc(j.id)}</span><span>Generálva: ${new Intl.DateTimeFormat('hu-HU',{dateStyle:'medium',timeStyle:'short'}).format(new Date())}</span></div></div>`;window.print();}
function printReport(){const a=monthJobs(),rev=a.reduce((s,j)=>s+j.total,0),cost=a.reduce((s,j)=>s+j.cost,0);$('printSheet').innerHTML=`<div class="print-page"><div class="print-header"><div class="print-brand"><div class="print-mark">DT</div><div><div class="print-title">D-Tail Studio</div><div class="print-sub">Havi üzleti riport</div></div></div><div class="print-id"><b>${new Date().toLocaleDateString('hu-HU',{month:'long',year:'numeric'})}</b>Generálva: ${new Date().toLocaleDateString('hu-HU')}</div></div><div class="print-grid"><div class="print-card"><h4>Havi bevétel</h4><p style="font-size:18px"><b>${money(rev)}</b></p></div><div class="print-card"><h4>Becsült fedezet</h4><p style="font-size:18px"><b>${money(rev-cost)}</b></p></div></div><div class="print-card"><h4>Havi munkák</h4><table class="print-items"><thead><tr><th>Dátum</th><th>Ügyfél</th><th>Szolgáltatás</th><th>Bevétel</th><th>Anyag</th></tr></thead><tbody>${a.map(j=>`<tr><td>${fmtDate(j.startAt)}</td><td>${esc(j.customerName)}</td><td>${esc(j.serviceName)}</td><td>${money(j.total)}</td><td>${money(j.cost||0)}</td></tr>`).join('')}</tbody></table></div><div class="print-footer"><span>D-Tail Studio · havi riport</span><span>${a.length} lezárt munka</span></div></div>`;window.print();}

function renderGreeting(){
  const el=$('greeting');
  if(!el)return;
  const h=new Date().getHours();
  let text;
  if(h>=5 && h<11) text='Jó reggelt, Dominik! ☀️';
  else if(h>=11 && h<18) text='Szia Dominik! 👋';
  else if(h>=18 && h<23) text='Szép estét, Dominik! 🌙';
  else text='Jó éjszakát, Dominik! 🌙';
  el.textContent=text;
}

function renderAll(){renderDashboard();renderJobs();renderCustomers();renderCalendar();renderInventory();renderAnalytics();renderAlerts();renderAI();renderSettings();updateResponsiveNav();}
function updateResponsiveNav(){document.querySelectorAll('#mobileNav [data-view]').forEach(b=>b.classList.toggle('active',document.querySelector('.view.active')?.id===`view-${b.dataset.view}`));}

async function boot(){
  loadLocal();
  renderGreeting();
  renderAll();
  setTimeout(()=>$('splash')?.classList.add('hide'),650);setTimeout(()=>$('splash')?.remove(),1300);
  if(!HAS_CLOUD){setSync('local','LOCAL');return;}
  try{const {data:{session}}=await supabase.auth.getSession();state.session=session;if(!session){$('authOverlay').classList.add('show');setSync('local','LOGIN REQUIRED');return;}await loadCloud();subscribeRealtime();renderAll();}
  catch(e){console.error(e);setSync('error','CLOUD ERROR');toast('Cloud betöltési hiba. Helyi cache maradt aktív.');}
}

function wire(){
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.nav)));
  document.querySelectorAll('[data-action="new-job"]').forEach(b=>b.addEventListener('click',()=>openNewJob()));
  document.querySelectorAll('[data-action="new-customer"]').forEach(b=>b.addEventListener('click',()=>openCustomer()));
  document.querySelectorAll('[data-action="add-stock"]').forEach(b=>b.addEventListener('click',()=>addStock()));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
  $('quickNew').addEventListener('click',()=>openNewJob());$('globalSearch').addEventListener('click',()=>{showView('jobs');setTimeout(()=>$('jobSearch').focus(),50);});
  $('menuToggle')?.addEventListener('click',()=>{$('sidebar').classList.toggle('open');$('drawerOverlay').classList.toggle('show');});$('drawerOverlay').addEventListener('click',closeDrawer);
  $('fDiscount').addEventListener('input',renderCart);$('fDate').addEventListener('input',renderConflict);$('fDuration').addEventListener('input',renderConflict);$('saveJobBtn').addEventListener('click',saveJob);
  $('jobSearch').addEventListener('input',renderJobs);$('jobFilter').addEventListener('change',renderJobs);$('customerSearch').addEventListener('input',renderCustomers);
  $('calPrev').addEventListener('click',()=>{state.calMonth=new Date(state.calMonth.getFullYear(),state.calMonth.getMonth()-1,1);renderCalendar();});$('calNext').addEventListener('click',()=>{state.calMonth=new Date(state.calMonth.getFullYear(),state.calMonth.getMonth()+1,1);renderCalendar();});
  $('saveInventory').addEventListener('click',saveInventoryInline);$('inventoryEditor').addEventListener('click',e=>{const b=e.target.closest('[data-delete-stock]');if(b)deleteStock(b.dataset.deleteStock);});
  $('saveCustomerBtn').addEventListener('click',saveCustomer);$('saveStockBtn').addEventListener('click',saveStock);
  $('saveGoal').addEventListener('click',async()=>{state.goal=Number($('goalInput').value)||0;saveLocal();try{if(state.cloud)await saveGoalCloud();toast('Havi cél mentve');renderAll();}catch(e){toast('Cél mentési hiba');}});
  $('exportData').addEventListener('click',exportData);$('importFile').addEventListener('change',e=>e.target.files[0]&&importJson(e.target.files[0]).catch(()=>toast('Hibás vagy nem támogatott JSON')));$('importLegacy').addEventListener('click',()=>importLegacy());$('clearLocal').addEventListener('click',clearLocal);
  $('aiDashSend').addEventListener('click',()=>aiQuestion($('aiDashInput').value||'Milyen fontos dolgokra figyeljek ma?','aiDashAnswer'));$('aiDashInput').addEventListener('keydown',e=>e.key==='Enter'&&aiQuestion(e.target.value,'aiDashAnswer'));$('aiFullSend').addEventListener('click',()=>aiQuestion($('aiFullInput').value||'Elemezd a hónapomat.','aiFullAnswer'));$('aiFullInput').addEventListener('keydown',e=>e.key==='Enter'&&aiQuestion(e.target.value,'aiFullAnswer'));document.querySelectorAll('[data-q]').forEach(b=>b.addEventListener('click',()=>aiQuestion(b.dataset.q)));
  $('authLoginTab').addEventListener('click',()=>authTab(false));$('authSignupTab').addEventListener('click',()=>authTab(true));$('authSubmit').addEventListener('click',submitAuth);$('continueLocal').addEventListener('click',()=>{$('authOverlay').classList.remove('show');state.cloud=false;setSync('local','LOCAL');renderAll();});
  if(HAS_CLOUD) supabase.auth.onAuthStateChange(async(_event,session)=>{state.session=session;if(session){$('authOverlay').classList.remove('show');try{await loadCloud();subscribeRealtime();renderAll();}catch(e){console.error(e);}}else{$('authOverlay').classList.add('show');setSync('local','LOGIN REQUIRED');}});
}
let authSignUp=false;function authTab(signup){authSignUp=signup;$('authLoginTab').classList.toggle('active',!signup);$('authSignupTab').classList.toggle('active',signup);$('authSubmit').textContent=signup?'Regisztráció':'Belépés';$('authNote').textContent=signup?'Regisztrálj egy saját D-Tail felhasználót. Ezután ugyanazzal az e-mail + jelszó párossal beléphetsz iPhone-ról, iPadről és PC-ről.':'A felhős munkatérbe e-mail + jelszóval lépsz be. A jelszót az app nem tárolja helyben.';}
async function submitAuth(){const email=$('authEmail').value.trim(),password=$('authPassword').value;if(!email||!password){showAuthError('Add meg az e-mail címet és a jelszót.');return;}$('authSubmit').disabled=true;try{let r;if(authSignUp)r=await supabase.auth.signUp({email,password});else r=await supabase.auth.signInWithPassword({email,password});if(r.error)throw r.error;if(authSignUp&&!r.data.session)toast('Regisztráció elküldve. Ha e-mail megerősítés aktív, nézd meg a leveleidet.');}catch(e){showAuthError(e.message||'Bejelentkezési hiba.');}finally{$('authSubmit').disabled=false;}}
function showAuthError(t){$('authError').style.display='block';$('authError').textContent=t;}

window.openNewJob=openNewJob;window.openDetail=openDetail;window.openCustomer=openCustomer;window.addStock=addStock;
if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
wire();boot();
