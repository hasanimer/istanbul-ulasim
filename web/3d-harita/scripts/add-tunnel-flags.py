"""Add per-edge tunnel flags to rail-network.json from the retained raw OSM evidence.

tunnel[i] == '1' when the OSM way containing coordinates[i] -> coordinates[i+1]
is tagged tunnel=* (not 'no') or location=underground. No geometry is changed.
"""
import json
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'data/rail-network.json'
P = lambda lon, lat: (round(float(lon), 7), round(float(lat), 7))
edge_tags = {}
for file in (root / 'data/osm-evidence').glob('*.osm'):
    doc = ET.parse(file).getroot()
    nodes = {n.attrib['id']: P(n.attrib['lon'], n.attrib['lat']) for n in doc.findall('node')}
    for way in doc.findall('way'):
        tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
        if tags.get('railway') not in {'rail', 'subway', 'light_rail', 'tram', 'funicular'}:
            continue
        refs = [n.attrib['ref'] for n in way.findall('nd')]
        for a, b in zip(refs, refs[1:]):
            if a in nodes and b in nodes:
                edge_tags[(nodes[a], nodes[b])] = tags
                edge_tags[(nodes[b], nodes[a])] = tags

def underground(tags):
    return tags.get('tunnel', 'no') != 'no' or tags.get('location') == 'underground'

data = json.loads(path.read_text())
summary = {}
for line in data['lines']:
    pts = [P(*p[:2]) for p in line['coordinates']]
    flags = ''.join('1' if underground(edge_tags[(a, b)]) else '0' for a, b in zip(pts, pts[1:]))
    line['tunnel'] = flags
    summary[line['id']] = round(flags.count('1') / len(flags), 3)
data['tunnelNote'] = 'tunnel: one character per coordinate pair; 1 = OSM tunnel=* or location=underground. Depth is not surveyed.'
path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
print(json.dumps({'tunnelShare': summary}, ensure_ascii=False))
