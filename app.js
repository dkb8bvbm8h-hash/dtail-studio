(() => {
'use strict';

const CONFIG = window.DTAIL_CONFIG || {};
let HAS_CLOUD = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase);
let supabase = HAS_CLOUD ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {auth:{persistSession:true,autoRefreshToken:true}}) : null;
let authListenerAttached = false;

function attachAuthListener(){
  if(!HAS_CLOUD || !supabase || authListenerAttached)return;
  authListenerAttached=true;
  supabase.auth.onAuthStateChange(async(_e,s)=>{
    state.session=s;
    if(s){
      try{await cloudLoad({initial:true});renderSettings();}
      catch(e){console.error(e);setSync('error','CLOUD ERROR');renderSettings();}
    }else{setSync('local','LOCAL');renderSettings();}
  });
}

function loadSupabaseLibrary(timeoutMs=4500){
  return new Promise((resolve,reject)=>{
    if(window.supabase){resolve(window.supabase);return;}
    const sources=[
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
      'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js'
    ];
    let done=false,idx=0,timer=null;
    const finish=(ok,err)=>{
      if(done)return;done=true;if(timer)clearTimeout(timer);ok?resolve(window.supabase):reject(err||new Error('Supabase könyvtár nem tölthető be.'));
    };
    const next=()=>{
      if(done)return;
      if(idx>=sources.length){finish(false,new Error('Supabase CDN nem érhető el.'));return;}
      const src=sources[idx++],script=document.createElement('script');
      script.src=src;script.async=true;script.crossOrigin='anonymous';
      script.onload=()=>window.supabase?finish(true):next();
      script.onerror=()=>next();
      timer=setTimeout(()=>{try{script.remove();}catch{};next();},timeoutMs);
      document.head.appendChild(script);
    };
    next();
  });
}

async function initCloud(){
  if(!(CONFIG.supabaseUrl&&CONFIG.supabaseAnonKey)){HAS_CLOUD=false;state.cloud=false;setSync('local','LOCAL');return;}
  try{
    await loadSupabaseLibrary();
    supabase=window.supabase.createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
    HAS_CLOUD=true;state.cloud=true;
    attachAuthListener();
    const {data:{session}}=await supabase.auth.getSession();
    state.session=session||null;
    if(session){await cloudLoad();}
    else{setSync('local','LOCAL');renderSettings();setTimeout(openAuth,650);}
  }catch(e){
    console.error(e);HAS_CLOUD=false;state.cloud=false;setSync('error','LOCAL · CLOUD NINCS');renderSettings();
  }
}

const SERVICES = [
  {id:'fresh',name:'Fresh Interior',price:19990,desc:'Rendszeres prémium belső tisztítás'},
  {id:'deep',name:'Deep Interior',price:39990,desc:'Mélytisztítás, extrakció és foltkezelés'}
];
const EXTRAS = [
  {id:'extract',name:'Extra kárpittisztítás / extrakció',price:5000},
  {id:'pet',name:'Állatszőr eltávolítás',price:9990},
  {id:'ozone',name:'Ózonos szagtalanítás',price:2000},
  {id:'trunk',name:'Csomagtér mélytisztítás',price:4990},
  {id:'spot',name:'Erős / speciális foltkezelés',price:4990}
];

const MATERIAL_RECIPES = {
  fresh:[
    {stockId:'ST-APC',stockName:'ADBL APC',qty:80,unit:'ml'},
    {stockId:'ST-INT',stockName:'ADBL Interior Cleaner',qty:100,unit:'ml'},
    {stockId:'ST-TOWEL',stockName:'Mikroszálas kendő',qty:0.2,unit:'db'}
  ],
  deep:[
    {stockId:'ST-APC',stockName:'ADBL APC',qty:150,unit:'ml'},
    {stockId:'ST-INT',stockName:'ADBL Interior Cleaner',qty:200,unit:'ml'},
    {stockId:'ST-TOWEL',stockName:'Mikroszálas kendő',qty:0.3,unit:'db'}
  ]
};
const EXTRA_MATERIAL_RECIPES = {};

