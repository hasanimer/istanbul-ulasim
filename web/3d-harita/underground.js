import * as THREE from 'three';

// Point i is underground only when every edge touching it is a tunnel, so the
// edge at a portal becomes a ramp between the surface and the tunnel level.
export function pointDepths(flags, depth) {
  if (!flags.length) return [];
  return Array.from({length: flags.length + 1}, (_, i) => {
    const before = i > 0 ? flags[i - 1] : '1', after = i < flags.length ? flags[i] : '1';
    return before === '1' && after === '1' ? -depth : 0;
  });
}

// Tunnel ribbons drawn below the street plane. Width/depth are exaggerated with
// zoom so the structure stays legible at city scale; this is not a surveyed depth.
export function createUndergroundLayer(lines, toLocal) {
  const group = new THREE.Group();
  group.name = 'underground-network';
  group.visible = false;
  const items = [];
  for (const line of lines) {
    if (!line.tunnel || !line.tunnel.includes('1')) continue;
    const pts = line.coordinates.map(toLocal);
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial({color: line.color, transparent: true, opacity: .92, side: THREE.DoubleSide, depthWrite: false});
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 5;
    group.add(mesh);
    const shafts = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color: line.color, transparent: true, opacity: .55}));
    group.add(shafts);
    items.push({line, pts, mesh, shafts});
  }
  let current = '';
  function rebuild(width, depth) {
    const sig = `${width.toFixed(1)}:${depth.toFixed(1)}`;
    if (sig === current) return;
    current = sig;
    for (const it of items) {
      const z = pointDepths(it.line.tunnel, depth), pos = [];
      for (let i = 0; i < it.line.tunnel.length; i++) {
        if (it.line.tunnel[i] !== '1') continue;
        const a = it.pts[i], b = it.pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        if (!len) continue;
        const nx = -dy / len * width / 2, ny = dx / len * width / 2;
        const A1 = [a[0] + nx, a[1] + ny, z[i]], A2 = [a[0] - nx, a[1] - ny, z[i]], B1 = [b[0] + nx, b[1] + ny, z[i + 1]], B2 = [b[0] - nx, b[1] - ny, z[i + 1]];
        pos.push(...A1, ...A2, ...B1, ...A2, ...B2, ...B1);
      }
      it.mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      it.mesh.geometry.computeBoundingSphere();
      const shaft = [];
      for (const st of it.line.stations || []) {
        // A dotted shaft at each underground station: from street level to the tunnel.
        let best = 0, bestD = Infinity; const p = toLocal(st.coordinates);
        it.pts.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bestD) { bestD = d; best = i; } });
        if (bestD < 250 && z[best] < 0) shaft.push(p[0], p[1], 0, it.pts[best][0], it.pts[best][1], z[best]);
      }
      it.shafts.geometry.setAttribute('position', new THREE.Float32BufferAttribute(shaft, 3));
      it.shafts.geometry.computeBoundingSphere();
    }
  }
  function setFocus(activeId) {
    for (const it of items) {
      const on = !activeId || it.line.id === activeId;
      it.mesh.material.opacity = on ? .92 : .18;
      it.shafts.material.opacity = on ? .55 : .1;
    }
  }
  const depthFor = (lineId, flags) => flags;
  return {group, rebuild, setFocus, depthFor, dispose() { for (const it of items) { it.mesh.geometry.dispose(); it.mesh.material.dispose(); it.shafts.geometry.dispose(); it.shafts.material.dispose(); } }};
}
