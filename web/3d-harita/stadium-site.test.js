import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isStadiumFeature,buildingMaskFilter} from './stadium-site.js';
test('stadium replacement detects outer footprint even though center is roof hole',async()=>{
 const data=JSON.parse(await readFile(new URL('./data/stadium-site.json',import.meta.url),'utf8'));
 assert.equal(isStadiumFeature({geometry:{type:'Polygon',coordinates:[data.outline]}},data.center),true);
 assert.equal(isStadiumFeature({geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}},data.center),false);
 assert.ok(data.rotationRadians>.8&&data.rotationRadians<1);
 assert.equal(data.heightMeters,51);
 assert.equal(data.osmWay,'342828509');
});
test('stadium mask retains original building filter and hides only selected feature IDs',()=>{
 const original=['!',['has','hide_3d']];
 assert.deepEqual(buildingMaskFilter(original,[]),original);
 const result=buildingMaskFilter(original,[42,42,99]);
 const exclusion=['!', ['in', ['id'], ['literal', [42,99]]]];
 assert.deepEqual(result,['all',original,exclusion]);
 assert.deepEqual(original,['!',['has','hide_3d']]);
});
