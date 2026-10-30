"""Extract İstanbul Havalimanı terminal 3D building parts from raw OSM.

Input: OSM API /map extract (bbox 28.715,41.250,28.765,41.272) saved as area.osm.
Output: data/airport-terminal.json with the terminal outline (way 687768729) and
every building:part whose centroid lies inside it, keeping OSM height/min_height
and roof:shape. Missing heights are derived from building:levels (4.5 m/level).
"""
import json, math, sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
osm = ET.parse(sys.argv[1]).getroot()
nodes = {n.get('id'): (float(n.get('lon')), float(n.get('lat'))) for n in osm.findall('node')}
ways = {w.get('id'): w for w in osm.findall('way')}
tags = lambda el: {t.get('k'): t.get('v') for t in el.findall('tag')}
ring = lambda w: [nodes[n.get('ref')] for n in w.findall('nd') if n.get('ref') in nodes]

TERMINAL = '687768729'
outline = ring(ways[TERMINAL])

def inside(poly, p):
    c = False
    for i in range(len(poly)):
        a, b = poly[i], poly[i - 1]
        if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]:
            c = not c
    return c

def centroid(r):
    xs, ys = zip(*r[:-1] if r[0] == r[-1] else r)
    return sum(xs) / len(xs), sum(ys) / len(ys)

def num(v):
    try:
        return float(str(v).replace(',', '.').split()[0])
    except (TypeError, ValueError, IndexError):
        return None

parts = []
for wid, w in ways.items():
    t = tags(w)
    if not t.get('building:part') or t.get('building:part') == 'no':
        continue
    r = ring(w)
    if len(r) < 4 or r[0] != r[-1] or not inside(outline, centroid(r)):
        continue
    levels = num(t.get('building:levels'))
    height = num(t.get('height')) or (levels * 4.5 if levels else 9)
    minh = num(t.get('min_height')) or 0
    if height <= minh:
        continue
    kind = t.get('building:part')
    parts.append({'id': int(wid), 'kind': kind, 'roof': t.get('roof:shape', 'flat'), 'min': minh, 'height': height,
                  'ring': [[round(x, 7), round(y, 7)] for x, y in r[:-1]]})

cx, cy = centroid(outline + [outline[0]])
out = {
    'name': 'İstanbul Havalimanı Terminal Binası',
    'osmWay': int(TERMINAL),
    'center': [round(cx, 7), round(cy, 7)],
    'outline': [[round(x, 7), round(y, 7)] for x, y in outline[:-1]],
    'parts': sorted(parts, key=lambda p: p['id']),
    'sources': [f'https://www.openstreetmap.org/way/{TERMINAL}'],
    'attribution': '© OpenStreetMap contributors, ODbL 1.0',
    'modelDisclosure': 'Footprints and heights from OSM 3D building parts; facades, glazing and roof detail are simplified.',
}
(ROOT / 'data/airport-terminal.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
from collections import Counter
print(len(parts), 'parts', Counter((p['kind'], p['roof']) for p in parts).most_common(12))
print('height range', min(p['height'] for p in parts), max(p['height'] for p in parts), 'center', out['center'])
