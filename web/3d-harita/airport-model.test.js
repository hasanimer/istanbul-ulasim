import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createAirportModel} from './airport-model.js';

const site=JSON.parse(await readFile(new URL('./data/airport-terminal.json',import.meta.url),'utf8'));
const C=Math.cos(41.26*Math.PI/180),project=p=>[p[0]*111320*C,p[1]*111320];

test('terminal data comes from OSM building parts inside the mapped outline',()=>{
 assert.equal(site.osmWay,687768729);
 assert.ok(site.parts.length>600);
 assert.ok(site.parts.filter(p=>p.roof==='dome').length>400,'skylight domes');
 assert.ok(site.parts.every(p=>p.height>p.min&&p.ring.length>=3));
 assert.match(site.attribution,/OpenStreetMap/);
});
test('model is georeferenced, sized like the real ~1.2 km terminal and cheap to draw',()=>{
 const m=createAirportModel(site,project);
 const box=new THREE.Box3().setFromObject(m.group),size=box.getSize(new THREE.Vector3());
 assert.ok(size.x>1100&&size.x<1400&&size.y>1100&&size.y<1400,JSON.stringify(size));
 assert.ok(box.max.z>=45&&box.max.z<=50,`max height ${box.max.z}`);
 assert.ok(box.min.z>=0);
 assert.ok(m.stats.drawCalls<=6,JSON.stringify(m.stats));
 m.dispose();
});

test('Sabiha Gökçen: OSM footprints with flagged estimated heights, near the M4 airport station',async()=>{
 const saw=JSON.parse(await readFile(new URL('./data/saw-terminal.json',import.meta.url),'utf8'));
 assert.equal(saw.osmWay,595327339);
 assert.ok(saw.parts.every(p=>p.estimatedHeight===true));
 const m=createAirportModel(saw,project);
 const size=new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3());
 assert.ok(size.x>500&&size.x<1100&&size.z<=27,JSON.stringify(size));
 m.dispose();
 const rail=JSON.parse(await readFile(new URL('./data/rail-network.json',import.meta.url),'utf8'));
 const st=rail.lines.find(l=>l.id==='M4').stations.find(s=>/Sabiha/i.test(s.name));
 assert.ok(st,'M4 airport station');
 const d=Math.hypot((st.coordinates[0]-saw.center[0])*84000,(st.coordinates[1]-saw.center[1])*111320);
 assert.ok(d<800,`station ${Math.round(d)} m from terminal`);
});

test('Kız Kulesi: OSM parts on the islet, tower dome on top, ~27 m tall, credited detail model link',async()=>{
 const kk=JSON.parse(await readFile(new URL('./data/kizkulesi-site.json',import.meta.url),'utf8'));
 const m=createAirportModel(kk,project);
 const box=new THREE.Box3().setFromObject(m.group),size=box.getSize(new THREE.Vector3());
 assert.ok(size.x>35&&size.x<60&&size.y>35&&size.y<60,JSON.stringify(size));
 assert.ok(box.max.z>25&&box.max.z<28,`top ${box.max.z}`);
 assert.equal(m.stats.domes,1);
 assert.ok(m.stats.drawCalls<=2);
 assert.match(kk.detailModel.embed,/^https:\/\/sketchfab\.com\/models\/[0-9a-f]{32}\/embed$/);
 m.dispose();
});
