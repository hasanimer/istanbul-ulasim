"""Extract Şükrü Saracoğlu (Chobani Stadyumu) geometry from raw OSM.

OSM: multipolygon relation 1735806 (outer way 66321024, inner way 178240485 =
roof opening) and pitch way 128542335. Usage: python3 scripts/build-saracoglu.py fb.osm
"""
import json, math, sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
r = ET.parse(sys.argv[1]).getroot()
N = {n.get('id'): (float(n.get('lon')), float(n.get('lat'))) for n in r.findall('node')}
W = {w.get('id'): w for w in r.findall('way')}
ring = lambda wid: (lambda p: p[:-1] if p[0] == p[-1] else p)([N[n.get('ref')] for n in W[wid].findall('nd')])
outer, inner, pitch = ring('66321024'), ring('178240485'), ring('128542335')
cx = sum(p[0] for p in pitch) / len(pitch); cy = sum(p[1] for p in pitch) / len(pitch)
C = math.cos(math.radians(cy))
m = lambda p: ((p[0] - cx) * 111320 * C, (p[1] - cy) * 111320)
pts = [m(p) for p in pitch]
edges = [(pts[i - 1], pts[i]) for i in range(len(pts))]
a, b = max(edges, key=lambda e: math.dist(*e))
angle = math.atan2(b[1] - a[1], b[0] - a[0])
if angle > math.pi / 2: angle -= math.pi
if angle < -math.pi / 2: angle += math.pi
ca, sa = math.cos(-angle), math.sin(-angle)
rot = lambda q: (q[0] * ca - q[1] * sa, q[0] * sa + q[1] * ca)
ext = lambda ps: [round(max(abs(rot(m(p))[k]) for p in ps), 1) for k in (0, 1)]
out = {
    'name': 'Şükrü Saracoğlu Stadyumu', 'osmName': 'Chobani Stadyumu',
    'center': [round(cx, 7), round(cy, 7)], 'rotationRadians': round(angle, 6),
    'outline': [[round(x, 7), round(y, 7)] for x, y in outer],
    'roofOpening': [[round(x, 7), round(y, 7)] for x, y in inner],
    'mappedPitch': [[round(x, 7), round(y, 7)] for x, y in pitch],
    'halfExtents': {'pitchArea': ext(pitch), 'roofOpening': ext(inner), 'outline': ext(outer)},
    'heightMeters': 36, 'heightIsEstimate': True,
    'sources': ['https://www.openstreetmap.org/relation/1735806', 'https://www.openstreetmap.org/way/128542335'],
    'attribution': '© OpenStreetMap contributors, ODbL 1.0',
    'modelDisclosure': 'Outline, roof opening and pitch from OSM; stands, roof structure and height are procedural estimates.',
}
(ROOT / 'data/saracoglu-site.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(out['center'], round(math.degrees(angle), 2), out['halfExtents'])
