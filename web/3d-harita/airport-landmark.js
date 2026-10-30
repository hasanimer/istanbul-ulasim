import {createAirportModel} from './airport-model.js';
import istSite from './data/airport-terminal.json';

function inside(ring, p) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
// Any generic tile building whose vertices are mostly inside the mapped terminal outline is replaced by the model.
export function isTerminalFeature(feature, outline = istSite.outline) {
  const g = feature.geometry;
  const rings = g?.type === 'Polygon' ? [g.coordinates[0]] : g?.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : [];
  return rings.some(r => r.filter(p => inside(outline, p)).length / r.length > .6);
}

// options: {site, key, button, info, focus: {offset, zoom, bearing}}
export function mountAirport(map, root, toLocal, buildingMask, options = {}) {
  const site = options.site || istSite, key = options.key || 'airport';
  const outlines = [site.outline, ...site.parts.filter(p => p.kind !== 'column' && p.roof !== 'dome' && p.ring.length > 6).map(p => p.ring)];
  const view = {offset: .004, zoom: 15.2, bearing: 180, ...(options.focus || {})};
  const model = createAirportModel(site, p => toLocal(p));
  model.group.position.fromArray(toLocal(site.center));
  model.group.visible = false;
  root.add(model.group);
  const masks = new Set();
  let maskTimer;
  const button = document.querySelector(options.button || '#airport-focus');
  const info = document.querySelector(options.info || '#airport-info');
  button.disabled = false;
  const near = () => { const c = map.getCenter(); return Math.hypot((c.lng - site.center[0]) * .75, c.lat - site.center[1]) < .04; };
  const visible = () => map.getZoom() >= (options.minZoom ?? 13.2) && near();
  function update() { model.group.visible = visible(); info.hidden = !(model.group.visible && map.getZoom() >= Math.max(14, options.minZoom ?? 0)); }
  function mask() {
    if (!map.getLayer('building-3d')) return;
    if (visible()) for (const f of map.querySourceFeatures('openmaptiles', {sourceLayer: 'building'})) if (f.id !== undefined && outlines.some(o => isTerminalFeature(f, o))) masks.add(f.id);
    buildingMask.set(key, visible() ? [...masks] : []);
  }
  function queueMask(e) { if (e?.sourceId && e.sourceId !== 'openmaptiles') return; clearTimeout(maskTimer); maskTimer = setTimeout(mask, 60); }
  function focus() {
    const t = document.querySelector('#panel-toggle');
    if (t.getAttribute('aria-expanded') === 'true') t.click();
    map.easeTo({center: [site.center[0], site.center[1] - view.offset], zoom: view.zoom, pitch: 58, bearing: view.bearing, padding: {top: 80, bottom: 80, left: 35, right: 35}, duration: 1200});
    model.group.visible = true; info.hidden = false; map.triggerRepaint();
  }
  button.addEventListener('click', focus);
  map.on('sourcedata', queueMask); map.on('moveend', queueMask);
  return {focus, update, getState: () => ({visible: model.group.visible, maskedBuildingIds: [...masks], center: site.center, stats: model.stats}), dispose() {
    clearTimeout(maskTimer); map.off('sourcedata', queueMask); map.off('moveend', queueMask);
    button.removeEventListener('click', focus); buildingMask.set(key, []);
    root.remove(model.group); model.dispose();
  }};
}
