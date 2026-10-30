import test from 'node:test';
test('round trip reverses tangent at endpoint and wraps without teleporting',()=>{
 const p=createPolyline([[0,0],[3,0]]);
 assert.deepEqual(sampleRoundTrip(p,3).position,[3,0]);
 assert.deepEqual(sampleRoundTrip(p,4).position,[2,0]);
 assert.equal(sampleRoundTrip(p,4).tangent[0],-1);
 assert.deepEqual(sampleRoundTrip(p,6).position,[0,0]);
 assert.deepEqual(sampleRoundTrip(p,-1).position,[1,0]);
});
test('segments remain disconnected and invalid coordinates split rather than bridge',()=>{
 const {lines,warnings}=normalizeNetwork({lines:[{id:'T1',name:'Test',type:'tram',coordinates:[[[28,41],[28.1,41]],[[29,41],[29.1,41]]]},{id:'M1',type:'metro',segments:[[[28,41],[28.1,41],null,[29,41],[29.1,41]]]}]});
 assert.equal(lines[0].segments.length,2);
 assert.equal(lines[1].segments.length,2);
 assert.ok(warnings.length>0);
 assert.deepEqual(lines[0].segments[1][0],[29,41]);
 assert.throws(()=>normalizeNetwork({lines:[]}),/hat/i);
});
test('filters combine Turkish search with category and explicit line selection',()=>{
 const lines=[{id:'T1',name:'Kabataş',type:'tram'},{id:'M2',name:'ŞİŞLİ',type:'metro'},{id:'B1',name:'Marmaray',type:'suburban'}];
 assert.deepEqual(filterLines(lines,{query:'şişli'}).map(l=>l.id),['M2']);
 assert.deepEqual(filterLines(lines,{query:'t',categories:['metro']}).map(l=>l.id),[]);
 assert.deepEqual(filterLines(lines,{categories:['tram','suburban'],enabled:['B1']}).map(l=>l.id),['B1']);
 assert.equal(filterLines(lines,{categories:[]}).length,0);
});
test('station names are searchable without changing source line identity',()=>{
 assert.deepEqual(filterLines([{id:'M2',name:'Metro',type:'metro',stations:[{name:'ŞİŞLİ'}]}],{query:'şişli'}).map(l=>l.id),['M2']);
});
test('suspended geometry is retained but cannot create simulated vehicles',()=>{
 const {lines}=normalizeNetwork({lines:[{id:'B2',status:'suspended',coordinates:[[28,41],[29,41]]}]});
 assert.equal(lines.length,1);assert.equal(canSimulate(lines[0]),false);assert.equal(canSimulate({id:'M2'}),true);
});
test('structured source disclosure is human-readable and excludes raw evidence dumps',()=>{
 const notes=summarizeSources([{source:'OpenStreetMap contributors',license:'ODbL 1.0'},{coverage:{missingLineRefs:['X']},notes:['Coverage note']},{geometryEvidence:[{id:'T1',sourceUrls:['https://example.org'],rawMapFile:'/private/file'}]}]);
 assert.ok(notes.some(n=>n.includes('ODbL')));assert.ok(notes.some(n=>n.includes('T1')));assert.ok(!notes.join().includes('rawMapFile'));assert.ok(!notes.join().includes('[object Object]'));
});
test('duplicate vertices are harmless; degenerate paths fail explicitly',()=>{
 assert.equal(createPolyline([[0,0],[0,0],[3,4]]).length,5);
 assert.throws(()=>createPolyline([[0,0],[0,0]]),/nonzero/);
});
import assert from 'node:assert/strict';
import {createPolyline, samplePolyline, sampleRoundTrip, normalizeNetwork, filterLines, canSimulate, summarizeSources} from './network-polyline.js';
test('arc-distance interpolation stays exactly on each source edge including corners', () => {
  const path=createPolyline([[0,0],[3,0],[3,4]]);
  assert.equal(path.length,7);
  for(let d=0;d<=7;d+=0.03125){
    const {position}=samplePolyline(path,d);
    assert.ok((position[1]===0 && position[0]>=0 && position[0]<=3)||(position[0]===3 && position[1]>=0 && position[1]<=4));
  }
  assert.deepEqual(samplePolyline(path,5).position,[3,2]);
});
