// Piecewise-linear arc distance. No smoothing or geometry bridging.
export function sampleRoundTrip(path, distance) {
 const phase=((distance%(2*path.length))+2*path.length)%(2*path.length);
 const reverse=phase>=path.length;
 const sample=samplePolyline(path,reverse?2*path.length-phase:phase);
 if(reverse)sample.tangent=sample.tangent.map(v=>-v);
 return {...sample,reverse};
}
const validPoint=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<85;
export function normalizeNetwork(data) {
 if(!Array.isArray(data?.lines))throw new Error('Geçersiz veri: hat listesi yok');
 const warnings=[]; const seen=new Set();
 const lines=data.lines.flatMap((line,index)=>{
  if(!line?.id||seen.has(line.id)){warnings.push(`Geçersiz / yinelenen hat: ${line?.id||index}`);return [];}
  seen.add(line.id);
  const segments=[];
  const visit=node=>{
   if(!Array.isArray(node))return;
   if(node.some(validPoint)){
    let run=[];
    const flush=()=>{if(run.length>1&&run.some(p=>p[0]!==run[0][0]||p[1]!==run[0][1]))segments.push(run);run=[];};
    for(const p of node){if(validPoint(p))run.push(p.slice(0,2));else{flush();warnings.push(`${line.id}: geçersiz nokta; geometri bölündü`);}}
    flush();
   }else for(const child of node)visit(child?.coordinates||child);
  };
  visit(line.segments??line.coordinates);
  if(!segments.length){warnings.push(`${line.id}: kullanılabilir güzergâh yok`);return [];}
  return [{...line,id:String(line.id),name:line.name||line.id,type:category(line.type),color:/^#[0-9a-f]{6}$/i.test(line.color)?line.color:'#6bd6a5',segments,stations:(line.stations||[]).filter(s=>validPoint(s.coordinates))}];
 });
 if(!lines.length)throw new Error('Gösterilebilir hat bulunamadı');
 return {lines,warnings,sourceNotes:data.sourceNotes||[]};
}
function category(type='') {
 const t=String(type).toLocaleLowerCase('tr');
 if(/metrob|brt/.test(t))return 'metrobus';
 if(/tram|tramvay/.test(t))return 'tram';
 if(/funicular|füniküler|funikuler/.test(t))return 'funicular';
 if(/suburban|banliy|commuter|marmaray/.test(t))return 'suburban';
 if(/metro/.test(t))return 'metro';
 return 'other';
}
export const canSimulate=line=>line.status!=='suspended';
export function summarizeSources(notes=[]) {
 return notes.flatMap(note=>{
  if(typeof note==='string')return [note];
  const result=[];
  if(note.source)result.push(`${note.attribution||note.source}${note.license?` · ${note.license}`:''}`);
  if(note.supplementarySource){try{result.push(`Ek çapraz kontrol: ${new URL(note.supplementarySource).hostname} — güzergâh geometrisinin kaynağı değildir.`);}catch{}}
  if(note.coverage)result.push(`Kapsam kontrolü: ${note.coverage.missingLineRefs?.length?`eksik ${note.coverage.missingLineRefs.join(', ')}`:'kaynak envanterindeki güzergâhlar mevcut'}. İşletme ve sefer durumu geometriyle doğrulanamaz.`);
  if(note.geometryEvidence)result.push(`OSM geometri kayıtları: ${note.geometryEvidence.map(e=>e.id).join(', ')}. Kaynak noktaları yumuşatılmadan korunur; tek fiziksel iz, karşı yön ve depo yolları dahil değildir.`);
  if(note.notes&&!note.coverage)result.push(...note.notes.filter(n=>typeof n==='string'));
  if(note.issues?.length)result.push(...note.issues.filter(n=>typeof n==='string'));
  return result;
 });
}
export function filterLines(lines,{query='',categories,enabled}={}) {
 const q=query.trim().toLocaleLowerCase('tr');
 return lines.filter(l=>(!categories||categories.includes(l.type))&&(!enabled||enabled.includes(l.id))&&`${l.id} ${l.name} ${(l.stations||[]).map(s=>s.name).join(' ')}`.toLocaleLowerCase('tr').includes(q));
}
export function createPolyline(points) {
  const edges=[]; let length=0;
  for(let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i];
    const size=Math.hypot(...b.map((v,j)=>v-a[j]));
    if(size>0){edges.push({a,b,start:length,size,index:i-1});length+=size;}
  }
  if(!length) throw new Error('Polyline requires a nonzero edge');
  return {edges,length};
}
export function samplePolyline(path,distance) {
  const d=Math.max(0,Math.min(path.length,distance));
  const edge=path.edges.find(e=>d<e.start+e.size)||path.edges.at(-1);
  const t=(d-edge.start)/edge.size;
  return {position:edge.a.map((v,j)=>v+(edge.b[j]-v)*t),tangent:edge.b.map((v,j)=>(v-edge.a[j])/edge.size),edge:edge.index,t};
}
