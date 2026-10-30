import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildRouteGraph,planRoute,stationPlaces,routeGeometry} from './route-planner.js';
import {pointDepths} from './underground.js';

const line=(id,coordinates,stations,extra={})=>({id,name:id,type:'metro',color:'#ff0000',segments:[coordinates],coordinates,stations,...extra});
// Two lines crossing at 'Merkez' (same name, 40 m apart) plus a parallel line.
const A=line('A',[[29,41],[29.02,41]],[{name:'Batı',coordinates:[29,41]},{name:'Merkez',coordinates:[29.01,41]},{name:'Doğu',coordinates:[29.02,41]}]);
const B=line('B',[[29.0105,40.99],[29.0105,41.01]],[{name:'Güney',coordinates:[29.0105,40.99]},{name:'Merkez',coordinates:[29.0105,41.0002]},{name:'Kuzey',coordinates:[29.0105,41.01]}]);
const S=line('S',[[29,41.03],[29.02,41.03]],[{name:'Uzak',coordinates:[29,41.03]},{name:'Kapalı',coordinates:[29.02,41.03]}],{status:'suspended'});

test('stations are ordered by position along the line, not data order',()=>{
 const shuffled=line('C',[[29,41],[29.02,41]],[{name:'Son',coordinates:[29.02,41]},{name:'İlk',coordinates:[29,41]},{name:'Orta',coordinates:[29.01,41]}]);
 const g=buildRouteGraph([shuffled]);
 assert.deepEqual(g.lineStops.C.map(s=>s.name),['İlk','Orta','Son']);
});
test('same-name nearby stations become one transfer place; suspended lines are excluded',()=>{
 const places=stationPlaces(buildRouteGraph([A,B,S]));
 const merkez=places.find(p=>p.name==='Merkez');
 assert.deepEqual(merkez.lines.sort(),['A','B']);
 assert.equal(places.some(p=>p.name==='Kapalı'),false);
});
test('route prefers fewest transfers and reports legs with stop counts',()=>{
 const g=buildRouteGraph([A,B,S]);
 const r=planRoute(g,'Batı','Kuzey');
 assert.equal(r.transfers,1);
 assert.deepEqual(r.legs.map(l=>[l.lineId,l.from,l.to,l.stops]),[['A','Batı','Merkez',1],['B','Merkez','Kuzey',1]]);
 assert.equal(planRoute(g,'Batı','Doğu').transfers,0);
 assert.equal(planRoute(g,'batı','DOĞU').legs.length,1,'Turkish case-insensitive lookup');
 assert.throws(()=>planRoute(g,'Batı','Uzak'),/bulunamadı/,'stops only on suspended lines are not offered');
 assert.throws(()=>planRoute(g,'Yok','Batı'),/bulunamadı/);
});
test('leg geometry is a slice of real line coordinates between the two stops',()=>{
 const g=buildRouteGraph([A,B]);
 const leg=planRoute(g,'Batı','Merkez').legs[0];
 const coords=routeGeometry(g,leg);
 assert.ok(Math.abs(coords[0][0]-29)<1e-9&&Math.abs(coords[0][1]-41)<1e-9);
 assert.ok(Math.abs(coords.at(-1)[0]-29.01)<1e-9);
 assert.ok(coords.every(p=>Math.abs(p[1]-41)<1e-9&&p[0]>=29-1e-9&&p[0]<=29.01+1e-9));
 const back=routeGeometry(g,planRoute(g,'Doğu','Merkez').legs[0]);
 assert.ok(back[0][0]>back.at(-1)[0],'reverse travel keeps travel direction');
});
test('portal edges ramp: a point is underground only when all its edges are tunnels',()=>{
 assert.deepEqual(pointDepths('0110',1),[0,0,-1,0,0]);
 assert.deepEqual(pointDepths('11',1),[-1,-1,-1]);
 assert.deepEqual(pointDepths('',1),[]);
});
test('real network: every line has one tunnel flag per edge, and a real cross-city route exists',async()=>{
 const data=JSON.parse(await readFile(new URL('./data/rail-network.json',import.meta.url),'utf8'));
 for(const l of data.lines){assert.equal(l.tunnel.length,l.coordinates.length-1,l.id);assert.match(l.tunnel,/^[01]+$/);}
 const byId=Object.fromEntries(data.lines.map(l=>[l.id,l]));
 assert.ok(byId.M4.tunnel.includes('1'));
 assert.ok(byId.B1.tunnel.includes('1'),'Marmaray Bosphorus tube is a tunnel');
 assert.ok(!byId.T2.tunnel.includes('1'));
 const lines=data.lines.map(l=>({...l,segments:[l.coordinates]}));
 const g=buildRouteGraph(lines);
 const r=planRoute(g,'Kadıköy','Taksim');
 assert.ok(r&&r.legs.length>=2&&r.transfers<=3,JSON.stringify(r?.legs));
 for(const leg of r.legs)assert.ok(routeGeometry(g,leg).length>=2);
});
