import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('current facts have check time, official sources and no live-service claim',async()=>{
 const info=JSON.parse(await readFile(new URL('./data/current-info.json',import.meta.url),'utf8'));
 assert.ok(Number.isFinite(Date.parse(info.checkedAt)));
 assert.equal(info.liveServiceTracking,false);
 assert.equal(info.lines.M5.terminal,'Sultanbeyli');
 assert.equal(info.lines.M11.terminal,'Halkalı');
 assert.equal(info.lines.B2.status,'suspended');
 assert.equal(info.lines.B2.reopeningVerified,false);
 assert.deepEqual(info.excludedProjects.map(p=>p.id),['M10','M12']);
 for(const item of [...Object.values(info.lines),...info.excludedProjects]) assert.equal(new URL(item.source).protocol,'https:');
 const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
 assert.ok(html.includes('id="current-facts"'));
 assert.ok(html.includes('id="checked-at"'));
});
test('network entry exposes labelled exploration controls and simulation disclosure',async()=>{
 const html=await readFile(new URL('./network.html',import.meta.url),'utf8');
 for(const id of ['map','search','categories','line-list','pause','speed','view','fit-all','selection','status','source-notes','coverage','counts','panel-toggle','line-detail','back-network','retry']) assert.ok(html.includes(`id="${id}"`),id);
 assert.ok(html.includes('Simülasyon; tünel hatları yüzeye izdüşürülür'));
 assert.ok(html.includes('network-main.js'));
});
test('network scene uses source segments and shared-context camera rather than a spline',async()=>{
 const js=await readFile(new URL('./network-main.js',import.meta.url),'utf8');
 for(const token of ['sampleRoundTrip','line.segments','projectionMatrixInverse','matrixWorldAutoUpdate = false','renderer.resetState()','args.defaultProjectionData.mainMatrix','trainScreen','getState']) assert.ok(js.includes(token),token);
 assert.ok(!js.includes('CatmullRom'));
});