const KEY = 'dtail_studio_4_local';
const OLD_KEYS = ['dtail_studio_v3_local','dtail_jobs','dtail_customers','dtail_inventory_v2'];
const state = {
  jobs:[],customers:[],cars:[],stock:[],photos:{},stockMovements:[],goal:1000000,costManual:false,
  selectedService:SERVICES[0],selectedExtras:[],editingJobId:null,editingCustomerId:null,editingStockId:null,
  calMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1),
  session:null,cloud:HAS_CLOUD,sync:'local'
};

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('hu-HU').format(Math.round(Number(n)||0))+' Ft';
const uid = p => `${p}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const fmtDate = d => new Intl.DateTimeFormat('hu-HU',{dateStyle:'medium'}).format(new Date(d));
const fmtTime = d => new Intl.DateTimeFormat('hu-HU',{hour:'2-digit',minute:'2-digit'}).format(new Date(d));
const sameDay = (a,b) => new Date(a).toDateString()===new Date(b).toDateString();
const isClosed = j => j?.status==='closed' || Boolean(j?.closedAt);
const monthJobs = () => {const n=new Date();return state.jobs.filter(j=>{const d=new Date(j.startAt);return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&isClosed(j);});};
const dayJobs = () => state.jobs.filter(j=>sameDay(j.startAt,new Date())).sort((a,b)=>new Date(a.startAt)-new Date(b.startAt));
const stockState = x => {const q=Number(x.qty)||0,min=Number(x.min)||0;if(q<=0)return'critical';if(min>0&&q<=min/2)return'critical';if(min>0&&q<=min)return'low';return'ok';};
const stockLabel = x => ({critical:'RENDELÉS SZÜKSÉGES',low:'HAMAROSAN RENDELNI',ok:'RENDBEN'})[stockState(x)];
function convertQty(qty,from,to){
  const q=Number(qty)||0;if(from===to)return q;
  const map={ml:1,liter:1000,g:1,kg:1000,db:1,'%':1};
  if(map[from]==null||map[to]==null)return q;
  return q*map[from]/map[to];
}
function packageUnitCost(packPrice,packQty,packUnit,stockUnit){
  const qtyInStockUnit=convertQty(packQty,packUnit,stockUnit);
  return qtyInStockUnit>0?(Number(packPrice)||0)/qtyInStockUnit:0;
}
function unitCostFor(stock,unit){
  return (Number(stock.price)||0)*convertQty(1,unit,stock.unit);
}
function stockValue(x){return (Number(x.qty)||0)*(Number(x.price)||0);}
function stockPercent(x){const q=Number(x.qty)||0,min=Number(x.min)||0;if(x.unit==='%')return Math.max(0,Math.min(100,q));const target=Math.max(min*3,1);return Math.max(0,Math.min(100,q/target*100));}
function findMaterialStock(r){return state.stock.find(x=>x.id===r.stockId)||state.stock.find(x=>String(x.name).toLowerCase()===String(r.stockName||'').toLowerCase());}
function jobMaterialLines(j){const lines=(MATERIAL_RECIPES[j.serviceId]||[]).slice();for(const e of (j.extras||[]))lines.push(...(EXTRA_MATERIAL_RECIPES[e.id]||[]));return lines;}
function materialEstimateForJob(j){return jobMaterialLines(j).reduce((sum,r)=>{const s=findMaterialStock(r);return sum+(s?(Number(r.qty)||0)*unitCostFor(s,r.unit):0);},0);}
function materialUsageForJob(j){return jobMaterialLines(j).map(r=>{const s=findMaterialStock(r);if(!s)return null;return {stockId:s.id,name:s.name,qty:Number(r.qty)||0,unit:r.unit,cost:(Number(r.qty)||0)*unitCostFor(s,r.unit)};}).filter(Boolean);}
function materialAvailability(j){const missing=[];for(const r of jobMaterialLines(j)){const s=findMaterialStock(r);if(!s){missing.push((r.stockName||r.stockId)+' · nincs a készletben');continue;}const need=convertQty(r.qty,r.unit,s.unit);if((Number(s.qty)||0)<need)missing.push(`${s.name}: ${Number(s.qty)||0} ${s.unit} < ${need} ${s.unit}`);}return missing;}

const normalizeStock = arr => (Array.isArray(arr)?arr:[]).map(x=>({id:x.id||uid('ST'),name:x.name||'Új termék',qty:Number(x.qty)||0,unit:x.unit||'db',min:Number(x.min ?? x.min_qty)||0,price:Number(x.price ?? x.unit_price)||0,category:x.category||'Egyéb',packQty:Number(x.packQty||x.package_qty)||1,packUnit:x.packUnit||x.package_unit||x.unit||'db'}));
const migrateJobs = arr => (Array.isArray(arr)?arr:[]).map(j=>({id:j.id||uid('DT'),customerId:j.customerId||null,carId:j.carId||null,customerName:j.customerName||'Ismeretlen ügyfél',phone:j.phone||'',car:j.car||j.car_label||'Ismeretlen autó',plate:(j.plate||'').toUpperCase(),year:Number(j.year)||null,km:Number(j.km)||0,serviceId:j.serviceId||SERVICES.find(s=>s.name===j.serviceName)?.id||'fresh',serviceName:j.serviceName||'Fresh Interior',servicePrice:Number(j.servicePrice ?? j.service_price ?? 19990)||0,extras:Array.isArray(j.extras)?j.extras:[],discount:Number(j.discount)||0,cost:Number(j.cost)||0,total:Number(j.total)||0,status:j.status||'open',paymentMethod:j.paymentMethod||'',note:j.note||'',checklist:j.checklist||{before:false,damage:false,after:false},startAt:j.startAt||j.start_at||j.date||j.createdAt||new Date().toISOString(),endAt:j.endAt||j.end_at||new Date(Date.parse(j.startAt||j.date||Date.now())+180*60000).toISOString(),closedAt:j.closedAt||j.closed_at||null,createdAt:j.createdAt||j.created_at||new Date().toISOString(),updatedAt:j.updatedAt||new Date().toISOString(),timerSeconds:Number(j.timerSeconds)||0,timerStartedAt:j.timerStartedAt||null}));

function seedStock(){return [
 {id:'ST-APC',name:'ADBL APC',qty:2.5,unit:'liter',min:1,price:5200,category:'Vegyszer'},
 {id:'ST-INT',name:'ADBL Interior Cleaner',qty:1.8,unit:'liter',min:0.8,price:4500,category:'Vegyszer'},
 {id:'ST-SNOW',name:'ADBL Snow Foam',qty:1.2,unit:'liter',min:0.5,price:6900,category:'Vegyszer'},
 {id:'ST-TIRE',name:'ADBL Tire Dressing',qty:1.0,unit:'liter',min:0.4,price:5900,category:'Vegyszer'},
 {id:'ST-TOWEL',name:'Mikroszálas kendő',qty:18,unit:'db',min:8,price:1200,category:'Textil'},
 {id:'ST-TEXT',name:'Kárpittisztító vegyszer',qty:1.5,unit:'liter',min:0.6,price:7900,category:'Vegyszer'}
];}

function saveLocal(){localStorage.setItem(KEY,JSON.stringify({jobs:state.jobs,customers:state.customers,cars:state.cars,stock:state.stock,photos:state.photos,stockMovements:state.stockMovements||[],goal:state.goal,savedAt:new Date().toISOString()}));}
function readJson(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||'');return v??fallback;}catch{return fallback;}}
function loadLocal(){
  const x=readJson(KEY,null);
  if(x){state.jobs=migrateJobs(x.jobs);state.customers=Array.isArray(x.customers)?x.customers:[];state.cars=Array.isArray(x.cars)?x.cars:[];state.stock=normalizeStock(x.stock);state.photos=x.photos||{};state.stockMovements=Array.isArray(x.stockMovements)?x.stockMovements:[];state.goal=Number(x.goal)||1000000;return;}
  const old=readJson('dtail_studio_v3_local',null);
  if(old){state.jobs=migrateJobs(old.jobs);state.customers=old.customers||[];state.cars=old.cars||[];state.stock=normalizeStock(old.stock);state.photos=old.photos||{};state.stockMovements=[];state.goal=Number(old.goal)||1000000;saveLocal();return;}
  const oldJobs=readJson('dtail_jobs',[]),oldCustomers=readJson('dtail_customers',[]),oldStock=readJson('dtail_inventory_v2',[]);
  state.jobs=migrateJobs(oldJobs);state.customers=oldCustomers;state.stock=oldStock.length?normalizeStock(oldStock):seedStock();saveLocal();
}

function setSync(mode,label){
  state.sync=mode;
  $('syncDot')?.classList.toggle('local',mode==='local');
  $('syncDot')?.classList.toggle('error',mode==='error');
  $('syncLabel') && ($('syncLabel').textContent=label||mode.toUpperCase());
  $('syncHint') && ($('syncHint').textContent=mode==='cloud'?'Felhőszinkron aktív · iPhone / iPad / PC / Mac közösen látja az adatokat.':mode==='error'?'Felhőhiba · a helyi mentés továbbra is aktív.':'Helyi mód. A közös többeszközös adatokhoz Supabase kapcsolható.');
}

function hasLocalData(){
  return Boolean(state.jobs.length||state.customers.length||state.cars.length||state.stock.length||Number(state.goal)!==1000000);
}
function setAuthStatus(msg,type=''){
  const e=$('authStatus');if(!e)return;e.textContent=msg||'';e.className='auth-status'+(type?' '+type:'');
}
function openAuth(){
  if(!HAS_CLOUD)return;
  $('authModal')?.classList.add('show');
  $('authEmail')?.focus();
}
function closeAuth(){ $('authModal')?.classList.remove('show');setAuthStatus(''); }
async function signIn(){
  const email=$('authEmail')?.value.trim(),password=$('authPassword')?.value||'';
  if(!email||!password){setAuthStatus('Add meg az e-mail címedet és a jelszavadat.','error');return;}
  setAuthStatus('Belépés…');
  const {data,error}=await supabase.auth.signInWithPassword({email,password});
  if(error){setAuthStatus(error.message||'Sikertelen belépés.','error');return;}
  state.session=data.session;
  closeAuth();
  toast('Sikeres belépés');
}
async function signUp(){
  const email=$('authEmail')?.value.trim(),password=$('authPassword')?.value||'';
  if(!email||!password){setAuthStatus('Add meg az e-mail címedet és a jelszavadat.','error');return;}
  if(password.length<6){setAuthStatus('A jelszó legalább 6 karakter legyen.','error');return;}
  setAuthStatus('Fiók létrehozása…');
  const {data,error}=await supabase.auth.signUp({email,password});
  if(error){setAuthStatus(error.message||'Sikertelen regisztráció.','error');return;}
  if(data.session){
    state.session=data.session;closeAuth();toast('Fiók létrehozva · CLOUD SYNC aktív');
  }else{
    setAuthStatus('A fiók létrejött. Ellenőrizd az e-mailjeidet, majd jelentkezz be.','ok');
  }
}
async function signOut(){await supabase.auth.signOut();state.session=null;setSync('local','LOCAL');renderSettings();toast('Kijelentkeztél · helyi mód');}

async function cloudLoad(opts={}){
  if(!supabase||!state.session)return;
  setSync('cloud','SYNC…');
  const uid=state.session.user.id;
  const qs=await Promise.all([
    supabase.from('jobs').select('*').eq('user_id',uid).order('start_at',{ascending:false}),
    supabase.from('customers').select('*').eq('user_id',uid).order('name'),
    supabase.from('cars').select('*').eq('user_id',uid).order('created_at'),
    supabase.from('inventory').select('*').eq('user_id',uid).order('name'),
    supabase.from('studio_settings').select('*').eq('user_id',uid).maybeSingle(),
    supabase.from('job_photos').select('*').eq('user_id',uid).order('created_at',{ascending:true})
  ]);
  qs.forEach(r=>{if(r.error)throw r.error;});
  const cloudHasData=Boolean((qs[0].data||[]).length||(qs[1].data||[]).length||(qs[2].data||[]).length||(qs[3].data||[]).length||(qs[4].data));
  if(opts.initial && !cloudHasData && hasLocalData()) {
    for(const c of state.customers) await cloudUpsert('customers',c);
    for(const c of state.cars) await cloudUpsert('cars',c);
    for(const s of state.stock) await cloudUpsert('inventory',s);
    for(const j of state.jobs) await cloudUpsert('jobs',j);
    await saveSetting();
    return cloudLoad();
  }
  state.jobs=(qs[0].data||[]).map(j=>({...j,customerName:j.customer_name,phone:j.phone||'',car:j.car_label,plate:j.plate||'',year:j.year,km:j.km||0,serviceId:j.service_id,serviceName:j.service_name,servicePrice:Number(j.service_price||0),extras:j.extras||[],discount:Number(j.discount||0),cost:Number(j.cost||0),total:Number(j.total||0),startAt:j.start_at,endAt:j.end_at,closedAt:j.closed_at,status:j.status,timerSeconds:Number(j.timer_seconds||0),timerStartedAt:j.timer_started_at,checklist:j.checklist||{}}));
  state.customers=(qs[1].data||[]).map(c=>({...c}));
  state.cars=(qs[2].data||[]).map(c=>({...c,makeModel:c.make_model}));
  state.stock=(qs[3].data||[]).map(s=>({id:s.id,name:s.name,qty:Number(s.qty||0),unit:s.unit||'db',min:Number(s.min_qty||0),price:Number(s.unit_price||0),category:s.category||'Egyéb'}));
  state.goal=Number(qs[4].data?.monthly_goal||1000000);
  state.photos={};
  for(const p of (qs[5].data||[])){
    const signed=await supabase.storage.from('job-photos').createSignedUrl(p.storage_path,3600);
    (state.photos[p.job_id]??=[]).push({id:p.id,label:p.label||'Fotó',url:signed.data?.signedUrl||'',storagePath:p.storage_path});
  }
  saveLocal();setSync('cloud','CLOUD SYNC');renderAll();
}

async function cloudUpsert(table,obj){
  if(!supabase||!state.session)return obj;
  const uid=state.session.user.id;
  if(table==='jobs'){const p={id:obj.id,user_id:uid,customer_id:obj.customerId||null,car_id:obj.carId||null,customer_name:obj.customerName,phone:obj.phone||'',car_label:obj.car,plate:obj.plate||'',year:obj.year||null,km:obj.km||0,service_id:obj.serviceId,service_name:obj.serviceName,service_price:obj.servicePrice,extras:obj.extras||[],discount:obj.discount||0,cost:obj.cost||0,total:obj.total||0,status:obj.status,payment_method:obj.paymentMethod||'',note:obj.note||'',checklist:obj.checklist||{},start_at:obj.startAt,end_at:obj.endAt,timer_seconds:obj.timerSeconds||0,timer_started_at:obj.timerStartedAt||null,closed_at:obj.closedAt||null,updated_at:new Date().toISOString()};const {data,error}=await supabase.from('jobs').upsert(p).select().single();if(error)throw error;return {...obj,...{id:data.id,startAt:data.start_at,endAt:data.end_at,closedAt:data.closed_at}};}
  if(table==='customers'){const p={id:obj.id,user_id:uid,name:obj.name,phone:obj.phone||'',email:obj.email||'',note:obj.note||'',updated_at:new Date().toISOString()};const {data,error}=await supabase.from('customers').upsert(p).select().single();if(error)throw error;return data;}
  if(table==='cars'){const p={id:obj.id,user_id:uid,customer_id:obj.customerId,make_model:obj.makeModel,plate:obj.plate||'',year:obj.year||null,color:obj.color||'',km:obj.km||0,updated_at:new Date().toISOString()};const {data,error}=await supabase.from('cars').upsert(p).select().single();if(error)throw error;return {...obj,makeModel:data.make_model};}
  if(table==='inventory'){const p={id:obj.id,user_id:uid,name:obj.name,category:obj.category||'Egyéb',qty:obj.qty,unit:obj.unit,min_qty:obj.min,unit_price:obj.price,updated_at:new Date().toISOString()};const {data,error}=await supabase.from('inventory').upsert(p).select().single();if(error)throw error;return {...obj,qty:Number(data.qty),min:Number(data.min_qty),price:Number(data.unit_price)};}
  return obj;
}

async function saveSetting(){if(!supabase||!state.session)return;const {error}=await supabase.from('studio_settings').upsert({user_id:state.session.user.id,monthly_goal:state.goal,updated_at:new Date().toISOString()});if(error)throw error;}

function getCustomerForJob(j){return state.customers.find(c=>c.id===j.customerId)||state.customers.find(c=>String(c.name).toLowerCase()===String(j.customerName).toLowerCase());}
function getCarForJob(j){return state.cars.find(c=>c.id===j.carId)||state.cars.find(c=>c.customerId===j.customerId&&c.makeModel===j.car&&c.plate===j.plate);}
function ensureRelations(j){
  let c=getCustomerForJob(j);
  if(!c){c={id:uid('CU'),name:j.customerName,phone:j.phone||'',email:'',note:'',createdAt:new Date().toISOString()};state.customers.push(c);} else c.phone=j.phone||c.phone;
  j.customerId=c.id;
  let car=getCarForJob(j);
  if(!car){car={id:uid('CAR'),customerId:c.id,makeModel:j.car,plate:j.plate||'',year:j.year||null,color:'',km:j.km||0,createdAt:new Date().toISOString()};state.cars.push(car);} else {car.year=j.year||car.year;car.km=j.km||car.km;}
  j.carId=car.id;
}

function showView(v){
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  $('view-'+v)?.classList.add('active');
  document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  document.querySelectorAll('#mobileNav [data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  const n={dashboard:['Dashboard','D-Tail Studio · detailing workspace'],jobs:['Munkák','Időpont, munkalap, státusz'],customers:['Ügyfelek & autók','Ügyfélprofilok és előzmények'],calendar:['Naptár','Időpontok és műhelyterv'],inventory:['Készlet','Készletérték és riasztások'],analytics:['Pénzügy','Bevétel és fedezet'],settings:['Beállítások','Adatok és rendszer']};
  if(n[v]){$('pageTitle').textContent=n[v][0];$('pageSub').textContent=n[v][1];}
  document.body.classList.remove('drawer-open');
  renderAll();
}

function toast(t){const e=$('toast');e.textContent=t;e.style.display='block';clearTimeout(window.__toast);window.__toast=setTimeout(()=>e.style.display='none',2200);}
function closeModal(id){$(id)?.classList.remove('show');}

function calcTotal(){return Math.max(0,(state.selectedService?.price||0)+state.selectedExtras.reduce((s,x)=>s+x.price,0)-(Number($('fDiscount')?.value)||0));}
function renderServiceChoices(){
  $('serviceGrid').innerHTML=SERVICES.map(s=>`<div class="service ${state.selectedService.id===s.id?'selected':''}" data-service="${s.id}"><b>${esc(s.name)}</b><strong>${money(s.price)}</strong><p>${esc(s.desc)}</p></div>`).join('');
  $('extraGrid').innerHTML=EXTRAS.map(x=>`<div class="service ${state.selectedExtras.some(e=>e.id===x.id)?'selected':''}" data-extra="${x.id}"><b>${esc(x.name)}</b><strong>+${money(x.price)}</strong></div>`).join('');
  document.querySelectorAll('[data-service]').forEach(e=>e.onclick=()=>{state.selectedService=SERVICES.find(x=>x.id===e.dataset.service)||SERVICES[0];renderServiceChoices();renderCart();});
  document.querySelectorAll('[data-extra]').forEach(e=>e.onclick=()=>{const x=EXTRAS.find(y=>y.id===e.dataset.extra);state.selectedExtras=state.selectedExtras.some(y=>y.id===x.id)?state.selectedExtras.filter(y=>y.id!==x.id):[...state.selectedExtras,x];renderServiceChoices();renderCart();});
}
function findConflicts(start,end,exclude=null){const s=new Date(start),e=new Date(end);return state.jobs.filter(j=>j.id!==exclude&&!isClosed(j)).filter(j=>s<new Date(j.endAt)&&e>new Date(j.startAt));}
function renderCart(){const dis=Number($('fDiscount').value)||0;let html=`<div class="cart-line"><span>${esc(state.selectedService.name)}</span><b>${money(state.selectedService.price)}</b></div>`+state.selectedExtras.map(x=>`<div class="cart-line"><span>${esc(x.name)}</span><b>+${money(x.price)}</b></div>`).join('');if(dis)html+=`<div class="cart-line"><span>Kedvezmény</span><b>−${money(dis)}</b></div>`;$('cartLines').innerHTML=html+`<div class="cart-line"><span>≈ Becsült anyagköltség</span><b>${money(materialEstimateForJob({serviceId:state.selectedService?.id,extras:state.selectedExtras}))}</b></div>`;$('cartTotal').textContent=money(calcTotal());if(!state.editingJobId||!state.costManual)$('fCost').value=Math.round(materialEstimateForJob({serviceId:state.selectedService?.id,extras:state.selectedExtras}));renderConflict();}
function renderConflict(){const box=$('conflictNotice');if(!$('fDate')?.value){box.style.display='none';return;}const st=new Date($('fDate').value),end=new Date(st.getTime()+Math.max(15,Number($('fDuration').value)||180)*60000),c=findConflicts(st,end,state.editingJobId);box.style.display=c.length?'block':'none';box.innerHTML=c.length?`<b>Időpontütközés</b><br>${c.map(j=>`${fmtTime(j.startAt)}–${fmtTime(j.endAt)} · ${esc(j.customerName)} · ${esc(j.car)}`).join('<br>')}`:'';}

async function openNewJob(){
  state.editingJobId=null;state.selectedService=SERVICES[0];state.selectedExtras=[];state.costManual=false;
  ['fCustomer','fPhone','fCar','fPlate','fYear','fKm','fNote'].forEach(id=>$(id).value='');
  $('fCost').value=Math.round(materialEstimateForJob({serviceId:'fresh',extras:[]}));$('fDiscount').value=0;$('fDuration').value=180;$('fDate').value=localInput(new Date());
  renderServiceChoices();renderCart();$('jobModal').classList.add('show');
}
function localInput(date){const d=new Date(date.getTime()-date.getTimezoneOffset()*60000);return d.toISOString().slice(0,16);}
function openEditJob(id){const j=state.jobs.find(x=>x.id===id);if(!j)return;state.editingJobId=id;state.selectedService=SERVICES.find(x=>x.id===j.serviceId)||SERVICES[0];state.selectedExtras=(j.extras||[]).map(x=>({...x}));$('jobModalTitle').textContent=`Szerkesztés · ${j.id}`;$('fCustomer').value=j.customerName||'';$('fPhone').value=j.phone||'';$('fCar').value=j.car||'';$('fPlate').value=j.plate||'';$('fYear').value=j.year||'';$('fKm').value=j.km||'';$('fDate').value=localInput(new Date(j.startAt));$('fDuration').value=Math.max(15,Math.round((new Date(j.endAt)-new Date(j.startAt))/60000)||180);$('fCost').value=Math.round(j.cost||materialEstimateForJob(j));state.costManual=j.checklist?.costMode==='manual';$('fDiscount').value=j.discount||0;$('fNote').value=j.note||'';renderServiceChoices();renderCart();$('jobModal').classList.add('show');}

async function saveJob(){
  const start=new Date($('fDate').value),duration=Math.max(15,Number($('fDuration').value)||180),end=new Date(start.getTime()+duration*60000);
  const conflict=findConflicts(start,end,state.editingJobId);if(conflict.length&&!confirm('Az időpont ütközik. Mentsem így is?'))return;
  const existing=state.jobs.find(j=>j.id===state.editingJobId);
  const j={id:state.editingJobId||uid('DT'),customerName:$('fCustomer').value.trim()||'Ismeretlen ügyfél',phone:$('fPhone').value.trim(),car:$('fCar').value.trim()||'Ismeretlen autó',plate:$('fPlate').value.trim().toUpperCase(),year:Number($('fYear').value)||null,km:Number($('fKm').value)||0,startAt:start.toISOString(),endAt:end.toISOString(),serviceId:state.selectedService.id,serviceName:state.selectedService.name,servicePrice:state.selectedService.price,extras:state.selectedExtras.map(x=>({id:x.id,name:x.name,price:x.price})),discount:Number($('fDiscount').value)||0,cost:Number($('fCost').value)||0,total:calcTotal(),status:existing?.status||'open',paymentMethod:existing?.paymentMethod||'',note:$('fNote').value.trim(),checklist:{...(existing?.checklist||{before:false,damage:false,after:false}),costMode:state.costManual?'manual':'auto'},closedAt:existing?.closedAt||null,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),timerSeconds:existing?.timerSeconds||0,timerStartedAt:existing?.timerStartedAt||null};
  ensureRelations(j);
  try{
    if(state.cloud){const c=getCustomerForJob(j);if(c)await cloudUpsert('customers',c);const car=getCarForJob(j);if(car)await cloudUpsert('cars',car);const saved=await cloudUpsert('jobs',j);Object.assign(j,saved);}
    const idx=state.jobs.findIndex(x=>x.id===j.id);if(idx>=0)state.jobs[idx]=j;else state.jobs.unshift(j);saveLocal();closeModal('jobModal');toast(state.cloud?'Munkalap mentve · CLOUD':'Munkalap mentve');renderAll();openDetail(j.id);
  }catch(e){console.error(e);setSync('error','SYNC HIBA');toast('Mentés hiba: '+(e.message||'ismeretlen'));}
}

function openDetail(id){
  const j=state.jobs.find(x=>x.id===id);if(!j)return;
  const photos=state.photos[id]||[];
  $('detailTitle').textContent=`${j.id} · ${j.customerName}`;
  $('detailBody').innerHTML=`<div class="grid two">
  <div>
    <div class="insight"><b>${esc(j.customerName)}</b><p>${esc(j.phone||'Nincs telefon')}</p></div>
    <div class="insight"><b>${esc(j.car)}</b><p>${esc(j.plate||'Nincs rendszám')} · ${j.year||'Évjárat —'} · ${j.km?Number(j.km).toLocaleString('hu-HU')+' km':'Km —'}</p></div>
    <div class="insight"><b>${esc(j.serviceName)}</b><p>${(j.extras||[]).map(x=>esc(x.name)).join(' · ')||'Nincs extra'}</p></div>
    <div class="insight"><b>Időpont</b><p>${fmtDate(j.startAt)} · ${fmtTime(j.startAt)}–${fmtTime(j.endAt)}</p></div>
    <div class="insight"><b>Megjegyzés</b><p>${esc(j.note||'Nincs megjegyzés')}</p></div>
  </div>
  <div>
    <div class="insight"><b>${money(j.total)}</b><p>${j.paymentMethod?esc(j.paymentMethod):'Fizetés még nincs rögzítve'} · ${isClosed(j)?'LEZÁRVA':'NYITOTT'}</p></div>
    <div class="insight"><b>Folyamat</b><p>BEFORE ${j.checklist?.before?'✓':'○'} · SÉRÜLÉS ${j.checklist?.damage?'✓':'○'} · AFTER ${j.checklist?.after?'✓':'○'}</p></div>
    <div class="grid" style="gap:8px">
      <button class="secondary" id="detailEdit">✎ Szerkesztés</button>
      <button class="secondary" id="detailPay">💳 Fizetés</button>
      <button class="secondary" id="detailTimer">⏱ Munkaidő</button>
      <button class="secondary" id="detailClose">${isClosed(j)?'↩ Újranyitás':'✓ Munkalap lezárása'}</button>
      <button class="secondary" id="detailPrint">▣ Dizájnos PDF / munkalap</button><button class="secondary danger-btn" id="detailDelete">Munkalap törlése</button>
    </div>
  </div></div>
  <div class="kicker" style="margin-top:18px">Fotódokumentáció</div>
  <div class="grid two" style="margin-top:9px"><div class="info-box">Telefonról közvetlenül tölthetsz fel BEFORE / PROCESS / AFTER képeket.</div><select id="photoLabel" class="select"><option>BEFORE</option><option>PROCESS</option><option>AFTER</option><option>Sérülés</option></select></div>
  <input id="photoInput" class="input" type="file" accept="image/*" capture="environment" multiple style="margin-top:8px">
  <div class="photo-grid" style="margin-top:8px">${photos.length?photos.map(p=>`<div class="photo"><img src="${p.url||p.data||''}" alt=""><small>${esc(p.label)}</small></div>`).join(''):'<div class="info-box">Még nincs fotó.</div>'}</div>`;
  $('detailModal').classList.add('show');
  $('detailEdit').onclick=()=>{closeModal('detailModal');openEditJob(id);};
  $('detailPay').onclick=()=>setPayment(id);
  $('detailTimer').onclick=()=>toggleTimer(id);
  $('detailClose').onclick=()=>closeJob(id);
  $('detailPrint').onclick=()=>printJob(id);$('detailDelete').onclick=()=>deleteJob(id);
  $('photoInput').onchange=e=>handlePhotos(id,e.target.files);
}

async function setPayment(id){const j=state.jobs.find(x=>x.id===id);const m=prompt('Fizetési mód: Készpénz / Átutalás / Bankkártya',j.paymentMethod||'Bankkártya');if(!m)return;j.paymentMethod=m.trim();try{if(state.cloud)Object.assign(j,await cloudUpsert('jobs',j));saveLocal();renderAll();openDetail(id);toast('Fizetési mód mentve');}catch(e){setSync('error','SYNC HIBA');toast('Mentés hiba');}}
async function closeJob(id){
  const j=state.jobs.find(x=>x.id===id);if(!j)return;
  const reopening=isClosed(j);
  try{
    if(reopening){
      const usage=j.checklist?.materialUsage||[];
      for(const u of usage){
        const s=state.stock.find(x=>x.id===u.stockId);if(!s)continue;
        const add=convertQty(Number(u.qty)||0,u.unit,s.unit);s.qty=(Number(s.qty)||0)+add;
        state.stockMovements.unshift({type:'in',product:s.name,qty:add,unit:s.unit,reason:'Munkalap újranyitása',jobId:j.id,at:new Date().toISOString()});
        if(state.cloud)await cloudUpsert('inventory',s);
      }
      j.checklist={...(j.checklist||{}),materialsApplied:false,materialUsage:[]};
      j.status='open';j.closedAt=null;
    }else{
      if(!j.paymentMethod){toast('Előbb válassz fizetési módot');return;}
      const missing=materialAvailability(j);
      if(missing.length){toast('Nincs elég készlet: '+missing.join(' · '));return;}
      const usage=materialUsageForJob(j);
      for(const u of usage){
        const s=state.stock.find(x=>x.id===u.stockId);if(!s)continue;
        const need=convertQty(Number(u.qty)||0,u.unit,s.unit);s.qty=(Number(s.qty)||0)-need;
        state.stockMovements.unshift({type:'out',product:s.name,qty:need,unit:s.unit,reason:'Munkalap lezárása',jobId:j.id,at:new Date().toISOString()});
        if(state.cloud)await cloudUpsert('inventory',s);
      }
      if(j.checklist?.costMode!=='manual')j.cost=Math.round(materialEstimateForJob(j));
      j.checklist={...(j.checklist||{}),materialsApplied:usage.length>0,materialUsage:usage};
      j.status='closed';j.closedAt=new Date().toISOString();
    }
    if(state.cloud)Object.assign(j,await cloudUpsert('jobs',j));
    saveLocal();renderAll();openDetail(id);toast(reopening?'Munkalap újranyitva · készlet visszaírva':'Munkalap lezárva · készlet levonva');
  }catch(e){console.error(e);setSync('error','SYNC HIBA');toast('Mentés hiba: '+(e.message||'ismeretlen'));}
}
async function toggleTimer(id){const j=state.jobs.find(x=>x.id===id);if(!j)return;if(j.timerStartedAt){j.timerSeconds=(j.timerSeconds||0)+Math.max(0,Math.round((Date.now()-new Date(j.timerStartedAt).getTime())/1000));j.timerStartedAt=null;}else j.timerStartedAt=new Date().toISOString();if(state.cloud)cloudUpsert('jobs',j).then(x=>Object.assign(j,x)).catch(()=>{});saveLocal();openDetail(id);}

async function handlePhotos(jobId,files){
  if(!files?.length)return;const label=$('photoLabel').value;
  for(const file of Array.from(files)){try{
    const data=await compressToDataUrl(file,1400,.8);
    if(state.cloud && supabase && state.session){
      const path=`${state.session.user.id}/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const blob=dataUrlToBlob(data);const up=await supabase.storage.from('job-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(up.error)throw up.error;
      const row=await supabase.from('job_photos').insert({user_id:state.session.user.id,job_id:jobId,label,storage_path:path}).select().single();if(row.error)throw row.error;
      const signed=await supabase.storage.from('job-photos').createSignedUrl(path,3600);const item={id:row.data.id,label,url:signed.data?.signedUrl||'',storagePath:path};(state.photos[jobId]??=[]).push(item);
    }else{(state.photos[jobId]??=[]).push({id:uid('PH'),label,data,url:data});}
  }catch(e){console.error(e);toast('Fotófeltöltési hiba');}}
  saveLocal();openDetail(jobId);toast('Fotó(k) hozzáadva');
}
function compressToDataUrl(file,maxSide,quality){return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onerror=reject;fr.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const s=Math.min(1,maxSide/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);c.toBlob(b=>{if(!b)return reject(new Error('Kép')) ;const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(b);},'image/jpeg',quality);};img.src=fr.result;};fr.readAsDataURL(file);});}
function dataUrlToBlob(url){const [meta,b64]=url.split(',');const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:/data:([^;]+)/.exec(meta)?.[1]||'image/jpeg'});}

