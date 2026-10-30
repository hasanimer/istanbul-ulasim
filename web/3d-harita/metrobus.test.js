import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeNetwork} from './network-polyline.js';
import {buildRouteGraph,planRoute} from './route-planner.js';

const read=async f=>JSON.parse(await readFile(new URL(f,import.meta.url),'utf8'));

test('metrobus is its own category (not metro) with 44 on-line stations',async()=>{
 const mb=await read('./data/metrobus.json');
 const {lines}=normalizeNetwork(mb);
 assert.equal(lines[0].type,'metrobus');
 assert.equal(lines[0].stations.length,44);
 assert.equal(lines[0].stations[0].name,'Beylikdüzü Sondurak');
 assert.equal(lines[0].stations.at(-1).name,'Söğütlüçeşme');
 assert.equal(lines[0].tunnel.length,lines[0].coordinates.length-1);
 assert.ok(mb.speedKmh>15&&mb.speedKmh<40);
});
test('metrobus connects to the rail network at shared stations',async()=>{
 const rail=await read('./data/rail-network.json'),mb=await read('./data/metrobus.json');
 const {lines}=normalizeNetwork({lines:[...rail.lines,...mb.lines]});
 const g=buildRouteGraph(lines);
 const r=planRoute(g,'Beylikdüzü Sondurak','Kadıköy');
 assert.ok(r&&r.legs[0].lineId==='34',JSON.stringify(r?.legs.map(l=>l.lineId)));
 assert.ok(r.legs.length>=2,'needs a transfer to reach Kadıköy');
 const s=g.places.find(p=>p.name==='Söğütlüçeşme');
 assert.ok(s.lines.includes('34')&&s.lines.includes('B1'),JSON.stringify(s.lines));
});
