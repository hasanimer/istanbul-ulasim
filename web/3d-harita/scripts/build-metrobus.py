"""Build data/metrobus.json from İBB open data (İETT).

Geometry: İETT Hat Güzergahları GeoJSON, route variant 34G_G_D0 (Beylikdüzü
Sondurak -> Söğütlüçeşme, the full Metrobüs corridor).
Stations + running time: İETT GTFS (stops.csv / stop_times), route 34G.
Usage: python3 scripts/build-metrobus.py <folder with 34g-line.json and 34g-stops.json>
(those two are extracted from the raw downloads; see README).
"""
import json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = Path(sys.argv[1])
line = json.loads((src / '34g-line.json').read_text())
stops = json.loads((src / '34g-stops.json').read_text())

FULL = {'B.SONDURAK': 'Beylikdüzü Sondurak', 'B.BELEDİYE': 'Beylikdüzü Belediye', 'H.SANAYİ': 'Haramidere Sanayi',
        'AVCILAR MRK.ÜNV.KMP.': 'Avcılar Merkez Üniversite Kampüsü', 'CİHANGİR - ÜNİV.MAH.': 'Cihangir - Üniversite Mahallesi',
        'İBB SOSYAL TESİSLERİ': 'İBB Sosyal Tesisleri', 'TOPKAPI - ŞEHİT MUSTAFA CAMBAZ': 'Topkapı - Şehit Mustafa Cambaz'}
SMALL = {'ve'}
def title(s):
    s = ' '.join(s.split())
    if s in FULL:
        return FULL[s]
    words = []
    for w in s.split(' '):
        lw = w.replace('I', 'ı').replace('İ', 'i').lower()
        words.append(lw if lw in SMALL else (lw[:1].replace('i', 'İ').replace('ı', 'I').upper() + lw[1:]))
    return ' '.join(words)

def sec(t):
    h, m, s = map(int, t.split(':')); return h * 3600 + m * 60 + s

C = math.cos(math.radians(41.0))
coords = [[round(p[0], 7), round(p[1], 7)] for p in line['coords']]
length = sum(math.hypot((b[0] - a[0]) * 111320 * C, (b[1] - a[1]) * 111320) for a, b in zip(coords, coords[1:]))
minutes = (sec(stops[-1][3]) - sec(stops[0][3])) / 60
data = {
    'lines': [{
        'id': '34', 'name': 'Metrobüs: Beylikdüzü – Söğütlüçeşme', 'type': 'metrobus', 'color': '#c2185b',
        'coordinates': coords, 'tunnel': '0' * (len(coords) - 1),
        'stations': [{'name': title(s[0]), 'coordinates': [round(s[1], 7), round(s[2], 7)]} for s in stops],
        'summary': f'Otobüs hızlı transit (BRT); raylı sistem değildir. {len(stops)} istasyon, yaklaşık {length/1000:.1f} km; tarifeye göre uçtan uca ~{round(minutes)} dk.',
        'source': 'https://data.ibb.gov.tr/dataset/iett-hat-guzergahlari',
    }],
    'speedKmh': round(length / 1000 / (minutes / 60), 1),
    'sources': [
        {'name': 'İETT Hat Güzergahları Verisi (34G_G_D0)', 'url': 'https://data.ibb.gov.tr/dataset/iett-hat-guzergahlari'},
        {'name': 'İETT GTFS Verisi (34G durak sırası ve süre)', 'url': 'https://data.ibb.gov.tr/dataset/iett-gtfs-verisi'},
    ],
    'license': 'İBB Açık Veri Lisansı',
}
(ROOT / 'data/metrobus.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
print(len(coords), 'points', round(length / 1000, 2), 'km', round(minutes), 'min', data['speedKmh'], 'km/h')
print([s['name'] for s in data['lines'][0]['stations']])
