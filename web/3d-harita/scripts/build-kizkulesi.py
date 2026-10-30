"""Extract Kız Kulesi (Maiden's Tower) 3D parts from raw OSM.

OSM API /map bbox 29.0030,41.0203,29.0052,41.0218. Buildings carry height /
min_height / roof:shape / roof:colour tags; the islet (coastline way 24792159)
becomes a low stone platform. Wall/roof colours are simple estimates.
Usage: python3 scripts/build-kizkulesi.py kk.osm
"""
import json, sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
r = ET.parse(sys.argv[1]).getroot()
N = {n.get('id'): (float(n.get('lon')), float(n.get('lat'))) for n in r.findall('node')}
W = {w.get('id'): w for w in r.findall('way')}
tags = lambda w: {t.get('k'): t.get('v') for t in w.findall('tag')}
def ring(wid):
    p = [N[n.get('ref')] for n in W[wid].findall('nd')]
    return [[round(x, 7), round(y, 7)] for x, y in (p[:-1] if p[0] == p[-1] else p)]
num = lambda v, d=0: float(str(v).split()[0]) if v else d

STONE, CREAM, RED, LEAD = '#c9c1b2', '#ece6da', '#b2412f', '#7d8790'
parts = [{'id': 24792159, 'kind': 'islet', 'roof': 'flat', 'min': 0, 'height': 1.6, 'wall': STONE, 'top': '#b9b2a4', 'ring': ring('24792159')}]
for wid in ['398303919', '398210642', '103821245', '398210643', '398303494', '398303495', '398219280']:
    t = tags(W[wid])
    lo, hi = num(t.get('min_height')), num(t.get('height'), 6)
    roof = t.get('roof:shape', 'flat')
    part = {'id': int(wid), 'kind': 'building', 'roof': roof, 'min': lo + 1.6, 'height': hi + 1.6,
            'wall': CREAM, 'top': RED if t.get('roof:colour') == 'red' else CREAM, 'ring': ring(wid)}
    if roof == 'dome':
        part.update(roofHeight=num(t.get('roof:height'), 3), top=LEAD)
    if roof == 'gabled':
        part['roofHeight'] = 3.5
    parts.append(part)
xs = [p[0] for p in parts[0]['ring']]; ys = [p[1] for p in parts[0]['ring']]
out = {
    'name': 'Kız Kulesi', 'center': [round(sum(xs) / len(xs), 7), round(sum(ys) / len(ys), 7)],
    'outline': parts[0]['ring'], 'podiumHeight': 0, 'colored': True, 'parts': parts,
    'sources': ['https://www.openstreetmap.org/way/398219280', 'https://www.openstreetmap.org/way/24792159'],
    'attribution': '© OpenStreetMap contributors, ODbL 1.0',
    'modelDisclosure': 'Footprints and heights from OSM building tags; colours and roof pitch are estimates.',
    'detailModel': {'title': "Madien's Towers - Kız Kulesi", 'author': 'Görkem Guloglu',
                    'page': 'https://sketchfab.com/3d-models/madiens-towers-kz-kulesi-b0a677076bf64945ac21aff54f95ab1c',
                    'embed': 'https://sketchfab.com/models/b0a677076bf64945ac21aff54f95ab1c/embed'},
}
(ROOT / 'data/kizkulesi-site.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(len(parts), out['center'], max(p['height'] for p in parts))
