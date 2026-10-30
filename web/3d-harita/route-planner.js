// Fewest-transfer station-to-station planner over the mapped rail network.
// Stops are ordered by their projection onto the real line geometry; leg geometry
// is a slice of that same geometry. Walking links between differently named,
// distant stations are deliberately not invented.
const M = 111320, COS = Math.cos(41.05 * Math.PI / 180);
const xy = p => [p[0] * M * COS, p[1] * M];
const lonlat = q => [q[0] / (M * COS), q[1] / M];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const normalizeName = s => String(s).toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim();

function project(path, p) {
  let best = {d: Infinity, s: 0};
  for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1], b = path.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    const d = dist(p, [a[0] + t * dx, a[1] + t * dy]);
    if (d < best.d) best = {d, s: path.cum[i - 1] + t * Math.sqrt(len2)};
  }
  return best;
}
function makePath(coords) {
  const pts = coords.map(xy), cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return {pts, cum};
}

export function buildRouteGraph(lines) {
  const lineStops = {}, paths = {}, lineMeta = {}, stops = [];
  for (const line of lines) {
    if (line.status === 'suspended') continue;
    const coords = line.segments?.[0] ?? line.coordinates;
    if (!coords || coords.length < 2) continue;
    const path = makePath(coords);
    const list = [];
    for (const st of line.stations || []) {
      const p = xy(st.coordinates), {d, s} = project(path, p);
      if (d > 200) continue; // a stop that is not on this geometry is not routable
      if (list.some(o => normalizeName(o.name) === normalizeName(st.name))) continue;
      list.push({name: st.name, coordinates: st.coordinates, s, p, lineId: line.id});
    }
    list.sort((a, b) => a.s - b.s);
    list.forEach((st, i) => { st.index = i; stops.push(st); });
    if (list.length >= 2) { lineStops[line.id] = list; paths[line.id] = path; lineMeta[line.id] = line; }
  }
  // Union stops into transfer places: same name nearby, or practically co-located.
  const parent = stops.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < stops.length; i++) for (let j = i + 1; j < stops.length; j++) {
    const d = dist(stops[i].p, stops[j].p), a = normalizeName(stops[i].name), b = normalizeName(stops[j].name);
    const related = a === b || a.startsWith(b + ' ') || b.startsWith(a + ' ');
    if ((related && d < 600) || d < 150) parent[find(i)] = find(j);
  }
  const groups = new Map();
  stops.forEach((st, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(st); });
  const places = [...groups.values()].map((members, id) => {
    const name = members.map(m => m.name).sort((a, b) => a.length - b.length)[0];
    members.forEach(m => { m.place = id; });
    return {id, name, members, lines: [...new Set(members.map(m => m.lineId))], coordinates: members[0].coordinates};
  });
  return {lineStops, paths, lineMeta, places};
}
export const stationPlaces = g => g.places;

export function findPlace(g, query) {
  const q = normalizeName(query);
  if (!q) return null;
  const all = g.places.flatMap(p => p.members.map(m => [p, normalizeName(m.name)]));
  return (all.find(([, n]) => n === q) || all.find(([, n]) => n.startsWith(q)) || all.find(([, n]) => n.includes(q)))?.[0] || null;
}

export function planRoute(g, fromQuery, toQuery) {
  const from = findPlace(g, fromQuery), to = findPlace(g, toQuery);
  if (!from) throw new Error(`Durak bulunamadı: ${fromQuery}`);
  if (!to) throw new Error(`Durak bulunamadı: ${toQuery}`);
  if (from.id === to.id) return {from: from.name, to: to.name, legs: [], transfers: 0, stops: 0};
  const key = st => `${st.lineId}#${st.index}`, cost = new Map(), prev = new Map(), queue = [];
  const push = (st, c, p) => { const k = key(st); if (c < (cost.get(k) ?? Infinity)) { cost.set(k, c); prev.set(k, p); queue.push([c, st]); } };
  for (const st of from.members) push(st, 0, null);
  let goal = null;
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [c, st] = queue.shift();
    if (c > cost.get(key(st))) continue;
    if (st.place === to.id) { goal = st; break; }
    const list = g.lineStops[st.lineId];
    for (const n of [list[st.index - 1], list[st.index + 1]]) if (n) push(n, c + 1, st);
    for (const other of g.places[st.place].members) if (other.lineId !== st.lineId) push(other, c + 10000, st);
  }
  if (!goal) return null;
  const chain = [];
  for (let st = goal; st; st = prev.get(key(st))) chain.unshift(st);
  const legs = [];
  for (const st of chain) {
    const leg = legs.at(-1);
    if (leg && leg.lineId === st.lineId) { leg.toStop = st; leg.to = st.name; leg.stops = Math.abs(st.index - leg.fromStop.index); }
    else legs.push({lineId: st.lineId, fromStop: st, toStop: st, from: st.name, to: st.name, stops: 0});
  }
  const ride = legs.filter(l => l.stops > 0);
  return {from: from.name, to: to.name, legs: ride, transfers: Math.max(0, ride.length - 1), stops: ride.reduce((n, l) => n + l.stops, 0)};
}

export function routeGeometry(g, leg) {
  const path = g.paths[leg.lineId], a = leg.fromStop.s, b = leg.toStop.s, lo = Math.min(a, b), hi = Math.max(a, b);
  const at = s => { let i = path.cum.findIndex(c => c >= s); if (i <= 0) i = 1; const t = (s - path.cum[i - 1]) / ((path.cum[i] - path.cum[i - 1]) || 1);
    const p = path.pts[i - 1], q = path.pts[i]; return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
  const original = (g.lineMeta[leg.lineId].segments?.[0] ?? g.lineMeta[leg.lineId].coordinates);
  const out = [lonlat(at(lo))];
  path.cum.forEach((c, i) => { if (c > lo && c < hi) out.push(original[i].slice(0, 2)); });
  out.push(lonlat(at(hi)));
  return a <= b ? out : out.reverse();
}