function renderDashboard(){
  const month=monthJobs(),today=dayJobs(),todayClosed=today.filter(isClosed),open=state.jobs.filter(j=>!isClosed(j)),rev=month.reduce((s,j)=>s+j.total,0);
  $('sToday').textContent=money(todayClosed.reduce((s,j)=>s+j.total,0));$('sTodayJobs').textContent=`${todayClosed.length} lezárt munka`;
  $('sMonth').textContent=money(rev);$('sMonthJobs').textContent=`${month.length} lezárt munka`;$('sOpen').textContent=open.length;$('sAvg').textContent=money(month.length?rev/month.length:0);
  $('todayText').textContent=new Intl.DateTimeFormat('hu-HU',{dateStyle:'full'}).format(new Date());$('todayPlanLabel').textContent=today.length?`${today.length} időpont`:'Nincs időpont';
  $('todayJobs').innerHTML=today.length?today.map(j=>`<div class="job-row"><div class="job-main"><b>${fmtTime(j.startAt)}–${fmtTime(j.endAt)} · ${esc(j.customerName)}</b><p>${esc(j.car)} · ${esc(j.serviceName)}</p></div><div style="text-align:right"><span class="badge ${isClosed(j)?'ok':'warn'}">${isClosed(j)?'Lezárt':'Nyitott'}</span><div class="money" style="margin-top:5px">${money(j.total)}</div></div></div>`).join(''):'<div class="muted" style="font-size:9px">Ma nincs beírt időpont.</div>';
  $('goalLabel').textContent=`${money(rev)} / ${money(state.goal)}`;const pct=Math.min(100,state.goal?rev/state.goal*100:0);$('goalBar').style.width=pct+'%';$('goalText').textContent=pct>=100?'A havi cél teljesítve.':`${pct.toFixed(0)}% · ${money(state.goal-rev)} van hátra.`;
  const low=state.stock.filter(x=>stockState(x)!=='ok');$('dashAlerts').innerHTML=low.length?low.map(x=>`<div class="alert"><b>${stockState(x)==='critical'?'🔴':'🟡'} ${esc(x.name)}</b><p>${stockLabel(x)} · ${Number(x.qty)||0} ${esc(x.unit)}</p></div>`).join(''):'<div class="alert"><b>✓ Minden rendben</b><p>Nincs kritikus készletriasztás.</p></div>';
}
function stockCard(x){const s=stockState(x);return `<div class="card stock-card ${s}"><div class="stock-top"><b>${esc(x.name)}</b><span>${Number(x.qty)||0} ${esc(x.unit)}</span></div><div class="bar"><i style="width:${stockPercent(x)}%"></i></div><div class="stock-top"><span class="badge ${s==='critical'?'danger':s==='low'?'warn':'ok'}">${stockLabel(x)}</span><span>${money(stockValue(x))}</span></div></div>`;}
function renderInventory(){
  const rank={critical:0,low:1,ok:2};
  const s=[...state.stock].sort((a,b)=>rank[stockState(a)]-rank[stockState(b)]||a.name.localeCompare(b.name,'hu'));
  const c=s.filter(x=>stockState(x)==='critical').length,l=s.filter(x=>stockState(x)==='low').length;
  $('inventoryVisualMeta').textContent=s.length+' tétel · '+c+' piros · '+l+' sárga';
  $('invCount').textContent=s.length;$('invCritical').textContent=c;$('invLow').textContent=l;$('invValue').textContent=money(s.reduce((t,x)=>t+stockValue(x),0));
  $('inventoryVisual').innerHTML=s.length?s.map(stockCard).join(''):'<div class="muted" style="font-size:9px">Nincs készlettétel.</div>';
  $('dashStock').innerHTML=s.slice(0,6).map(stockCard).join('')||'<div class="muted" style="font-size:9px">Nincs készlettétel.</div>';
  $('inventoryProductList').innerHTML=s.length?s.map(x=>{
    const st=stockState(x);
    return '<div class="inventory-product '+st+'" data-stock-card="'+esc(x.id)+'">'+
      '<div class="ip-head"><div><b>'+esc(x.name)+'</b><div class="ip-meta">'+esc(x.category||'Egyéb')+'</div></div><span class="badge '+(st==='critical'?'danger':st==='low'?'warn':'ok')+'">'+stockLabel(x)+'</span></div>'+
      '<div class="bar" style="margin-top:11px"><div class="fill" style="width:'+stockPercent(x)+'%"></div></div>'+
      '<div class="ip-grid"><div class="ip-stat"><span>Készlet</span><b>'+(Number(x.qty)||0)+' '+esc(x.unit)+'</b></div><div class="ip-stat"><span>Egységköltség</span><b>'+money(x.price)+' / '+esc(x.unit)+'</b></div><div class="ip-stat"><span>Készletérték</span><b>'+money(stockValue(x))+'</b></div></div>'+
      '<div class="ip-edit"><label>Mennyiség<input class="input ip-qty" type="number" step="0.01" value="'+(Number(x.qty)||0)+'"></label><label>Minimum<input class="input ip-min" type="number" step="0.01" value="'+(Number(x.min)||0)+'"></label><label>Egységköltség<input class="input ip-price" type="number" step="0.01" value="'+(Number(x.price)||0)+'"></label></div>'+
      '<div class="ip-actions"><button class="secondary" data-restock="'+esc(x.id)+'">＋ Beszerzés</button><button class="secondary" data-save-stock="'+esc(x.id)+'">Mentés</button><button class="secondary danger-btn" data-delete-stock="'+esc(x.id)+'">Törlés</button></div>'+
    '</div>';
  }).join(''):'<div class="info-box">Nincs készlettétel.</div>';

  const groups=[{name:'Fresh Interior',id:'fresh'},{name:'Deep Interior',id:'deep'}].concat(EXTRAS.map(x=>({name:x.name,id:'extra:'+x.id})));
  $('recipeList').innerHTML=groups.map(g=>{
    const rows=g.id.indexOf('extra:')===0?(EXTRA_MATERIAL_RECIPES[g.id.slice(6)]||[]):(MATERIAL_RECIPES[g.id]||[]);
    let total=0;
    const body=rows.length?rows.map(r=>{const s=findMaterialStock(r),cost=s?(Number(r.qty)||0)*unitCostFor(s,r.unit):0;total+=cost;return '<div class="recipe-row"><span>'+esc(r.stockName||s?.name||'Hiányzó termék')+' <small>· '+r.qty+' '+r.unit+'</small></span><b>'+money(cost)+'</b></div>';}).join(''):'<div class="muted" style="font-size:9px">Nincs rögzített anyagfelhasználás.</div>';
    return '<div class="recipe-card"><h4>'+esc(g.name)+'</h4>'+body+'<div class="recipe-total"><span>Becsült anyagköltség</span><b>'+money(total)+'</b></div></div>';
  }).join('');

  const moves=(state.stockMovements||[]).slice(0,18);
  $('stockMovements').innerHTML=moves.length?moves.map(m=>'<div class="movement-item"><div><b>'+(m.type==='in'?'＋ Beérkezés':'− Felhasználás')+' · '+esc(m.product)+'</b><p>'+esc(m.reason||'')+' · '+fmtDate(m.at)+'</p></div><strong class="'+(m.type==='in'?'movement-in':'movement-out')+'">'+(m.type==='in'?'+':'−')+Number(m.qty).toFixed(2)+' '+esc(m.unit)+'</strong></div>').join(''):'<div class="muted" style="font-size:9px">Még nincs készletmozgás.</div>';
}
async function saveInventory(){
  try{
    const cards=[...document.querySelectorAll('#inventoryProductList [data-stock-card]')];
    for(const card of cards){
      const s=state.stock.find(x=>x.id===card.dataset.stockCard);if(!s)continue;
      s.qty=Number(card.querySelector('.ip-qty').value)||0;s.min=Number(card.querySelector('.ip-min').value)||0;s.price=Number(card.querySelector('.ip-price').value)||0;
      if(state.cloud)Object.assign(s,await cloudUpsert('inventory',s));
    }
    saveLocal();renderAll();toast('Készlet mentve');
  }catch(e){console.error(e);setSync('error','SYNC HIBA');toast('Készlet mentési hiba: '+(e.message||''));}
}
async function saveInventoryCard(card){
  const s=state.stock.find(x=>x.id===card.dataset.stockCard);if(!s)return;
  s.qty=Number(card.querySelector('.ip-qty').value)||0;s.min=Number(card.querySelector('.ip-min').value)||0;s.price=Number(card.querySelector('.ip-price').value)||0;
  try{if(state.cloud)Object.assign(s,await cloudUpsert('inventory',s));saveLocal();renderAll();toast(s.name+' · mentve');}catch(e){toast('Készlet mentési hiba');}
}
function renderNewStockCost(){
  const packQty=Number($('stockPackQty')?.value)||0,packUnit=$('stockPackUnit')?.value||'liter',packPrice=Number($('stockPackPrice')?.value)||0,stockUnit=$('stockUnit')?.value||'liter';
  const unitCost=packageUnitCost(packPrice,packQty,packUnit,stockUnit);
  $('stockPrice').value=unitCost?unitCost.toFixed(4):'';
  if($('stockCostPreview'))$('stockCostPreview').innerHTML=unitCost?('<b>'+money(packPrice)+'</b> / '+packQty+' '+esc(packUnit)+' = <b>'+unitCost.toFixed(2)+' Ft/'+esc(stockUnit)+'</b> · azaz '+(stockUnit==='liter'?(unitCost/1000).toFixed(4)+' Ft/ml':stockUnit==='ml'?unitCost.toFixed(2)+' Ft/ml':money(unitCost)+'/'+esc(stockUnit))+'.'):'Add meg a kiszerelést és a vételárat.';
}
function addStock(){
  $('stockName').value='';$('stockCategory').value='';$('stockQty').value=0;$('stockUnit').value='liter';$('stockMin').value=0;
  $('stockPackQty').value=1;$('stockPackUnit').value='liter';$('stockPackPrice').value='';$('stockPrice').value='';
  renderNewStockCost();$('stockModal').classList.add('show');
}
async function saveStock(){
  const packQty=Number($('stockPackQty').value)||0,packUnit=$('stockPackUnit').value,packPrice=Number($('stockPackPrice').value)||0,stockUnit=$('stockUnit').value;
  if(packQty<=0||packPrice<0){toast('Add meg a kiszerelést és a vételárat.');return;}
  const price=packageUnitCost(packPrice,packQty,packUnit,stockUnit);
  const x={id:uid('ST'),name:$('stockName').value.trim()||'Új termék',qty:Number($('stockQty').value)||0,unit:stockUnit,min:Number($('stockMin').value)||0,price,category:$('stockCategory').value.trim()||'Egyéb',packQty,packUnit,packPrice};
  try{
    if(state.cloud)Object.assign(x,await cloudUpsert('inventory',x));
    state.stock.push(x);saveLocal();closeModal('stockModal');renderAll();toast('Készlettétel hozzáadva · egységköltség számolva');
  }catch(e){toast('Készletmentési hiba: '+(e.message||''));}
}

