"""Build data/service-info.json from İBB open data (snapshot; re-run to refresh).

- speeds: median commercial speed per line from İBB "Public Transport GTFS Data"
  (stop_times trip duration / shape distance; includes dwell time).
- facilities: per-station lift/escalator/WC/baby room from Metro İstanbul GetStations.
- statusSnapshot: Metro İstanbul GetServiceStatuses at build time (fallback only;
  the app fetches the live endpoint at runtime).
"""
import csv, collections, json, statistics, sys, unicodedata, urllib.request, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GTFS = Path(sys.argv[1]) if len(sys.argv) > 1 else None  # folder with gtfs-*.csv
API = 'https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2'
GTFS_URL = 'https://data.ibb.gov.tr/dataset/public-transport-gtfs-data'
# GTFS short names -> our line ids
ALIAS = {'Marmaray': 'B1', 'M2A': 'M2-spur'}

def norm(s):
    s = s.replace('İ', 'i').replace('I', 'ı').lower().replace('ı', 'i')
    s = unicodedata.normalize('NFD', s)
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in s if not unicodedata.combining(c)).split())

def get(path):
    with urllib.request.urlopen(f'{API}/{path}', timeout=30) as r:
        return json.load(r)['Data']

def speeds():
    rd = lambda f: csv.DictReader(open(GTFS / f'gtfs-{f}', encoding='cp1254', newline=''))
    rail = {r['route_id']: r['route_short_name'] for r in rd('routes.csv') if r['route_type'] in ('0', '1', '2', '7')}
    trips = {t['trip_id']: t['route_id'] for t in rd('trips.csv') if t['route_id'] in rail}
    sec = lambda s: sum(int(x) * m for x, m in zip(s.split(':'), (3600, 60, 1)))
    rows = collections.defaultdict(list)
    for r in rd('stop_times.csv'):
        if r['trip_id'] in trips:
            rows[r['trip_id']].append(r)
    out = collections.defaultdict(list)
    for tid, rs in rows.items():
        rs.sort(key=lambda r: int(r['stop_sequence']))
        t = sec(rs[-1]['arrival_time']) - sec(rs[0]['departure_time'])
        d = float(rs[-1]['shape_dist_traveled'] or 0) - float(rs[0]['shape_dist_traveled'] or 0)
        if t > 0 and d > 0.3:
            out[rail[trips[tid]]].append(d / (t / 3600))
    res = {}
    for name, v in out.items():
        lid = ALIAS.get(name, name)
        if lid in {'Marmaray1', 'Marmaray2', 'M3A'}:
            continue
        res[lid] = round(statistics.median(v), 1)
    return res

def facilities(lines):
    ours = {(l['id'], norm(s['name'])): s['name'] for l in lines for s in l.get('stations', [])}
    res = {}
    for st in get('GetStations'):
        line = st['LineName']
        info = st.get('DetailInfo') or {}
        candidates = [line, line + 'A', line + 'B'] if line == 'M1' else [line]
        for lid in candidates:
            key = (lid, norm(st.get('Description') or st['Name']))
            if key in ours:
                res[f'{lid}|{ours[key]}'] = {'lift': info.get('Lift'), 'escalator': info.get('Escolator'),
                                            'wc': info.get('WC'), 'babyRoom': info.get('BabyRoom'), 'masjid': info.get('Masjid')}
    return res

data = json.loads((ROOT / 'data/rail-network.json').read_text())
prev = json.loads((ROOT / 'data/service-info.json').read_text()) if (ROOT / 'data/service-info.json').exists() else {}
info = {
    'builtAt': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3))).isoformat(timespec='seconds'),
    'speeds': speeds() if GTFS else prev.get('speeds', {}),
    'speedSource': {'name': 'İBB Açık Veri · Public Transport GTFS Data (Mart 2025)', 'url': GTFS_URL,
                    'method': 'Sefer süresi / güzergâh mesafesi medyanı (durak bekleme dahil).'},
    'defaultSpeeds': {'metro': 38, 'tram': 16, 'funicular': 16, 'suburban': 41},
    'transferMinutes': 5,
    'facilities': facilities(data['lines']),
    'facilitySource': {'name': 'Metro İstanbul GetStations', 'url': f'{API}/GetStations'},
    'statusEndpoint': f'{API}/GetServiceStatuses',
    'statusSnapshot': [{'line': s['LineName'], 'text': s['Description'].strip(), 'updated': s['UpdateDate']}
                       for s in get('GetServiceStatuses') if s.get('IsActive')],
    'license': 'İBB Açık Veri Lisansı',
}
(ROOT / 'data/service-info.json').write_text(json.dumps(info, ensure_ascii=False, indent=1))
print(json.dumps({'speeds': info['speeds'], 'facilities': len(info['facilities']), 'status': info['statusSnapshot']}, ensure_ascii=False)[:1500])
