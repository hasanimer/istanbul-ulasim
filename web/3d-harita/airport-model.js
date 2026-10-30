import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// İstanbul Havalimanı terminal from OSM 3D building parts.
// project(lonlat) -> [x, y] in the scene's local metres; the group is placed at
// project(site.center), so geometry is built relative to that point.
export function createAirportModel(site, project) {
  const group = new THREE.Group();
  group.name = 'Istanbul-Airport-terminal';
  const [cx, cy] = project(site.center);
  const local = p => { const [x, y] = project(p); return new THREE.Vector2(x - cx, y - cy); };
  const geometries = new Set(), materials = new Set();
  const mat = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({color, roughness: .7, metalness: .1, ...extra}); materials.add(m); return m; };
  const materialsByKind = {
    // Tops read as the pale metal roofs, walls as dark glazing (vertex colours).
    podium: mat(0xffffff, {vertexColors: true, roughness: .6, metalness: .05}),
    commercial: mat(0xffffff, {vertexColors: true, roughness: .6, metalness: .05}),
    column: mat(0xf2f3ef, {metalness: 0}),
    roof: mat(0xffffff, {vertexColors: true, roughness: .6, metalness: .05}),
    dome: mat(0xf4f7fa, {roughness: .35, metalness: .15, emissive: 0x26323a, emissiveIntensity: .25}),
  };
  const prism = (ring, min, max, round = false) => {
    const shape = new THREE.Shape(ring.map(local));
    // roof:shape=round -> softened eaves via an inward bevel (footprint unchanged).
    const t = round ? Math.min(4, (max - min) / 4) : 0;
    const g = new THREE.ExtrudeGeometry(shape, round
      ? {depth: max - min - 2 * t, bevelEnabled: true, bevelThickness: t, bevelSize: t, bevelOffset: -t, bevelSegments: 4}
      : {depth: max - min, bevelEnabled: false});
    g.translate(0, 0, min + t);
    return g;
  };
  if (site.colored) return coloredModel(site, group, local, prism, geometries, materials);
  const buckets = {podium: [], commercial: [], column: [], roof: []};
  // Ground podium: the mapped terminal outline at an approximate 10 m (the
  // outline itself carries no height in OSM; parts above start at 10 m).
  const podium = site.podiumHeight ?? 10;
  if (podium > 0) buckets.podium.push(prism(site.outline, 0, podium));
  const domes = [];
  for (const part of site.parts) {
    if (part.roof === 'dome') { domes.push(part); continue; }
    const key = part.kind === 'column' ? 'column' : part.kind === 'roof' ? 'roof' : 'commercial';
    buckets[key].push(prism(part.ring, part.min, part.height, part.roof === 'round'));
  }
  let drawCalls = 0, triangles = 0;
  for (const [key, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const merged = mergeGeometries(list.map(g => g.toNonIndexed()));
    list.forEach(g => g.dispose());
    merged.computeVertexNormals(); geometries.add(merged);
    if (key !== 'column') {
      const n = merged.attributes.normal, colors = new Float32Array(n.count * 3);
      const top = new THREE.Color(key === 'roof' ? 0xe4e7ea : 0xc9ced2), wall = new THREE.Color(key === 'roof' ? 0xaeb5ba : 0x46525c);
      for (let i = 0; i < n.count; i++) (Math.abs(n.getZ(i)) > .5 ? top : wall).toArray(colors, i * 3);
      merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const mesh = new THREE.Mesh(merged, materialsByKind[key]); mesh.name = `terminal-${key}`;
    group.add(mesh); drawCalls++; triangles += merged.attributes.position.count / 3;
  }
  // Skylight domes: OSM roof:shape=dome parts -> flattened hemispheres sized
  // to each footprint (radius = mean distance to the footprint centroid).
  if (domes.length) {
    const sphere = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    sphere.rotateX(Math.PI / 2); geometries.add(sphere);
    const inst = new THREE.InstancedMesh(sphere, materialsByKind.dome, domes.length); inst.name = 'skylight-domes';
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    domes.forEach((d, i) => {
      const pts = d.ring.map(local), c = pts.reduce((a, b) => a.add(b), new THREE.Vector2()).divideScalar(pts.length);
      const r = pts.reduce((a, b) => a + b.distanceTo(c), 0) / pts.length;
      const h = Math.max(1.2, d.height - d.min);
      inst.setMatrixAt(i, m.compose(p.set(c.x, c.y, d.min), q, s.set(r, r, h)));
    });
    inst.instanceMatrix.needsUpdate = true; inst.computeBoundingSphere();
    group.add(inst); drawCalls++; triangles += sphere.index.count / 3 * domes.length;
  }
  if (site.details) {
    const d = addTerminalDetails(site.details, materials, geometries);
    group.add(d.group); drawCalls += d.drawCalls; triangles += d.triangles;
  }
  const stats = {parts: site.parts.length, domes: domes.length, drawCalls, triangles: Math.round(triangles)};
  return {group, stats, dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); group.traverse(o => o.isInstancedMesh && o.dispose()); }};
}