function openRestock(id){
  const sel=$('restockProduct');sel.innerHTML=state.stock.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+(Number(x.qty)||0)+' '+esc(x.unit)+'</option>').join('');
  if(id)sel.value=id;$('restockQty').value='';$('restockCost').value='';$('restockNote').value='';renderRestockPreview();$('restockModal').classList.add('show');
}
function renderRestockPreview(){
  const s=state.stock.find(x=>x.id===$('restockProduct')?.value);if(!s){$('restockPreview').textContent='';return;}
  const add=Number($('restockQty').value)||0,cost=Number($('restockCost').value)||0,batchUnit=add>0?cost/add:0,newQty=(Number(s.qty)||0)+add,newPrice=newQty>0?(((Number(s.qty)||0)*(Number(s.price)||0))+(add*batchUnit))/newQty:(Number(s.price)||0);
  $('restockPreview').innerHTML='Jelenlegi: <b>'+Number(s.qty||0)+' '+esc(s.unit)+'</b> · '+money(s.price)+'/'+esc(s.unit)+'<br>Új súlyozott egységköltség: <b>'+money(newPrice)+'/'+esc(s.unit)+'</b> · új készlet: <b>'+newQty+' '+esc(s.unit)+'</b>';
}
async function saveRestock(){
  const s=state.stock.find(x=>x.id===$('restockProduct').value),add=Number($('restockQty').value)||0,cost=Number($('restockCost').value)||0;
  if(!s||add<=0||cost<0){toast('Add meg a beszerzési mennyiséget és teljes költségét.');return;}
  const oldQty=Number(s.qty)||0,oldPrice=Number(s.price)||0,batchUnit=cost/add,newQty=oldQty+add;s.price=((oldQty*oldPrice)+(add*batchUnit))/newQty;s.qty=newQty;
  state.stockMovements.unshift({type:'in',product:s.name,qty:add,unit:s.unit,reason:$('restockNote').value.trim()||'Beszerzés',at:new Date().toISOString()});
  try{if(state.cloud)Object.assign(s,await cloudUpsert('inventory',s));saveLocal();closeModal('restockModal');renderAll();toast('Beszerzés rögzítve');}catch(e){toast('Beszerzés mentési hiba: '+(e.message||''));}
}
async function deleteStock(id){if(!confirm('Biztosan törlöd ezt a készlettételt?'))return;try{if(state.cloud){const r=await supabase.from('inventory').delete().eq('id',id).eq('user_id',state.session.user.id);if(r.error)throw r.error;}state.stock=state.stock.filter(x=>x.id!==id);saveLocal();renderAll();toast('Készlettétel törölve');}catch(e){toast('Törlés hiba');}}

