"""Extract Sabiha Gökçen terminal footprints from raw OSM (API /map extract).

OSM has footprints but no height tags here, so heights are explicit estimates
(flagged in the output). Usage:
  python3 scripts/build-saw.py saw.osm saw2.osm
"""
import json, sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
nodes, ways = {}, {}
for f in sys.argv[1:]:
    r = ET.parse(f).getroot()
    nodes.update({n.get('id'): (float(n.get('lon')), float(n.get('lat'))) for n in r.findall('node')})
    ways.update({w.get('id'): w for w in r.findall('way')})
ring = lambda wid: [nodes[n.get('ref')] for n in ways[wid].findall('nd')]
# id, kind, min, height (metres, ESTIMATED), roof
PIECES = [
    ('595327339', 'commercial', 0, 24, 'round'),   # main terminal
    ('75842803', 'commercial', 0, 14, 'round'),    # earlier terminal block (building:levels=2)
    ('75842809', 'commercial', 0, 8, 'flat'),      # VIP terminal
    ('1221054108', 'roof', 9, 11, 'flat'),         # forecourt roof (building=roof, layer 2)
]
parts = []
for wid, kind, lo, hi, roof in PIECES:
    r = ring(wid)
    parts.append({'id': int(wid), 'kind': kind, 'roof': roof, 'min': lo, 'height': hi, 'estimatedHeight': True,
                  'ring': [[round(x, 7), round(y, 7)] for x, y in (r[:-1] if r[0] == r[-1] else r)]})
main = parts[0]['ring']
xs, ys = zip(*[p for part in parts for p in part['ring']])
out = {
    'name': 'Sabiha Gökçen Havalimanı Terminali',
    'osmWay': 595327339,
    'center': [round((min(xs) + max(xs)) / 2, 7), round((min(ys) + max(ys)) / 2, 7)],
    'outline': main,
    'podiumHeight': 0,
    'parts': parts,
    'sources': [f'https://www.openstreetmap.org/way/{p[0]}' for p in PIECES],
    'attribution': '© OpenStreetMap contributors, ODbL 1.0',
    'modelDisclosure': 'Footprints from OSM; OSM has no height tags for these buildings, so heights are estimates.',
}
# Photo-informed detail in a frame aligned with the terminal's longest edge
# (metres, origin = center). Hall = span where the footprint is >100 m deep;
# pier = the narrow airside strip along the whole length.
import math
cx, cy = out['center']; C = math.cos(math.radians(cy))
P = lambda q: ((q[0] - cx) * 111320 * C, (q[1] - cy) * 111320)
pts = [P(q) for q in main]
a, b = max(((pts[i - 1], pts[i]) for i in range(len(pts))), key=lambda e: math.dist(*e))
ang = math.atan2(b[1] - a[1], b[0] - a[0])
ang = ang - math.pi if ang > math.pi / 2 else ang + math.pi if ang < -math.pi / 2 else ang
ca, sa = math.cos(-ang), math.sin(-ang)
R = [(x * ca - y * sa, x * sa + y * ca) for x, y in pts]
def depth(x):
    ys = []
    for i in range(len(R)):
        (x1, y1), (x2, y2) = R[i - 1], R[i]
        if (x1 <= x < x2) or (x2 <= x < x1):
            ys.append(y1 + (x - x1) / (x2 - x1) * (y2 - y1))
    return (min(ys), max(ys)) if ys else None
xs_ = [p[0] for p in R]; ymin = min(p[1] for p in R)
deep = [x for x in range(int(min(xs_)), int(max(xs_))) if (d := depth(x + .5)) and d[1] - d[0] > 100 and d[0] < ymin + 5]
runs, cur = [], [deep[0]]
for x in deep[1:]:
    if x == cur[-1] + 1: cur.append(x)
    else: runs.append(cur); cur = [x]
runs.append(cur); hall = max(runs, key=len)
hx0, hx1 = hall[0] + 2, hall[-1] - 2
hy1 = min(depth(x + .5)[1] for x in range(hx0, hx1, 5)) - 2
out['details'] = {
    'angle': round(ang, 6), 'estimated': True,
    'pier': {'x0': round(min(xs_), 1), 'x1': round(max(xs_), 1), 'y0': round(ymin, 1), 'y1': round(ymin + 24, 1), 'height': 13},
    'hall': {'x0': hx0, 'x1': hx1, 'y0': round(ymin + 24, 1), 'y1': round(hy1, 1), 'eave': 17, 'vaults': 6, 'rise': 9},
    'gates': {'count': 6, 'towerRadius': 5.5, 'towerHeight': 14, 'offset': 9},
}
part0 = out['parts'][0]; part0['height'] = 13; part0['roof'] = 'flat'
(ROOT / 'data/saw-terminal.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print(len(parts), 'parts', out['center'], out['details'])