// Small landmarks with per-part colours (walls/top), gabled roofs and domes
// sitting on a body of height - roofHeight.
function paint(g, wall, top) {
  const n = g.attributes.normal, c = new Float32Array(n.count * 3), w = new THREE.Color(wall), t = new THREE.Color(top);
  for (let i = 0; i < n.count; i++) (n.getZ(i) > .5 ? t : w).toArray(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function gable(pts, z0, h, color) {
  // Oriented bounding box of the footprint; ridge along its longer side.
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], ang = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(-ang), s = Math.sin(-ang), rx = pts.map(p => p.x * c - p.y * s), ry = pts.map(p => p.x * s + p.y * c);
    const box = {ang, x0: Math.min(...rx), x1: Math.max(...rx), y0: Math.min(...ry), y1: Math.max(...ry)};
    box.area = (box.x1 - box.x0) * (box.y1 - box.y0);
    if (!best || box.area < best.area) best = box;
  }
  let {ang, x0, x1, y0, y1} = best;
  if (y1 - y0 > x1 - x0) { ang += Math.PI / 2; [x0, x1, y0, y1] = [y0, y1, -x1, -x0]; }
  const ym = (y0 + y1) / 2, v = [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], [x0, ym, h], [x1, ym, h]];
  const tri = [[0, 1, 5], [0, 5, 4], [3, 4, 5], [3, 5, 2], [0, 4, 3], [1, 2, 5]];
  const pos = tri.flatMap(t => t.flatMap(i => v[i]));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.rotateZ(ang); g.translate(0, 0, z0); g.computeVertexNormals();
  const c = new THREE.Color(color), col = new Float32Array(pos.length); for (let i = 0; i < col.length; i += 3) c.toArray(col, i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('normal'); g.computeVertexNormals();
  return g;
}
function coloredModel(site, group, local, prism, geometries, materials) {
  const pieces = [], domes = [];
  for (const part of site.parts) {
    const pts = part.ring.map(local), rh = part.roof === 'gabled' || part.roof === 'dome' ? (part.roofHeight || 0) : 0;
    const body = prism(part.ring, part.min, part.height - rh);
    body.deleteAttribute('uv');
    pieces.push(paint(body.toNonIndexed(), part.wall, part.top)); body.dispose();
    if (part.roof === 'gabled' && rh) pieces.push(gable(pts, part.height - rh, rh, part.top));
    if (part.roof === 'dome' && rh) domes.push({pts, z: part.height - rh, h: rh, color: part.top});
  }
  pieces.forEach(g => { if (g.attributes.uv) g.deleteAttribute('uv'); if (g.index) g.setIndex(null); });
  const merged = mergeGeometries(pieces.map(g => g.index ? g.toNonIndexed() : g)); pieces.forEach(g => g.dispose());
  merged.computeVertexNormals(); geometries.add(merged);
  const bodyMat = new THREE.MeshStandardMaterial({vertexColors: true, roughness: .8, metalness: 0}); materials.add(bodyMat);
  const mesh = new THREE.Mesh(merged, bodyMat); mesh.name = 'landmark-body'; group.add(mesh);
  let drawCalls = 1;
  if (domes.length) {
    const sphere = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2); sphere.rotateX(Math.PI / 2); geometries.add(sphere);
    const domeMat = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: .5, metalness: .3}); materials.add(domeMat);
    const inst = new THREE.InstancedMesh(sphere, domeMat, domes.length); inst.name = 'landmark-domes';
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    domes.forEach((d, i) => {
      const c = d.pts.reduce((a, b) => a.add(b), new THREE.Vector2()).divideScalar(d.pts.length), r = d.pts.reduce((a, b) => a + b.distanceTo(c), 0) / d.pts.length;
      inst.setMatrixAt(i, m.compose(p.set(c.x, c.y, d.z), q, s.set(r, r, d.h))); inst.setColorAt(i, new THREE.Color(d.color));
    });
    inst.instanceMatrix.needsUpdate = true; inst.computeBoundingSphere(); group.add(inst); drawCalls++;
  }
  const stats = {parts: site.parts.length, domes: domes.length, drawCalls, triangles: Math.round(merged.attributes.position.count / 3)};
  return {group, stats, dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); group.traverse(o => o.isInstancedMesh && o.dispose()); }};
}