function renderJobs(){
  const q=($('jobSearch').value||'').toLowerCase(),f=$('jobFilter').value||'all';const a=state.jobs.filter(j=>(f==='all'||f==='open'&&!isClosed(j)||f==='closed'&&isClosed(j))&&JSON.stringify(j).toLowerCase().includes(q)).sort((x,y)=>new Date(y.startAt)-new Date(x.startAt));
  $('jobsTable').innerHTML=a.length?a.map(j=>`<tr><td><b>${esc(j.id)}</b><br><span class="muted">${fmtDate(j.startAt)}</span></td><td><b>${esc(j.customerName)}</b><br><span class="muted">${esc(j.car)} ${j.plate?'· '+esc(j.plate):''}</span></td><td>${esc(j.serviceName)}</td><td>${fmtTime(j.startAt)}–${fmtTime(j.endAt)}</td><td>${money(j.total)}</td><td><span class="badge ${isClosed(j)?'ok':'warn'}">${isClosed(j)?'Lezárt':'Nyitott'}</span></td><td><button class="secondary" data-open-job="${j.id}">Megnyitás</button><button class="secondary danger-btn" data-delete-job="${j.id}">Törlés</button></td></tr>`).join(''):'<tr><td colspan="7" class="muted">Nincs találat.</td></tr>';
  document.querySelectorAll('[data-open-job]').forEach(b=>b.onclick=()=>openDetail(b.dataset.openJob));document.querySelectorAll('[data-delete-job]').forEach(b=>b.onclick=()=>deleteJob(b.dataset.deleteJob));
}
function customerLevel(n){return n>=15?'PLATINUM':n>=10?'GOLD':n>=6?'SILVER':n>=3?'BRONZE':'NEW';}
function buildCustomers(){const map=new Map(state.customers.map(c=>[c.id,{...c,jobs:[],cars:[]}]));for(const car of state.cars){const c=map.get(car.customerId);if(c)c.cars.push(car);}for(const j of state.jobs){const c=map.get(j.customerId)||[...map.values()].find(x=>x.name.toLowerCase()===j.customerName.toLowerCase());if(c)c.jobs.push(j);}return [...map.values()];}
function renderCustomers(){const q=($('customerSearch').value||'').toLowerCase(),a=buildCustomers().filter(c=>JSON.stringify(c).toLowerCase().includes(q));$('customerTable').innerHTML=a.length?a.map(c=>{const cj=c.jobs.filter(isClosed),sp=cj.reduce((s,j)=>s+j.total,0);return `<tr><td><b>${esc(c.name)}</b><br><span class="muted">${esc(c.phone||'')}</span></td><td>${c.cars.length?c.cars.map(x=>`${esc(x.makeModel)}${x.plate?' · '+esc(x.plate):''}`).join('<br>'):'—'}</td><td>${cj.length}</td><td>${money(sp)}</td><td><span class="badge neutral">${customerLevel(cj.length)}</span></td><td><button class="secondary" data-edit-customer="${c.id}">Megnyitás</button><button class="secondary danger-btn" data-delete-customer="${c.id}">Törlés</button></td></tr>`}).join(''):'<tr><td colspan="6" class="muted">Nincs ügyfél.</td></tr>';document.querySelectorAll('[data-edit-customer]').forEach(b=>b.onclick=()=>openCustomer(b.dataset.editCustomer));document.querySelectorAll('[data-delete-customer]').forEach(b=>b.onclick=()=>deleteCustomer(b.dataset.deleteCustomer));}
function openCustomer(id=null){state.editingCustomerId=id;const c=id?state.customers.find(x=>x.id===id):null;$('customerModalTitle').textContent=c?'Ügyfél szerkesztése':'Új ügyfél';$('cuName').value=c?.name||'';$('cuPhone').value=c?.phone||'';$('cuEmail').value=c?.email||'';$('cuNote').value=c?.note||'';$('deleteCustomerBtn')&&($('deleteCustomerBtn').style.display=c?'inline-flex':'none');$('customerModal').classList.add('show');}
async function saveCustomer(){const c={id:state.editingCustomerId||uid('CU'),name:$('cuName').value.trim()||'Ismeretlen',phone:$('cuPhone').value.trim(),email:$('cuEmail').value.trim(),note:$('cuNote').value.trim(),createdAt:state.editingCustomerId?(state.customers.find(x=>x.id===state.editingCustomerId)?.createdAt||new Date().toISOString()):new Date().toISOString()};try{const saved=state.cloud?await cloudUpsert('customers',c):c;const i=state.customers.findIndex(x=>x.id===c.id);if(i>=0)state.customers[i]=saved;else state.customers.push(saved);saveLocal();closeModal('customerModal');renderAll();toast('Ügyfél mentve');}catch(e){toast('Ügyfél mentési hiba');}}

