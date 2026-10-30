// Shared MapLibre WebGL2 / three.js r187 integration adapted from Mini Tokyo 3D (MIT).
// Fixed Mercator model origin; P/V split retained so lighting and picking share the map camera.
import * as THREE from 'three';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import currentInfo from './data/current-info.json';
import {mountStadium} from './stadium-landmark.js';
import {mountAirport} from './airport-landmark.js';
import sawSite from './data/saw-terminal.json';
import kizSite from './data/kizkulesi-site.json';
import fbSite from './data/saracoglu-site.json';
import {createBuildingMask} from './building-mask.js';
import {buildRouteGraph,planRoute,routeGeometry} from './route-planner.js';
import {createUndergroundLayer,pointDepths} from './underground.js';
import {readUrlState,writeUrlState} from './url-state.js';
import serviceInfo from './data/service-info.json';
import {applyStatuses,estimateMinutes,facilitiesFor} from './service-status.js';
import {createPolyline, sampleRoundTrip, normalizeNetwork, filterLines, canSimulate, summarizeSources} from './network-polyline.js';
maplibregl.setWorkerUrl(workerUrl);
const $=s=>document.querySelector(s);
const checkedLabel=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'short'}).format(new Date(currentInfo.checkedAt));
$('#checked-at').textContent=`Kontrol: ${checkedLabel}`;
$('#checked-at').title='Resmî kaynakların son kontrol zamanı; canlı durum değildir';
$('#current-disclaimer').textContent=`${currentInfo.disclaimer} Kontrol: ${checkedLabel}.`;
for(const [id,fact] of [...Object.entries(currentInfo.lines),...currentInfo.excludedProjects.map(p=>[p.id,p])]){
 const li=document.createElement('li');li.textContent=`${id}: ${fact.summary} `;
 const a=document.createElement('a');a.href=fact.source;a.textContent='Resmî kaynak ↗';a.target='_blank';a.rel='noreferrer';li.append(a);
 if(fact.sourceAccess){const small=document.createElement('small');small.textContent=` ${fact.sourceAccess}`;li.append(small);}
 $('#current-facts').append(li);
}

const ORIGIN=[28.9815,41.0205];
const TYPES={metro:'Metro',tram:'Tramvay',funicular:'Füniküler',suburban:'Banliyö',metrobus:'Metrobüs',other:'Diğer'};
// Istanbul only: the camera cannot leave the metropolitan area.
const ISTANBUL_BOUNDS=[[28.35,40.72],[29.75,41.42]];
const map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:ORIGIN,zoom:10,maxBounds:ISTANBUL_BOUNDS,minZoom:9,renderWorldCopies:false,pitch:55,bearing:-20,canvasContextAttributes:{antialias:true}});
map.addControl(new maplibregl.NavigationControl(),'top-right');
const origin=maplibregl.MercatorCoordinate.fromLngLat(ORIGIN,0),meter=origin.meterInMercatorCoordinateUnits();
const L=new THREE.Matrix4().makeTranslation(origin.x,origin.y,origin.z).scale(new THREE.Vector3(1,-1,1));
function toLocal(coordinates){const c=maplibregl.MercatorCoordinate.fromLngLat(coordinates,0);return [(c.x-origin.x)/meter,-(c.y-origin.y)/meter,0];}
const vp=new THREE.Matrix4();
function setCameraFromViewProjection(camera,m){
 const e=m.elements,row=r=>[e[r],e[4+r],e[8+r],e[12+r]];
 const r0=row(0),r1=row(1),r2=row(2),r3=row(3),dot=(u,v)=>u[0]*v[0]+u[1]*v[1]+u[2]*v[2];
 const s2=dot(r3,r3),s=Math.sqrt(s2),A=-dot(r2,r3)/s2,B=r2[3]+A*r3[3];
 const cx=-dot(r0,r3)/s2,cy=-dot(r1,r3)/s2;
 const a=Math.hypot(r0[0]+cx*r3[0],r0[1]+cx*r3[1],r0[2]+cx*r3[2])/s;
 const b=Math.hypot(r1[0]+cy*r3[0],r1[1]+cy*r3[1],r1[2]+cy*r3[2])/s;
 camera.projectionMatrix.set(a,0,cx,0,0,b,cy,0,0,0,A,B,0,0,-1,0);
 camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
 camera.matrixWorldInverse.copy(camera.projectionMatrixInverse).multiply(m);
 camera.matrixWorld.copy(camera.matrixWorldInverse).invert();
}
const camera=new THREE.PerspectiveCamera();
camera.matrixWorldAutoUpdate = false;
const scene=new THREE.Scene(),root=new THREE.Group();root.scale.setScalar(meter);scene.add(root);
const buildingMask=createBuildingMask(map);
const stadium=mountStadium(map,root,toLocal,buildingMask);
const airport=mountAirport(map,root,toLocal,buildingMask);
const saracoglu=mountStadium(map,root,toLocal,buildingMask,{site:fbSite,key:'saracoglu',button:'#fb-focus',info:'#fb-info',roof:'#fb-roof',focus:{zoom:17.3,bearing:20},
 model:{outerHalf:fbSite.halfExtents.outline,bowlInnerHalf:fbSite.halfExtents.roofOpening,height:fbSite.heightMeters,footprint:fbSite.halfExtents.outline.map(v=>Math.round(v*2)),
  seat:0xf2c318,seatAccent:0x16285c,seatPattern:true,seatText:'',roofStyle:'rams',roofCladding:'membrane',roofOpeningHalf:fbSite.halfExtents.roofOpening,bowlExponent:.5,openingExponent:.22,roofColor:0xf3f5f4,roofSteel:0xf4f4f2,solar:false,led:null,cornerScreens:false,balcony:0x16285c,cladding:0x1f2c4f,banners:[['#16285c','#f2c318','FB'],['#f2c318','#16285c','1907']],bannerText:'#16285c',sign:'ŞÜKRÜ SARAÇOĞLU',badge:['#16285c','#f2c318','FB']}});