// Photo-informed SAW detail, built in the terminal frame (x along the pier,
// y from airside to landside, metres around the site centre), then rotated.
function addTerminalDetails(d, materials, geometries) {
  const g = new THREE.Group(); g.name = 'terminal-details'; g.rotation.z = d.angle;
  const colored = [], color = (geo, hex) => {
    geo = geo.index ? geo.toNonIndexed() : geo; if (geo.attributes.uv) geo.deleteAttribute('uv');
    const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); colored.push(geo); return geo;
  };
  const box = (x0, x1, y0, y1, z0, z1, hex) => { const b = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); b.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return color(b, hex); };
  const {pier, hall, gates} = d;
  // Pier: maroon band on the airside facade + light roof edge.
  box(pier.x0, pier.x1, pier.y0 - .6, pier.y0 + .4, 4.5, 8, 0x8e2a2a);
  box(pier.x0, pier.x1, pier.y0 - .8, pier.y0 + .5, pier.height - .8, pier.height + .4, 0xe2e4e3);
  // Hall walls up to the eaves, then barrel vaults spanning airside -> landside.
  box(hall.x0, hall.x1, hall.y0, hall.y1, 0, hall.eave, 0xd8dad8);
  const span = (hall.x1 - hall.x0) / hall.vaults, len = hall.y1 - hall.y0, ym = (hall.y0 + hall.y1) / 2;
  for (let i = 0; i < hall.vaults; i++) {
    const xc = hall.x0 + span * (i + .5);
    const v = new THREE.CylinderGeometry(1, 1, len, 28, 1, false, -Math.PI / 2, Math.PI);
    v.scale(span / 2 * .98, 1, hall.rise); v.translate(xc, ym, hall.eave); color(v, 0xb9bfc3);
    // Teal edge band at both ends of each vault.
    for (const y of [hall.y0 - .3, hall.y1 + .3]) {
      const e = new THREE.CylinderGeometry(1, 1, 1.4, 28, 1, true, -Math.PI / 2, Math.PI);
      e.scale(span / 2 * 1.0, 1, hall.rise * 1.04); e.translate(xc, y, hall.eave); color(e, 0x2f9c8f);
    }
  }
  // Gate towers (red/white drums) under white arches, with jet bridges.
  const step = (pier.x1 - pier.x0) / (gates.count + 1);
  for (let i = 1; i <= gates.count; i++) {
    const x = pier.x0 + step * i, y = pier.y0 - gates.offset;
    const t = new THREE.CylinderGeometry(gates.towerRadius, gates.towerRadius, gates.towerHeight, 20); t.rotateX(Math.PI / 2); t.translate(x, y, gates.towerHeight / 2); color(t, 0xb23b36);
    const cap = new THREE.CylinderGeometry(gates.towerRadius + .3, gates.towerRadius + .3, 2.2, 20); cap.rotateX(Math.PI / 2); cap.translate(x, y, gates.towerHeight - 1); color(cap, 0xf1f1ee);
    const arch = new THREE.TorusGeometry(gates.offset + 4, .45, 6, 24, Math.PI); arch.rotateX(Math.PI / 2); arch.rotateZ(Math.PI / 2);
    arch.scale(1, 1, .55); arch.translate(x, pier.y0 - gates.offset / 2, gates.towerHeight - 3); color(arch, 0xf4f4f2);
    box(x - 1.6, x + 1.6, y - gates.towerRadius - 26, y - gates.towerRadius, 4.5, 7.5, 0xc9ccce); // jet bridge
  }
  const merged = mergeGeometries(colored); colored.forEach(c => c.dispose()); merged.computeVertexNormals(); geometries.add(merged);
  const m = new THREE.MeshStandardMaterial({vertexColors: true, roughness: .6, metalness: .1, side: THREE.DoubleSide}); materials.add(m);
  const mesh = new THREE.Mesh(merged, m); mesh.name = 'saw-photo-details'; g.add(mesh);
  return {group: g, drawCalls: 1, triangles: merged.attributes.position.count / 3};
}