async function deleteJob(id){
  const j=state.jobs.find(x=>x.id===id);if(!j)return;
  if(!confirm('Biztosan törlöd a '+j.id+' munkalapot? Ez a művelet nem vonható vissza.'))return;
  try{
    if(isClosed(j)&&j.checklist?.materialUsage?.length){
      for(const u of j.checklist.materialUsage){
        const s=state.stock.find(x=>x.id===u.stockId);if(!s)continue;
        const add=convertQty(Number(u.qty)||0,u.unit,s.unit);s.qty=(Number(s.qty)||0)+add;
        state.stockMovements.unshift({type:'in',product:s.name,qty:add,unit:s.unit,reason:'Törölt munkalap visszaírása',jobId:j.id,at:new Date().toISOString()});
        if(state.cloud)await cloudUpsert('inventory',s);
      }
    }
    if(state.cloud&&supabase&&state.session){
      const paths=(state.photos[id]||[]).map(p=>p.storagePath).filter(Boolean);
      if(paths.length){const sr=await supabase.storage.from('job-photos').remove(paths);if(sr.error)console.warn(sr.error);}
      const dr=await supabase.from('jobs').delete().eq('id',id).eq('user_id',state.session.user.id);if(dr.error)throw dr.error;
    }
    state.jobs=state.jobs.filter(x=>x.id!==id);delete state.photos[id];saveLocal();closeModal('detailModal');renderAll();toast('Munkalap törölve');
  }catch(e){console.error(e);toast('Munkalap törlési hiba: '+(e.message||''));}
}
async function deleteCustomer(id){
  const c=state.customers.find(x=>x.id===id);if(!c)return;
  const count=state.jobs.filter(j=>j.customerId===id).length;
  if(!confirm('Biztosan törlöd az ügyfelet: '+c.name+'? Az ügyfélprofil és az autói törlődnek. A korábbi munkalapok megmaradnak előzményként.'))return;
  try{
    if(state.cloud&&supabase&&state.session){const dr=await supabase.from('customers').delete().eq('id',id).eq('user_id',state.session.user.id);if(dr.error)throw dr.error;}
    state.customers=state.customers.filter(x=>x.id!==id);state.cars=state.cars.filter(x=>x.customerId!==id);state.jobs.forEach(j=>{if(j.customerId===id)j.customerId=null;});
    saveLocal();closeModal('customerModal');renderAll();toast('Ügyfél törölve · '+count+' korábbi munkalap megmaradt');
  }catch(e){console.error(e);toast('Ügyfél törlési hiba: '+(e.message||''));}
}