const kiz=mountAirport(map,root,toLocal,buildingMask,{site:kizSite,key:'kiz',button:'#kiz-focus',info:'#kiz-info',focus:{offset:.0009,zoom:17.6,bearing:300},minZoom:14.5});
// Sketchfab viewer only loads when the user asks for it (heavy, third-party).
$('#kiz-detail').onclick=()=>{const box=$('#kiz-embed');if(box.firstChild){box.replaceChildren();$('#kiz-detail').textContent='Ayrıntılı modeli aç';return;}const f=document.createElement('iframe');f.title=kizSite.detailModel.title;f.src=kizSite.detailModel.embed;f.allow='autoplay; fullscreen; xr-spatial-tracking';f.setAttribute('allowfullscreen','');f.loading='lazy';box.append(f);$('#kiz-detail').textContent='Ayrıntılı modeli kapat';};
const saw=mountAirport(map,root,toLocal,buildingMask,{site:sawSite,key:'saw',button:'#saw-focus',info:'#saw-info',focus:{offset:.0035,zoom:15.9,bearing:20}});
scene.add(new THREE.HemisphereLight(0xffffff,0x66776a,1.8));
const sun=new THREE.DirectionalLight(0xffffff,1.5);sun.position.set(-.5,-1,2);scene.add(sun);
const geometry=new THREE.BoxGeometry(1,1,1).translate(0,0,.5);
// Surface-projected vehicles are intentionally illustrative, including underground routes.
const material=new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x333333,depthTest:false,depthWrite:false});
const timer=new THREE.Timer(),p=new THREE.Vector3(),scale=new THREE.Vector3(),q=new THREE.Quaternion(),matrix=new THREE.Matrix4(),z=new THREE.Vector3(0,0,1);
let lines=[],warnings=[],vehicles=[],batches=[],visibleIds=[],renderer,ready=false,selected=-1,error=null;
let routeGraph=null,routeActive=false,underground=null,undergroundOn=false,tunnelDepth=0;
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches,speed=8,threeD=true,activeLine=null;
let panelCollapsed=innerWidth<=700;
function setPanel(collapsed){panelCollapsed=collapsed;document.body.classList.toggle('panel-collapsed',collapsed);$('#panel-toggle').setAttribute('aria-expanded',String(!collapsed));$('#panel-toggle').setAttribute('aria-label',collapsed?'Hat panelini aç':'Hat panelini daralt');$('#panel-toggle').textContent=innerWidth<=700?(collapsed?'⌃':'⌄'):(collapsed?'›':'‹');}
setPanel(panelCollapsed);
$('#panel-toggle').onclick=()=>setPanel(!panelCollapsed);
$('#search').onfocus=()=>setPanel(false);
$('#retry').onclick=()=>location.reload();
document.querySelectorAll('.landmark-menu button').forEach(b=>b.addEventListener('click',()=>b.closest('details').open=false));
const initialUrlState=readUrlState(location.href);
let lastRoute=null,urlSyncReady=false;
function syncUrl(){if(!urlSyncReady)return;try{history.replaceState(null,'',writeUrlState(location.href,{line:routeActive?null:activeLine,from:routeActive?lastRoute?.from:null,to:routeActive?lastRoute?.to:null,underground:undergroundOn}));}catch{}}
function setRouteEnd(which,name){
 setMode(true);$(which==='from'?'#route-from':'#route-to').value=name;
 if($('#route-from').value&&$('#route-to').value)$('#route-form').requestSubmit();else $(which==='from'?'#route-to':'#route-from').focus();
}
function metersPerPixel(){return 40075016.686*Math.cos(ORIGIN[1]*Math.PI/180)/(512*2**(Math.round(map.getZoom()*4)/4));}
function syncUnderground(){
 const mpp=metersPerPixel();tunnelDepth=Math.max(45,26*mpp);
 if(underground){underground.rebuild(Math.max(4,2.6*mpp),tunnelDepth);underground.group.visible=undergroundOn;underground.setFocus(activeLine);}
}
function setUnderground(on){
 undergroundOn=on;document.body.classList.toggle('underground',on);
 $('#underground').setAttribute('aria-pressed',String(on));
 if(map.getLayer('underground-veil'))map.setLayoutProperty('underground-veil','visibility',on?'visible':'none');
 if(map.getLayer('building-3d'))map.setLayoutProperty('building-3d','visibility',on?'none':'visible');
 if(on&&!threeD)$('#view').click();
 if(on&&map.getPitch()<50)map.easeTo({pitch:60,duration:600});
 $('#status-box').classList.toggle('ready',!on);
 $('#status').textContent=on?'Yeraltı görünümü · OSM tünel etiketleri · derinlik temsilî ve abartılı':'Simülasyon; tünel hatları yüzeye izdüşürülür';
 syncUnderground();updateFilters();syncUrl();
}
$('#underground').onclick=()=>setUnderground(!undergroundOn);
function setMode(route){
 document.body.classList.toggle('mode-route',route);
 $('#tab-lines').setAttribute('aria-selected',String(!route));$('#tab-route').setAttribute('aria-selected',String(route));
 $('#route-panel').hidden=!route;setPanel(false);
 if(route){if(activeLine)focusLine(null,false);$('#route-from').focus();}
}
$('#tab-lines').onclick=()=>setMode(false);
$('#tab-route').onclick=()=>setMode(true);
$('#route-swap').onclick=()=>{const a=$('#route-from').value;$('#route-from').value=$('#route-to').value;$('#route-to').value=a;};
function clearRoute(){
 routeActive=false;lastRoute=null;$('#route-result').replaceChildren();$('#route-clear').hidden=true;
 map.getSource('route')?.setData({type:'FeatureCollection',features:[]});updateFilters();syncUrl();
}
$('#route-clear').onclick=clearRoute;
$('#route-form').onsubmit=e=>{
 e.preventDefault();
 const out=$('#route-result');out.replaceChildren();
 const fail=msg=>{const p=document.createElement('p');p.className='error';p.textContent=msg;out.append(p);};
 if(!routeGraph)return fail('Ağ verisi henüz hazır değil.');
 let r;
 try{r=planRoute(routeGraph,$('#route-from').value,$('#route-to').value);}catch(err){return fail(`${err.message}. Listeden bir durak seçin.`);}
 if(!r)return fail('Bu iki durak arasında raylı bağlantı bulunamadı (yürüme aktarmaları hesaplanmaz).');
 if(!r.legs.length)return fail('Başlangıç ve varış aynı aktarma noktası.');
 const lineById=Object.fromEntries(lines.map(l=>[l.id,l]));
 const summary=document.createElement('p');summary.className='summary';
 summary.textContent=`${r.from} → ${r.to} · ${r.transfers?`${r.transfers} aktarma`:'aktarmasız'} · ${r.stops} durak`;
 const ol=document.createElement('ol');
 const features=[];
 const legCoords=r.legs.map(leg=>routeGeometry(routeGraph,leg));
 const legEst=r.legs.map((leg,i)=>estimateMinutes([{line:lineById[leg.lineId],meters:pathMeters(legCoords[i])}],serviceInfo).rideMinutes);
 const est=estimateMinutes(r.legs.map((leg,i)=>({line:lineById[leg.lineId],meters:pathMeters(legCoords[i])})),serviceInfo);
 summary.textContent+=` · ~${est.minutes} dk`;
 r.legs.forEach((leg,i)=>{
  const line=lineById[leg.lineId];
  if(i>0){const prev=r.legs[i-1].to;const t=document.createElement('li');t.className='transfer';t.textContent=prev===leg.from?`↳ ${leg.from} aktarma`:`↳ ${prev} → ${leg.from} aktarma (yürüme)`;ol.append(t);}
  const li=document.createElement('li');
  const badge=document.createElement('span');badge.className='badge';badge.style.setProperty('--c',line.color);badge.textContent=leg.lineId;
  const text=document.createElement('div');text.textContent=`${leg.from} → ${leg.to}`;
  const small=document.createElement('small');small.textContent=`${leg.stops} durak · ~${Math.max(1,legEst[i])} dk · ${TYPES[line.type]}`;text.append(small);
  if(line.serviceAlert){const w=document.createElement('small');w.className='leg-alert';w.textContent=`⚠ ${line.serviceAlert.text}`;text.append(w);}
  li.append(badge,text);ol.append(li);
  const coords=legCoords[i];
  li.tabIndex=0;li.title='Bu bölüme yakınlaş';li.onclick=li.onkeydown=ev=>{if(ev.type==='keydown'&&ev.key!=='Enter')return;const b=new maplibregl.LngLatBounds();coords.forEach(c=>b.extend(c));map.fitBounds(b,{padding:innerWidth<=700?{top:150,right:40,bottom:Math.round(innerHeight*.62),left:40}:{top:100,right:90,bottom:90,left:panelCollapsed?90:360},maxZoom:15.5,duration:600});};
  features.push({type:'Feature',properties:{color:line.color},geometry:{type:'LineString',coordinates:coords}});
  features.push({type:'Feature',properties:{name:leg.from,kind:i?'transfer':'start'},geometry:{type:'Point',coordinates:coords[0]}});
  if(i===r.legs.length-1)features.push({type:'Feature',properties:{name:leg.to,kind:'end'},geometry:{type:'Point',coordinates:coords.at(-1)}});
 });
 const note=document.createElement('p');note.className='route-est';note.textContent=`Tahmini süre: ${est.rideMinutes} dk yolculuk${est.transferMinutes?` + ${est.transferMinutes} dk aktarma payı`:''}. Bekleme süresi dahil değil; hızlar İBB GTFS verisinden.`;
 out.append(summary,ol,note);$('#route-clear').hidden=false;
 routeActive=true;lastRoute={from:r.from,to:r.to};$('#route-from').value=r.from;$('#route-to').value=r.to;selected>=0&&select(-1);syncUrl();
 if(innerWidth<=700)$('#route-result').scrollIntoView({block:'nearest'});
 map.getSource('route').setData({type:'FeatureCollection',features});
 updateFilters();
 const bounds=new maplibregl.LngLatBounds();features.filter(f=>f.geometry.type==='LineString').forEach(f=>f.geometry.coordinates.forEach(c=>bounds.extend(c)));
 const mobile=innerWidth<=700;
 map.fitBounds(bounds,{padding:mobile?{top:150,right:40,bottom:Math.round(innerHeight*.62),left:40}:{top:100,right:90,bottom:90,left:panelCollapsed?90:360},maxZoom:15,duration:800});
};
const fmtDate=s=>{const d=new Date(s);return Number.isNaN(+d)?'':d.toLocaleString('tr-TR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});};
function renderAlerts(all,live){
 const box=$('#service-alerts');box.replaceChildren();
 const alerts=all.filter(l=>l.serviceAlert);
 const head=document.createElement('p');head.className='alerts-head';
 head.textContent=alerts.length?`Hizmet durumu · ${live?'canlı':'son alınan kayıt'} · Metro İstanbul`:(live?'Metro İstanbul: aktif kesinti duyurusu yok':'Hizmet durumu alınamadı');
 box.append(head);
 for(const l of alerts){
  const b=document.createElement('button');b.className=`alert ${l.serviceAlert.kind}`;b.style.setProperty('--c',l.color);
  const id=document.createElement('span');id.className='alert-id';id.textContent=l.id;
  const t=document.createElement('span');t.textContent=`${l.serviceAlert.kind==='closed'?'Hizmet dışı':'Kısmi hizmet'} · ${l.serviceAlert.text}`;b.title=l.serviceAlert.text;
  const d=document.createElement('small');d.textContent=fmtDate(l.serviceAlert.updated);t.append(d);
  b.append(id,t);b.onclick=()=>{setMode(false);focusLine(l.id);};box.append(b);
 }
 box.hidden=false;
}
const haversine=(a,b)=>{const R=6371000,r=Math.PI/180,dl=(b[1]-a[1])*r,dn=(b[0]-a[0])*r,h=Math.sin(dl/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
const pathMeters=c=>c.slice(1).reduce((s,p,i)=>s+haversine(c[i],p),0);
const loadingTimeout=setTimeout(()=>{if(!ready){$('#status').textContent='Yükleme beklenenden uzun sürüyor. Ağ bağlantısını kontrol edin.';$('#retry').hidden=false;}},18000);
function savePreferences(){if(!routeActive)syncUrl();try{localStorage.setItem('istanbul-rail-explore-v1',JSON.stringify({hidden:lines.filter(l=>!enabled.has(l.id)).map(l=>l.id),activeLine}));}catch{}}
function colorFor(line){const c=new THREE.Color(line.color);return activeLine&&activeLine!==line.id?c.multiplyScalar(.34):c;}
function focusLine(id,fly=true){
 activeLine=id;
 if(id){const line=lines.find(l=>l.id===id);if(!line)return;enabled.add(id);categories.add(line.type);syncCategories();$('#detail-title').textContent=line.name;$('#detail-meta').textContent=`${TYPES[line.type]} · ${line.segments.length} bağımsız güzergâh parçası · ${line.stations.length} kayıtlı durak. ${canSimulate(line)?'Araçlar simülasyondur.':(line.statusLabel||'Seferlere ara verildi')+' · Simüle araç gösterilmez.'}`;if(line.serviceAlert){const a=document.createElement('strong');a.className='detail-alert';a.textContent=`${line.serviceAlert.kind==='closed'?'Hizmet dışı':'Kısmi hizmet'}: ${line.serviceAlert.text} (${fmtDate(line.serviceAlert.updated)}, Metro İstanbul)`;$('#detail-meta').append(a);}
 if(line.summary)$('#detail-meta').append(document.createTextNode(` ${line.summary} Son kontrol: ${checkedLabel}.`));if(line.statusSource||line.source){const link=document.createElement('a');try{const url=new URL(line.statusSource||line.source);if(url.protocol==='https:'){link.href=url.href;link.target='_blank';link.rel='noreferrer';link.textContent=' Resmî durum kaynağı ↗';$('#detail-meta').append(link);}}catch{}}$('#stop-list').replaceChildren();
 for(const station of line.stations){const item=document.createElement('li');item.textContent=station.name;$('#stop-list').append(item);}
 if(!line.stations.length){const item=document.createElement('li');item.textContent='Bu kaynakta durak listesi yok.';$('#stop-list').append(item);}
 $('#detail-fit').onclick=()=>{fit([line]);if(innerWidth<=700)setPanel(true);};
 if(fly){fit([line]);if(innerWidth<=700)setPanel(true);}
 }
 $('#line-detail').hidden=!id;$('#line-list').hidden=!!id;$('#categories').hidden=!!id;$('#panel-title').textContent=id?`${id} · Hat ayrıntıları`:'Hatları keşfet';
 for(const batch of batches){for(const v of batch.vehicles)batch.mesh.setColorAt(v.instance,colorFor(v.line));batch.mesh.instanceColor.needsUpdate=true;}
 if(selected>=0&&vehicles[selected].line.id!==id)select(-1);
 if(selected>=0){const v=vehicles[selected];v.mesh.setColorAt(v.instance,new THREE.Color('#fff4a4'));}
 updateFilters();savePreferences();
}
$('#back-network').onclick=()=>{focusLine(null,false);setPanel(false);};
document.addEventListener('keydown',e=>{
 const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
 if(e.key==='/'&&!typing){e.preventDefault();setMode(false);setPanel(false);$('#search').focus();}
 if(!typing&&!e.metaKey&&!e.ctrlKey&&!e.altKey){if(e.key==='r'){e.preventDefault();setMode(true);}else if(e.key==='y'){setUnderground(!undergroundOn);}}
 if(e.key==='Escape'){document.querySelectorAll('.maplibregl-popup.station-popup').forEach(n=>n.remove());if(document.body.classList.contains('mode-route')&&!routeActive){setMode(false);return;}if($('#search').value){$('#search').value='';updateFilters();}else if(selected>=0)select(-1);else if(activeLine)focusLine(null,false);else setPanel(true);$('#search').blur();}
});
const enabled=new Set(),categories=new Set();
function syncPause(){$('#pause').textContent=paused?'Devam et':'Duraklat';$('#pause').setAttribute('aria-pressed',String(paused));$('#pause').setAttribute('aria-label',paused?'Simülasyonu sürdür':'Simülasyonu duraklat');}
syncPause();
$('#pause').onclick=()=>{paused=!paused;syncPause();map.triggerRepaint();};
$('#speed').oninput=e=>{speed=Number(e.target.value);$('#speed-value').textContent=`${speed}×`;};
$('#view').onclick=()=>{threeD=!threeD;$('#view').textContent=threeD?'3D':'2D';$('#view').setAttribute('aria-pressed',String(threeD));$('#view').setAttribute('aria-label',threeD?'Üç boyutlu görünüm':'İki boyutlu görünüm');map.easeTo({pitch:threeD?55:0,bearing:threeD?-20:0,duration:500});};
function fit(target){
 const points=target.flatMap(l=>l.segments.flat());if(!points.length)return;
 const bounds=new maplibregl.LngLatBounds();points.forEach(c=>bounds.extend(c));
 const mobile=innerWidth<=700;
 map.fitBounds(bounds,{padding:mobile?{top:165,right:45,bottom:230,left:35}:{top:95,right:85,bottom:85,left:panelCollapsed?90:350},maxZoom:14.5,duration:700});
}
$('#fit-all').onclick=()=>{$('#search').value='';categories.clear();lines.forEach(l=>categories.add(l.type));syncCategories();focusLine(null,false);if(innerWidth<=700)setPanel(true);fit(lines);};
function select(index){
 if(selected>=0){const v=vehicles[selected];v.mesh.setColorAt(v.instance,colorFor(v.line));v.mesh.instanceColor.needsUpdate=true;}
 selected=index;
 if(selected>=0){const v=vehicles[selected];v.mesh.setColorAt(v.instance,new THREE.Color('#fff4a4'));v.mesh.instanceColor.needsUpdate=true;$('#selection').textContent=`${v.line.id} · Araç ${v.number} · simülasyon`;document.querySelector('.selection').classList.remove('none');}
 else {$('#selection').textContent='Araç seçilmedi';document.querySelector('.selection').classList.add('none');}
 map.triggerRepaint();
}
function updateFilters(){
 const options={query:$('#search').value,categories:[...categories]};
 visibleIds=filterLines(lines,{...options,enabled:[...enabled]}).map(l=>l.id);
 for(const batch of batches)batch.mesh.visible=visibleIds.includes(batch.line.id);
 if(selected>=0&&!visibleIds.includes(vehicles[selected].line.id))select(-1);
 if(map.getLayer('network-route')){
  const filter=['in',['get','id'],['literal',visibleIds]];
  for(const id of ['network-route-halo','network-stations'])map.setFilter(id,filter);
  map.setFilter('network-route',['all',filter,['!', ['get','suspended']]]);
  map.setFilter('network-suspended',['all',filter,['get','suspended']]);
  map.setPaintProperty('network-route','line-opacity',routeActive?.16:undergroundOn?.3:activeLine?['case',['==',['get','id'],activeLine],1,.25]:.9);
  if(underground)underground.setFocus(routeActive?null:activeLine);
  map.setPaintProperty('network-route','line-width',activeLine?['interpolate',['linear'],['zoom'],9,['case',['==',['get','id'],activeLine],2.2,.8],14,['case',['==',['get','id'],activeLine],3.6,1.6]]:['interpolate',['linear'],['zoom'],9,1.2,14,2.4]);
  map.setPaintProperty('network-stations','circle-opacity',activeLine?['case',['==',['get','id'],activeLine],1,.3]:1);
 }
 renderList(filterLines(lines,options));
 const shown=vehicles.filter(v=>visibleIds.includes(v.line.id)).length;
 $('#counts').textContent=`${visibleIds.length} / ${lines.length} güzergâh · ${shown} simüle araç`;
 savePreferences();
 map.triggerRepaint();
}
function renderList(filtered){
 const container=$('#line-list');const scroll=container.scrollTop;container.replaceChildren();
 if(!filtered.length){const text=document.createElement('p');text.className='empty';text.textContent='Eşleşme yok. Aramayı temizleyin veya tür filtrelerini açın.';container.append(text);}
 for(const line of filtered){
  const row=document.createElement('div');row.className=`line-row${activeLine===line.id?' active':''}${enabled.has(line.id)?'':' hidden-line'}`;row.style.setProperty('--color',line.color);
  const focus=document.createElement('button');focus.className='line-focus';focus.setAttribute('aria-label',`${line.id} ${line.name} ayrıntıları ve haritada odakla`);focus.setAttribute('aria-pressed',String(activeLine===line.id));
  const badge=document.createElement('span');badge.className='line-id';badge.textContent=line.id;
  const name=document.createElement('span');name.className='line-name';name.textContent=line.name.replace(new RegExp(`^${line.id}:?\\s*`),'');
  const meta=document.createElement('small');meta.textContent=`${TYPES[line.type]} · ${line.status==='suspended'?(line.statusLabel||'Seferlere ara verildi'):line.serviceAlert?'⚠ Kısmi hizmet':line.id.includes('-spur')?'Ana hattın kolu':`${line.stations.length} kayıtlı durak`}`;
  focus.append(badge,name,meta);focus.onclick=()=>{if(!enabled.has(line.id))enabled.add(line.id);$('#search').value='';focusLine(line.id);};
  const toggle=document.createElement('button');toggle.className='visibility';toggle.textContent=enabled.has(line.id)?'◉':'○';toggle.setAttribute('aria-label',`${line.id} güzergâhını ${enabled.has(line.id)?'gizle':'göster'}`);toggle.setAttribute('aria-pressed',String(enabled.has(line.id)));
  toggle.onclick=()=>{if(enabled.has(line.id))enabled.delete(line.id);else enabled.add(line.id);if(activeLine===line.id&&!enabled.has(line.id))focusLine(null,false);updateFilters();};
  row.append(focus,toggle);container.append(row);
 }
 container.scrollTop=scroll;
}
function syncCategories(){for(const button of $('#categories').children)button.setAttribute('aria-pressed',String(categories.has(button.dataset.type)));}
$('#search').oninput=()=>{if(activeLine)focusLine(null,false);updateFilters();};
function updateTrains(dt){
 const mpp=40075016.686*Math.cos(ORIGIN[1]*Math.PI/180)/(512*2**map.getZoom());
 scale.set(Math.max(24,8.5*mpp),Math.max(3,3.2*mpp),Math.max(3,3*mpp));
 for(const batch of batches){
  for(const v of batch.vehicles){
   v.distance=(v.distance+dt*v.speed)%(2*v.path.length);
   const sample=sampleRoundTrip(v.path,v.distance);v.position=sample.position;v.reverse=sample.reverse;
   if(undergroundOn&&v.flags){if(v.depthKey!==tunnelDepth){v.depths=pointDepths(v.flags,tunnelDepth);v.depthKey=tunnelDepth;}const d=v.depths;v.position=[...sample.position];v.position[2]=d[sample.edge]+(d[sample.edge+1]-d[sample.edge])*sample.t;}
   p.fromArray(v.position);q.setFromAxisAngle(z,Math.atan2(sample.tangent[1],sample.tangent[0]));
   batch.mesh.setMatrixAt(v.instance,matrix.compose(p,q,scale));
  }
  batch.mesh.instanceMatrix.needsUpdate=true;batch.mesh.computeBoundingSphere();
 }
}
window.demo={map,stadium,saracoglu,airport,saw,kiz,planRoute:(a,b)=>planRoute(routeGraph,a,b),getState:()=>({routeActive,undergroundOn,tunnelDepth,ready,paused,speed,selected,activeLine,panelCollapsed,pitch:map.getPitch(),threeD,error,lineCount:lines.length,vehicleCount:vehicles.length,vehicleLines:vehicles.map(v=>v.line.id),suspendedLines:lines.filter(l=>!canSimulate(l)).map(l=>l.id),visibleLines:[...visibleIds],visibleVehicleCount:vehicles.filter(v=>visibleIds.includes(v.line.id)).length,progress:vehicles.map(v=>v.distance/v.path.length),warnings:[...warnings],draws:renderer?.info.render.calls||0}),trainScreen:index=>{
 const v=vehicles[index];if(!v||!v.mesh.visible||!ready)return null;
 const point=new THREE.Vector3(...v.position).multiplyScalar(meter);point.z+=3*meter;point.project(camera);const c=map.getCanvas();
 return {x:(point.x+1)*c.clientWidth/2,y:(1-point.y)*c.clientHeight/2,line:v.line.id,visible:point.z>=-1&&point.z<=1};
}};
map.on('error',event=>{$('#status-box').classList.remove('ready');$('#status').textContent=`Altlık uyarısı: ${event.error?.message||'Harita yüklenemedi'}`;$('#retry').hidden=false;});
async function init(){
 try{
  const dataPromise=fetch(new URL('./data/rail-network.json',import.meta.url),{signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw new Error(`Ağ verisi HTTP ${r.status}`);if(!r.headers.get('content-type')?.includes('json'))throw new Error('rail-network.json bulunamadı veya JSON değil');return r.json();});
  const loadPromise=map.isStyleLoaded()?Promise.resolve():new Promise(resolve=>map.once('style.load',resolve));
  const data=await dataPromise;
  try{const mb=await fetch(new URL('./data/metrobus.json',import.meta.url),{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});data.lines.push(...mb.lines);serviceInfo.speeds[mb.lines[0].id]=mb.speedKmh;(data.sourceNotes||(data.sourceNotes=[])).push(`Metrobüs: İBB Açık Veri, İETT güzergâh ve GTFS verisi (${mb.license}).`);}catch(e){(data.coverageWarnings||(data.coverageWarnings=[])).push('Metrobüs verisi yüklenemedi');console.warn('metrobus',e);}
  data.lines=data.lines.map(line=>({...line,...(currentInfo.lines[line.id]||{}),...(line.id==='B2'?{statusLabel:'Son duyuruya göre askıda · yeniden açılış doğrulanmadı'}:{})}));
  let statuses,statusLive=true;
  try{const r=await fetch(serviceInfo.statusEndpoint,{signal:AbortSignal.timeout(6000)});const j=await r.json();if(!j.Success)throw new Error('status');statuses=j.Data.filter(s=>s.IsActive).map(s=>({line:s.LineName,text:String(s.Description||'').trim(),updated:s.UpdateDate}));}
  catch{statuses=serviceInfo.statusSnapshot;statusLive=false;}
  data.lines=applyStatuses(data.lines,statuses,'https://www.metro.istanbul/');
  renderAlerts(data.lines,statusLive);
  const normalized=normalizeNetwork(data);lines=normalized.lines;warnings=normalized.warnings;
  for(const note of summarizeSources(normalized.sourceNotes)){const li=document.createElement('li');li.textContent=note;$('#source-notes').append(li);}
  const extra=[...(Array.isArray(data.coverageWarnings)?data.coverageWarnings:[]),...warnings];
  if(data.coverage)extra.push(typeof data.coverage==='string'?data.coverage:JSON.stringify(data.coverage));
  if(extra.length)$('#coverage').append(document.createTextNode(` ${extra.join(' · ')}`));
  for(const line of lines){
   enabled.add(line.id);categories.add(line.type);
   if(!canSimulate(line))continue;
   for(const segment of line.segments){
    const path=createPolyline(segment.map(toLocal)),count=Math.max(1,Math.min(8,Math.ceil(path.length/6000)));
    const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.renderOrder=10;root.add(mesh);
    const batch={mesh,line,vehicles:[]};batches.push(batch);
    for(let i=0;i<count;i++){
     const v={mesh,line,instance:i,number:vehicles.filter(v=>v.line.id===line.id).length+1,path,distance:2*path.length*i/count,speed:line.type==='tram'?9:line.type==='funicular'?6:line.type==='metrobus'?12:17,position:[0,0,0],flags:line.segments.length===1&&line.tunnel?.length===line.segments[0].length-1?line.tunnel:null};
     batch.vehicles.push(v);vehicles.push(v);mesh.setColorAt(i,new THREE.Color(line.color));
    }
   }
  }
  for(const type of Object.keys(TYPES).filter(t=>categories.has(t))){const button=document.createElement('button');const count=lines.filter(l=>l.type===type).length;button.textContent=`${TYPES[type]} ${count}`;button.dataset.type=type;button.setAttribute('aria-label',`${TYPES[type]}: ${count} güzergâh`);button.setAttribute('aria-pressed','true');button.onclick=()=>{if(categories.has(type))categories.delete(type);else categories.add(type);syncCategories();updateFilters();};$('#categories').append(button);}
  let restoredLine=null;try{const prefs=JSON.parse(localStorage.getItem('istanbul-rail-explore-v1')||'{}');for(const id of prefs.hidden||[])enabled.delete(id);if(lines.some(l=>l.id===prefs.activeLine)&&enabled.has(prefs.activeLine))restoredLine=prefs.activeLine;}catch{}
  routeGraph=buildRouteGraph(lines);
  for(const place of [...routeGraph.places].sort((a,b)=>a.name.localeCompare(b.name,'tr'))){const o=document.createElement('option');o.value=place.name;o.label=place.lines.join(' · ');$('#station-options').append(o);}
  underground=createUndergroundLayer(lines.filter(l=>l.segments.length===1),toLocal);root.add(underground.group);
  updateFilters();await loadPromise;
  const features=lines.flatMap(line=>line.segments.map(coordinates=>({type:'Feature',properties:{id:line.id,color:line.color,suspended:!canSimulate(line)},geometry:{type:'LineString',coordinates}})));
  map.addSource('network',{type:'geojson',data:{type:'FeatureCollection',features}});
  map.addLayer({id:'underground-veil',type:'background',layout:{visibility:'none'},paint:{'background-color':'#06120e','background-opacity':.8}});
  map.addLayer({id:'network-route-halo',type:'line',source:'network',paint:{'line-width':['interpolate',['linear'],['zoom'],9,2.5,14,4.5],'line-color':'#12251e','line-opacity':.45}});
  map.addLayer({id:'network-route',type:'line',source:'network',filter:['!',['get','suspended']],paint:{'line-width':['interpolate',['linear'],['zoom'],9,1.2,14,2.4],'line-color':['get','color'],'line-opacity':.9}});
  map.addLayer({id:'network-suspended',type:'line',source:'network',filter:['get','suspended'],paint:{'line-width':['interpolate',['linear'],['zoom'],9,1,14,2],'line-color':'#7c877a','line-opacity':.6,'line-dasharray':[2,2]}});
  map.addSource('network-stations',{type:'geojson',data:{type:'FeatureCollection',features:lines.flatMap(line=>line.stations.map(s=>({type:'Feature',properties:{id:line.id,name:s.name,color:line.color},geometry:{type:'Point',coordinates:s.coordinates}})))}});
  map.addLayer({id:'network-stations',type:'circle',source:'network-stations',minzoom:11,paint:{'circle-radius':3,'circle-color':'#f1f6ec','circle-stroke-width':1.5,'circle-stroke-color':['get','color']}});
  map.addLayer({id:'network-station-labels',type:'symbol',source:'network-stations',minzoom:13.5,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':11.5,'text-offset':[0,1.1],'text-anchor':'top','text-optional':true},paint:{'text-color':'#173126','text-halo-color':'#f4f8f1','text-halo-width':1.6}});
  map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'route-casing',type:'line',source:'route',filter:['==',['geometry-type'],'LineString'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':7,'line-opacity':.95}});
  map.addLayer({id:'route-line',type:'line',source:'route',filter:['==',['geometry-type'],'LineString'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':4}});
  map.addLayer({id:'route-stops',type:'circle',source:'route',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':['match',['get','kind'],'transfer',6,8],'circle-color':['match',['get','kind'],'end','#e5484d','start','#1a7f4b','#ffffff'],'circle-stroke-width':3,'circle-stroke-color':'#122019'}});
  map.addLayer({id:'route-labels',type:'symbol',source:'route',filter:['==',['geometry-type'],'Point'],layout:{'text-field':['get','name'],'text-font':['Noto Sans Bold'],'text-size':13,'text-offset':[0,1.4],'text-anchor':'top','text-allow-overlap':true},paint:{'text-color':'#102019','text-halo-color':'#ffffff','text-halo-width':2}});
  map.addLayer({id:'network-trains',type:'custom',renderingMode:'3d',onAdd(m,gl){renderer=new THREE.WebGLRenderer({canvas:m.getCanvas(),context:gl});renderer.autoClear=false;timer.connect(document);},render(gl,args){
   timer.update();if(undergroundOn)syncUnderground();updateTrains(paused?0:Math.min(timer.getDelta(),.1)*speed);stadium.update();saracoglu.update();airport.update();saw.update();kiz.update();
   setCameraFromViewProjection(camera,vp.fromArray(args.defaultProjectionData.mainMatrix).multiply(L));
   renderer.resetState();renderer.render(scene,camera);renderer.resetState();ready=true;
   if(!paused)map.triggerRepaint();
  },onRemove(){underground?.dispose();stadium.dispose();saracoglu.dispose();airport.dispose();saw.dispose();kiz.dispose();buildingMask.restore();timer.dispose();geometry.dispose();material.dispose();batches.forEach(b=>b.mesh.dispose());renderer.dispose();ready=false;}});
  const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2();
  map.on('click',e=>{
   if(!ready)return;
   const c=map.getCanvas();ndc.set(e.point.x/c.clientWidth*2-1,1-e.point.y/c.clientHeight*2);raycaster.setFromCamera(ndc,camera);
   const hit=raycaster.intersectObjects(batches.filter(b=>b.mesh.visible).map(b=>b.mesh))[0];
   if(hit){const index=vehicles.findIndex(v=>v.mesh===hit.object&&v.instance===hit.instanceId);focusLine(vehicles[index].line.id,false);select(index);}
   else{
    select(-1);
    const box=[[e.point.x-8,e.point.y-8],[e.point.x+8,e.point.y+8]];
    const station=map.getZoom()>=11&&map.queryRenderedFeatures(box,{layers:['network-stations']})[0];
    if(station){openStationPopup(station);return;}
    const route=map.queryRenderedFeatures(box,{layers:['network-route','network-suspended']})[0];if(route)focusLine(route.properties.id,false);
   }
  });
  function openStationPopup(feature){
   const name=feature.properties.name,coords=feature.geometry.coordinates;
   const place=routeGraph.places.find(pl=>pl.members.some(m=>m.name===name&&m.lineId===feature.properties.id));
   const ids=place?place.lines:[feature.properties.id];
   const el=document.createElement('div');el.className='station-pop';
   const h=document.createElement('strong');h.textContent=name;
   const others=place?[...new Set(place.members.map(m=>m.name))].filter(n=>n!==name):[];
   const chips=document.createElement('div');chips.className='chips';
   for(const id of ids){const l=lines.find(x=>x.id===id);const b=document.createElement('button');b.className='chip';b.style.setProperty('--c',l?.color||'#888');b.textContent=id;b.setAttribute('aria-label',`${id} hattına odaklan`);b.onclick=()=>{popup.remove();setMode(false);focusLine(id);};chips.append(b);}
   const actions=document.createElement('div');actions.className='actions';
   if(place){for(const [which,label] of [['from','Buradan'],['to','Buraya']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{popup.remove();setRouteEnd(which,name);};actions.append(b);}}
   else{const s=document.createElement('small');s.textContent='Bu durak rota planlamasına dahil değil.';actions.append(s);}
   const fac=(place?place.members.filter(m=>m.name===name):[{lineId:feature.properties.id,name}]).map(m=>facilitiesFor(serviceInfo,m.lineId,m.name)).filter(Boolean);
   let facEl=null;
   if(fac.length){const sum=k=>fac.reduce((s,f)=>s+(Number(f[k])||0),0),has=k=>fac.some(f=>f[k]===true);
    const parts=[`Asansör ${sum('lift')}`,`Yürüyen merdiven ${sum('escalator')}`];if(has('wc'))parts.push('WC');if(has('babyRoom'))parts.push('Bebek odası');
    const f=document.createElement('p');f.className='facilities';f.textContent=parts.join(' · ');f.title='Metro İstanbul istasyon bilgisi; arıza durumunu göstermez';facEl=f;}
   let linkEl=null;if(others.length){linkEl=document.createElement('p');linkEl.className='facilities';linkEl.textContent=`Aktarma bağlantısı: ${others.join(', ')}`;}
   el.append(h,chips,...(linkEl?[linkEl]:[]),...(facEl?[facEl]:[]),actions);
   const popup=new maplibregl.Popup({closeButton:true,maxWidth:'260px',offset:10,className:'station-popup'}).setLngLat(coords).setDOMContent(el).addTo(map);
   window.demo.lastPopup=popup;
  }
  window.demo.openStation=name=>{for(const l of lines){const s=l.stations.find(x=>x.name===name);if(s){openStationPopup({properties:{id:l.id,name:s.name},geometry:{coordinates:s.coordinates}});return true;}}return false;};
  const hoverLayers=['network-route','network-suspended','network-stations'];
  const tip=new maplibregl.Popup({closeButton:false,closeOnClick:false,offset:8,className:'line-tip'});
  map.on('mousemove',e=>{
   if(!ready||matchMedia('(hover: none)').matches)return;
   const box=[[e.point.x-6,e.point.y-6],[e.point.x+6,e.point.y+6]];
   const f=map.queryRenderedFeatures(box,{layers:hoverLayers.filter(id=>map.getLayer(id))})[0];
   map.getCanvas().style.cursor=f?'pointer':'';
   if(!f){tip.remove();return;}
   const l=lines.find(x=>x.id===f.properties.id);
   tip.setLngLat(e.lngLat).setText(f.layer.id==='network-stations'?`${f.properties.name} · ${f.properties.id}`:`${l?.id} · ${l?.name.replace(new RegExp(`^${l?.id}:?\\s*`),'')}`).addTo(map);
  });
  map.getCanvas().addEventListener('mouseleave',()=>{tip.remove();map.getCanvas().style.cursor='';});
  const urlState=initialUrlState;urlSyncReady=true;
  if(urlState.line&&lines.some(l=>l.id===urlState.line)){enabled.add(urlState.line);restoredLine=urlState.line;}
  if(restoredLine)focusLine(restoredLine,false);else updateFilters();
  if(urlState.underground)setUnderground(true);
  if(urlState.mode==='route'){setMode(true);$('#route-from').value=urlState.from;$('#route-to').value=urlState.to;$('#route-form').requestSubmit();}
  else if(new URLSearchParams(location.search).get('landmark')==='rams')stadium.focus();else if(new URLSearchParams(location.search).get('landmark')==='ist')airport.focus();else if(new URLSearchParams(location.search).get('landmark')==='saw')saw.focus();else if(new URLSearchParams(location.search).get('landmark')==='kiz')kiz.focus();else if(new URLSearchParams(location.search).get('landmark')==='fb')saracoglu.focus();else if(restoredLine&&urlState.line)fit(lines.filter(l=>l.id===restoredLine));else fit(lines);
  clearTimeout(loadingTimeout);$('#retry').hidden=true;$('#status-box').classList.add('ready');$('#status').textContent='Simülasyon; tünel hatları yüzeye izdüşürülür';
 }catch(e){clearTimeout(loadingTimeout);error=e.message;$('#status').textContent=`Ağ yüklenemedi: ${error}`;$('#retry').hidden=false;$('#counts').textContent='Ağ verisi kullanılamıyor';console.error('Network initialization failed',e);}
}
init();
