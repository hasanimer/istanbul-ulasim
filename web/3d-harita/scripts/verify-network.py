"""Check coverage, operating-status safeguards and OSM track-edge provenance."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
network = json.loads((root / 'data/rail-network.json').read_text())
lines = network['lines']
ids = [line['id'] for line in lines]
expected = {'M1A','M1B','M2','M2-spur','M3','M4','M5','M6','M7','M8','M9','M11','T1','T2','T3','T4','T5','T6','F1','F2','F3','F4','B1','B2'}
assert len(ids) == len(set(ids)), 'Duplicate IDs'
assert set(ids) == expected, {'missing': sorted(expected-set(ids)), 'extra':sorted(set(ids)-expected)}
by_id = {line['id']:line for line in lines}
assert by_id['B2'].get('status') == 'suspended', 'B2 must not be shown as an operating service'
assert 'Sultanbeyli' in by_id['M5']['name']
assert 'Halkalı' in by_id['M11']['name']

def point(lon,lat): return round(float(lon),7),round(float(lat),7)
edges = set()
files = list((root/'data/osm-evidence').glob('*.osm'))
assert files, 'Missing raw source evidence'
for file in files:
    doc = ET.parse(file).getroot()
    nodes = {n.attrib['id']:point(n.attrib['lon'],n.attrib['lat']) for n in doc.findall('node')}
    for way in doc.findall('way'):
        tags = {t.attrib['k']:t.attrib['v'] for t in way.findall('tag')}
        if tags.get('railway') not in {'rail','subway','light_rail','tram','funicular'}: continue
        refs = [n.attrib['ref'] for n in way.findall('nd')]
        for a,b in zip(refs,refs[1:]):
            if a in nodes and b in nodes:
                edges.add((nodes[a],nodes[b])); edges.add((nodes[b],nodes[a]))
checked = 0
for line in lines:
    pts = [point(*p[:2]) for p in line['coordinates']]
    assert len(pts)>=2, line['id']
    assert all(27.5<p[0]<30 and 40.5<p[1]<41.7 for p in pts), line['id']
    for a,b in zip(pts,pts[1:]):
        assert (a,b) in edges, f"{line['id']}: invented/disconnected segment {a} -> {b}"
        checked += 1
print(json.dumps({'result':'PASS','routeEntries':len(lines),'serviceCodesExcludingM2Branch':len(lines)-1,'suspendedServices':['B2'],'coordinatePairsVerifiedAgainstRawRailWays':checked,'sourceFiles':len(files)},ensure_ascii=False))