function renderCalendar(){
  const m=state.calMonth,y=m.getFullYear(),mo=m.getMonth(),first=new Date(y,mo,1),start=(first.getDay()+6)%7,days=new Date(y,mo+1,0).getDate(),prev=new Date(y,mo,0).getDate(),cells=Math.ceil((start+days)/7)*7;const names=['H','K','Sze','Cs','P','Szo','V'];let h=names.map(n=>`<div class="dow">${n}</div>`).join('');
  for(let i=0;i<cells;i++){const dn=i-start+1;let d,muted=false;if(dn<1){d=new Date(y,mo-1,prev+dn);muted=true;}else if(dn>days){d=new Date(y,mo+1,dn-days);muted=true;}else d=new Date(y,mo,dn);const ev=state.jobs.filter(j=>sameDay(j.startAt,d)).sort((a,b)=>new Date(a.startAt)-new Date(b.startAt));h+=`<div class="day ${muted?'muted-day':''} ${sameDay(d,new Date())?'today':''}"><div class="day-num">${d.getDate()}</div>${ev.slice(0,4).map(j=>`<button class="day-event ${isClosed(j)?'closed':''}" data-cal="${j.id}">${fmtTime(j.startAt)} · ${esc(j.customerName)}</button>`).join('')}${ev.length>4?`<div class="muted" style="font-size:7px">+${ev.length-4} további</div>`:''}</div>`;}
  $('calendarGrid').innerHTML=h;$('calTitle').textContent=new Intl.DateTimeFormat('hu-HU',{month:'long',year:'numeric'}).format(m).replace(/^./,c=>c.toUpperCase());document.querySelectorAll('[data-cal]').forEach(b=>b.onclick=()=>openDetail(b.dataset.cal));
  const today=dayJobs();$('calendarDate').textContent=new Intl.DateTimeFormat('hu-HU',{dateStyle:'full'}).format(new Date());$('calendarToday').innerHTML=today.length?`<div class="timeline">${today.map(j=>`<div class="timeline-item"><div class="timeline-time">${fmtTime(j.startAt)}</div><div class="timeline-card"><b>${esc(j.customerName)}</b><p>${esc(j.car)} · ${esc(j.serviceName)}</p></div><span class="badge ${isClosed(j)?'ok':'warn'}">${isClosed(j)?'Lezárt':'Nyitott'}</span></div>`).join('')}</div>`:'<div class="muted" style="font-size:9px">Nincs mai időpont.</div>';
  const next=state.jobs.filter(j=>!isClosed(j)&&new Date(j.startAt)>new Date()).sort((a,b)=>new Date(a.startAt)-new Date(b.startAt)).slice(0,8);$('upcoming').innerHTML=next.length?next.map(j=>`<div class="list-row"><div class="list-main"><b>${fmtDate(j.startAt)} · ${fmtTime(j.startAt)}</b><p>${esc(j.customerName)} · ${esc(j.car)}</p></div><button class="secondary" data-upcoming="${j.id}">Megnyitás</button></div>`).join(''):'<div class="muted" style="font-size:9px">Nincs következő időpont.</div>';document.querySelectorAll('[data-upcoming]').forEach(b=>b.onclick=()=>openDetail(b.dataset.upcoming));
}

function renderAnalytics(){const a=monthJobs(),rev=a.reduce((s,j)=>s+j.total,0),cost=a.reduce((s,j)=>s+j.cost,0),svc={},pay={};a.forEach(j=>{svc[j.serviceName]=(svc[j.serviceName]||0)+j.total;pay[j.paymentMethod||'Nincs rögzítve']=(pay[j.paymentMethod||'Nincs rögzítve']||0)+j.total;});$('aRevenue').textContent=money(rev);$('aCost').textContent=money(cost);$('aMargin').textContent=money(rev-cost);$('aAvg').textContent=money(a.length?rev/a.length:0);$('serviceMix').innerHTML=Object.entries(svc).map(([n,v])=>`<div class="list-row"><div class="list-main"><b>${esc(n)}</b><p>${a.filter(j=>j.serviceName===n).length} munka</p></div><div class="money">${money(v)}</div></div>`).join('')||'<div class="muted" style="font-size:9px">Nincs adat.</div>';$('paymentMix').innerHTML=Object.entries(pay).map(([n,v])=>`<div class="list-row"><div class="list-main"><b>${esc(n)}</b></div><div class="money">${money(v)}</div></div>`).join('')||'<div class="muted" style="font-size:9px">Nincs adat.</div>';$('financeTable').innerHTML=a.length?a.map(j=>`<tr><td>${fmtDate(j.startAt)}</td><td>${esc(j.customerName)}</td><td>${esc(j.serviceName)}</td><td>${money(j.total)}</td><td>${money(j.cost||0)}</td><td>${money(j.total-(j.cost||0))}</td></tr>`).join(''):'<tr><td colspan="6" class="muted">Nincs lezárt munka ebben a hónapban.</td></tr>';}
function renderSettings(){
  $('goalInput').value=state.goal;
  $('cloudStateLabel').textContent=state.cloud?(state.session?'CLOUD SYNC':'CLOUD CONFIGURED'):'LOCAL MODE';
  $('cloudSettings').innerHTML=state.cloud?`<b>Supabase</b><br>${state.session?'Kapcsolva · minden eszköz ugyanazt az adatbázist használja.':'A kapcsolat be van állítva. Belépés után aktiválódik a közös adat.'}`:`<b>Helyi mód</b><br>A config.js-ben állítható be a Supabase URL és publishable kulcs.`;
  if($('authUserBox')) $('authUserBox').innerHTML=state.session?`<div class="auth-user"><span>Bejelentkezve: ${esc(state.session.user.email||'felhasználó')}</span><small class="auth-mini">CLOUD SYNC</small></div>`:'';
  if($('cloudLoginBtn')) $('cloudLoginBtn').style.display=state.session?'none':'inline-flex';
  if($('cloudLogoutBtn')) $('cloudLogoutBtn').style.display=state.session?'inline-flex':'none';
}
function printJob(id){
  const j=state.jobs.find(x=>x.id===id);if(!j)return;const photos=state.photos[id]||[],subtotal=(j.servicePrice||0)+(j.extras||[]).reduce((s,x)=>s+Number(x.price||0),0);
  $('printSheet').innerHTML=`<div class="print-page"><div class="print-header"><div class="print-brand"><img class="print-logo" src="./assets/dtail-logo.png" alt="D-Tail Studio"><div><div class="print-title">D-Tail Studio</div><div class="print-sub">Premium detailing · A részletek számítanak.</div></div></div><div class="print-id"><b>${esc(j.id)}</b>${fmtDate(j.startAt)}<br>${fmtTime(j.startAt)}–${fmtTime(j.endAt)}</div></div><div class="print-grid"><div class="print-card"><h4>Ügyfél</h4><p><b>${esc(j.customerName)}</b><br>${esc(j.phone||'—')}</p></div><div class="print-card"><h4>Jármű</h4><p><b>${esc(j.car)}</b><br>${esc(j.plate||'—')} · ${j.year||'—'} · ${j.km?Number(j.km).toLocaleString('hu-HU')+' km':'—'}</p></div></div><div class="print-card"><h4>Szolgáltatás és tételek</h4><table class="print-items"><thead><tr><th>Tétel</th><th>Érték</th></tr></thead><tbody><tr><td>${esc(j.serviceName)}</td><td>${money(j.servicePrice)}</td></tr>${(j.extras||[]).map(x=>`<tr><td>${esc(x.name)}</td><td>${money(x.price)}</td></tr>`).join('')}</tbody></table><div class="print-total"><div class="print-total-row"><span>Részösszeg</span><b>${money(subtotal)}</b></div><div class="print-total-row"><span>Kedvezmény</span><b>−${money(j.discount||0)}</b></div><div class="print-total-row final"><span>Fizetendő</span><b>${money(j.total)}</b></div><div class="print-total-row"><span>Fizetés</span><b>${esc(j.paymentMethod||'—')}</b></div></div></div><div class="print-grid" style="margin-top:7mm"><div class="print-card"><h4>Munkajegyzet</h4><p>${esc(j.note||'Nincs megjegyzés.').replace(/\\n/g,'<br>')}</p></div><div class="print-card"><h4>Állapot</h4><p><b>${isClosed(j)?'LEZÁRVA':'NYITOTT'}</b><br>Anyagköltség: ${money(j.cost||0)}</p></div></div><div class="print-checks"><div class="check">${j.checklist?.before?'☑':'☐'} BEFORE</div><div class="check">${j.checklist?.damage?'☑':'☐'} Sérülés</div><div class="check">${j.checklist?.after?'☑':'☐'} AFTER</div></div>${photos.length?`<div class="print-photos">${photos.slice(0,6).map(p=>`<div class="print-photo"><img src="${p.url||p.data||''}"><small>${esc(p.label||'Fotó')}</small></div>`).join('')}</div>`:''}<div class="print-footer"><span>D-Tail Studio · ${esc(j.id)}</span><span>Generálva: ${fmtDate(new Date())}</span></div></div>`;window.print();
}
function printReport(){const a=monthJobs(),rev=a.reduce((s,j)=>s+j.total,0),cost=a.reduce((s,j)=>s+j.cost,0);$('printSheet').innerHTML=`<div class="print-page"><div class="print-header"><div class="print-brand"><img class="print-logo" src="./assets/dtail-logo.png" alt="D-Tail Studio"><div><div class="print-title">D-Tail Studio</div><div class="print-sub">Havi üzleti riport</div></div></div><div class="print-id"><b>${new Intl.DateTimeFormat('hu-HU',{month:'long',year:'numeric'}).format(new Date())}</b>Generálva: ${fmtDate(new Date())}</div></div><div class="print-grid"><div class="print-card"><h4>Havi bevétel</h4><p style="font-size:18px"><b>${money(rev)}</b></p></div><div class="print-card"><h4>Becsült fedezet</h4><p style="font-size:18px"><b>${money(rev-cost)}</b></p></div></div><div class="print-card"><h4>Havi munkák</h4><table class="print-items"><thead><tr><th>Dátum</th><th>Ügyfél</th><th>Szolgáltatás</th><th>Bevétel</th><th>Anyag</th></tr></thead><tbody>${a.map(j=>`<tr><td>${fmtDate(j.startAt)}</td><td>${esc(j.customerName)}</td><td>${esc(j.serviceName)}</td><td>${money(j.total)}</td><td>${money(j.cost||0)}</td></tr>`).join('')}</tbody></table></div><div class="print-footer"><span>D-Tail Studio · havi riport</span><span>${a.length} lezárt munka</span></div></div>`;window.print();}

