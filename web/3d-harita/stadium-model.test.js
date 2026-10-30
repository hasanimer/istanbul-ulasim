import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// CPU-only: no DOM, WebGL context, external assets, or GPU required.
test('creates a metre-scale, detailed Z-up stadium with a regulation pitch and open canopy', async () => {
  const { createStadiumModel } = await import('./stadium-model.js');
  const model = createStadiumModel();
  const { group, stats } = model;
  assert.ok(group.isGroup);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x >= 232 && size.x <= 234, `length ${size.x}`);
  assert.ok(size.y >= 205 && size.y <= 207, `width ${size.y}`);
  assert.ok(size.z >= 49 && size.z <= 52, `height ${size.z}`);
  const pitch = group.getObjectByName('pitch');
  pitch.geometry.computeBoundingBox();
  const pitchSize = pitch.geometry.boundingBox.getSize(new THREE.Vector3());
  assert.equal(pitchSize.x, 105);
  assert.equal(pitchSize.y, 68);
  assert.ok(group.getObjectByName('lower-tier'));
  assert.ok(group.getObjectByName('upper-tier'));
  assert.ok(stats.seatCount > 20000);
  assert.ok(stats.drawCalls <= 40, `draw calls ${stats.drawCalls}`);
  const roof = group.getObjectByName('roof');
  assert.ok(roof);
  // Test actual triangles, not metadata: vertical ray through field stays clear.
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 100), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(roof, true).length, 0);
  ray.ray.origin.set(95, 0, 100);
  assert.ok(ray.intersectObject(roof, true).length > 0);
  group.traverse(object => {
    if (object.geometry) {
      for (const attribute of Object.values(object.geometry.attributes)) {
        assert.ok(Array.from(attribute.array).every(Number.isFinite), `${object.name} finite attributes`);
      }
      if (object.geometry.attributes.normal) {
        const n = object.geometry.attributes.normal;
        for (let i = 0; i < n.count; i++) {
          const length = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
          assert.ok(length > 0.98 && length < 1.02, `${object.name} normal length ${length}`);
        }
      }
    }
    if (object.isInstancedMesh) assert.ok(Array.from(object.instanceMatrix.array).every(Number.isFinite));
  });
  model.dispose();
});

test('roof cutaway is reversible; all owned GPU resources are disposed exactly once', async () => {
  const { createStadiumModel } = await import('./stadium-model.js');
  const model = createStadiumModel();
  assert.equal(typeof model.setRoofVisible, 'function');
  model.setRoofVisible(false);
  assert.equal(model.group.getObjectByName('roof').visible, false);
  model.setRoofVisible(true);
  assert.equal(model.group.getObjectByName('roof').visible, true);
  const owned = new Set();
  model.group.traverse(o => {
    if (o.geometry) owned.add(o.geometry);
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        owned.add(m);
        if (m.map) owned.add(m.map);
      }
    }
    if (o.isInstancedMesh) owned.add(o);
  });
  const counts = new Map();
  for (const resource of owned) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1));
  const scene = new THREE.Scene(); scene.add(model.group);
  model.dispose();model.dispose();
  assert.equal(model.group.parent, null);
  assert.equal(model.group.children.length, 0);
  for (const resource of owned) assert.equal(counts.get(resource), 1, `${resource.type || 'resource'} disposed once`);
});

test('Saracoğlu: same procedural stadium fitted to the OSM envelope, RAMS defaults unchanged',async()=>{
 const {createStadiumModel}=await import('./stadium-model.js');
 const site=JSON.parse(await readFile(new URL('./data/saracoglu-site.json',import.meta.url),'utf8'));
 const fb=createStadiumModel({outerHalf:site.halfExtents.outline,bowlInnerHalf:site.halfExtents.roofOpening,height:site.heightMeters});
 const size=new THREE.Box3().setFromObject(fb.group).getSize(new THREE.Vector3());
 assert.ok(Math.abs(size.x-2*site.halfExtents.outline[0])<4&&Math.abs(size.y-2*site.halfExtents.outline[1])<4,JSON.stringify(size));
 assert.ok(size.z<=site.heightMeters+.5);
 assert.equal(site.heightIsEstimate,true);
 const rams=new THREE.Box3().setFromObject(createStadiumModel().group).getSize(new THREE.Vector3());
 assert.ok(Math.abs(rams.x-233)<1&&Math.abs(rams.y-206)<1);
});