function exportData(){const d={version:4,exportedAt:new Date().toISOString(),jobs:state.jobs,customers:state.customers,cars:state.cars,stock:state.stock,photos:state.photos,goal:state.goal};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));a.download='dtail-studio-backup-v4.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function importJson(file){const x=JSON.parse(await file.text());if(Array.isArray(x.jobs))state.jobs=migrateJobs(x.jobs);if(Array.isArray(x.customers))state.customers=x.customers;if(Array.isArray(x.cars))state.cars=x.cars;if(Array.isArray(x.stock))state.stock=normalizeStock(x.stock);if(x.photos)state.photos=x.photos;if(typeof x.goal==='number')state.goal=x.goal;saveLocal();if(state.cloud){for(const c of state.customers)await cloudUpsert('customers',c);for(const c of state.cars)await cloudUpsert('cars',c);for(const s of state.stock)await cloudUpsert('inventory',s);for(const j of state.jobs)await cloudUpsert('jobs',j);await saveSetting();await cloudLoad();}renderAll();toast('Mentés betöltve');}
function importLegacy(){const oldJobs=readJson('dtail_jobs',[]),oldCustomers=readJson('dtail_customers',[]),oldStock=readJson('dtail_inventory_v2',[]);if(!oldJobs.length&&!oldCustomers.length&&!oldStock.length){toast('Régi helyi adatok nem találhatók');return;}if(!confirm('A régi D-Tail adatok kerüljenek át az új rendszerbe?'))return;state.jobs=migrateJobs(oldJobs);state.customers=oldCustomers;state.stock=oldStock.length?normalizeStock(oldStock):seedStock();saveLocal();toast('Régi adatok importálva');renderAll();}
function clearLocal(){if(!confirm('A helyi cache és helyi D-Tail adatok törlődnek. Folytatod?'))return;localStorage.removeItem(KEY);localStorage.removeItem('dtail_studio_v3_local');location.reload();}

function renderGreeting(){const h=new Date().getHours();$('greeting').textContent=h<11?'Jó reggelt, Dominik! ☀️':h<18?'Szia Dominik! 👋':h<23?'Szép estét, Dominik! 🌙':'Jó éjszakát, Dominik! 🌙';}
function renderAll(){renderGreeting();renderDashboard();renderJobs();renderCustomers();renderCalendar();renderInventory();renderAnalytics();renderSettings();}
async function boot(){
  try{
    loadLocal();
    renderAll();
    setSync('local','LOCAL');
    setTimeout(()=>{$('boot')?.classList.add('hide');setTimeout(()=>$('boot')?.remove(),500)},220);
  }catch(e){console.error(e);$('boot')?.classList.add('hide');}
  if(CONFIG.supabaseUrl&&CONFIG.supabaseAnonKey){initCloud();}
}
function wire(){
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
  document.querySelectorAll('[data-action="new-job"]').forEach(b=>b.addEventListener('click',openNewJob));
  document.querySelectorAll('[data-action="new-customer"]').forEach(b=>b.addEventListener('click',()=>openCustomer()));
  document.querySelectorAll('[data-action="add-stock"]').forEach(b=>b.addEventListener('click',addStock));
  $('quickNew').onclick=openNewJob;$('globalSearch').onclick=()=>{showView('jobs');setTimeout(()=>$('jobSearch').focus(),40);}
  $('menuToggle').onclick=()=>document.body.classList.toggle('drawer-open');$('drawerOverlay').onclick=()=>document.body.classList.remove('drawer-open');
  $('jobSearch').oninput=renderJobs;$('jobFilter').onchange=renderJobs;$('customerSearch').oninput=renderCustomers;
  $('fDiscount').oninput=renderCart;$('fDate').oninput=renderConflict;$('fDuration').oninput=renderConflict;$('saveJobBtn').onclick=saveJob;
  $('calPrev').onclick=()=>{state.calMonth=new Date(state.calMonth.getFullYear(),state.calMonth.getMonth()-1,1);renderCalendar();};$('calNext').onclick=()=>{state.calMonth=new Date(state.calMonth.getFullYear(),state.calMonth.getMonth()+1,1);renderCalendar();};
  $('saveInventory').onclick=saveInventory;$('inventoryEditor').onclick=e=>{const b=e.target.closest('[data-delete-stock]');if(b)deleteStock(b.dataset.deleteStock);};
  $('saveCustomerBtn').onclick=saveCustomer;$('saveStockBtn').onclick=saveStock;
  $('deleteCustomerBtn')?.addEventListener('click',()=>state.editingCustomerId&&deleteCustomer(state.editingCustomerId));  $('stockPackQty')?.addEventListener('input',renderNewStockCost);$('stockPackUnit')?.addEventListener('change',renderNewStockCost);$('stockPackPrice')?.addEventListener('input',renderNewStockCost);$('stockUnit')?.addEventListener('change',renderNewStockCost);
  $('openNewStockTop')?.addEventListener('click',addStock);$('openRestockTop')?.addEventListener('click',()=>openRestock());$('openRestock')?.addEventListener('click',()=>openRestock());
  $('restockSave')?.addEventListener('click',saveRestock);$('restockProduct')?.addEventListener('change',renderRestockPreview);$('restockQty')?.addEventListener('input',renderRestockPreview);$('restockCost')?.addEventListener('input',renderRestockPreview);
  $('inventoryProductList')?.addEventListener('click',e=>{const r=e.target.closest('[data-restock]');if(r)return openRestock(r.dataset.restock);const d=e.target.closest('[data-delete-stock]');if(d)return deleteStock(d.dataset.deleteStock);const s=e.target.closest('[data-save-stock]');if(s){const card=s.closest('[data-stock-card]');if(card)saveInventoryCard(card);}});
  $('fCost')?.addEventListener('input',()=>state.costManual=true);
  $('saveGoal').onclick=async()=>{state.goal=Number($('goalInput').value)||0;saveLocal();try{if(state.cloud)await saveSetting();toast('Havi cél mentve');renderAll();}catch(e){toast('Cél mentési hiba');}};
  $('printReport').onclick=printReport;$('exportData').onclick=exportData;$('importFile').onchange=e=>e.target.files[0]&&importJson(e.target.files[0]).catch(()=>toast('Hibás JSON'));$('importLegacy').onclick=importLegacy;$('clearLocal').onclick=clearLocal;
  $('cloudLoginBtn')?.addEventListener('click',openAuth);$('cloudLogoutBtn')?.addEventListener('click',signOut);
  $('authSubmit')?.addEventListener('click',signIn);$('authSignup')?.addEventListener('click',signUp);$('authLocal')?.addEventListener('click',closeAuth);
  $('authPassword')?.addEventListener('keydown',e=>{if(e.key==='Enter')signIn();});
  attachAuthListener();
}
window.openDetail=openDetail;window.openNewJob=openNewJob;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{wire();boot()},{once:true});else{wire();boot();}
})();