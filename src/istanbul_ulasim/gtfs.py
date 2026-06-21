"""GTFS yükleyici ve sorgu modeli.

Bir GTFS feed'ini (dizin, .zip dosyası veya http(s) URL) okuyarak duraklar,
hatlar, sefer desenleri ve çizelge üzerinde arama yapılabilecek bir bellek-içi
model kurar. Ağır bağımlılık kullanılmaz; yalnızca standart kütüphane.
"""
from __future__ import annotations

import csv
import io
import tempfile
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_DATA_DIR = Path(__file__).parent / "data" / "sample"

# GTFS route_type -> okunabilir tür adı
ROUTE_TYPE_NAMES = {
    0: "Tramvay",
    1: "Metro",
    2: "Tren (Marmaray/banliyö)",
    3: "Otobüs",
    4: "Vapur",
    5: "Teleferik",
    6: "Telesiyej",
    7: "Füniküler",
    11: "Troleybüs",
    12: "Monoray",
}


def fold(s: str) -> str:
    """Türkçe duyarlı, aksanları sadeleştiren küçük harf dönüşümü.

    Arama eşleştirmesinde kullanılır; 'uskudar' -> 'Üsküdar' eşleşir.
    """
    s = s.replace("İ", "i").replace("I", "ı").lower()
    return s.translate(str.maketrans("ıçğöşü", "icgosu"))


def parse_gtfs_time(value: str) -> int | None:
    """'HH:MM:SS' (>= 24:00:00 olabilir) -> gün başından saniye."""
    value = (value or "").strip()
    if not value:
        return None
    parts = value.split(":")
    if len(parts) != 3:
        return None
    try:
        h, m, s = (int(p) for p in parts)
    except ValueError:
        return None
    return h * 3600 + m * 60 + s


def seconds_to_hhmm(sec: int) -> str:
    sec %= 24 * 3600
    h, rem = divmod(sec, 3600)
    return f"{h:02d}:{rem // 60:02d}"


@dataclass
class Stop:
    stop_id: str
    name: str
    lat: float | None
    lon: float | None
    route_ids: set[str] = field(default_factory=set)


@dataclass
class Route:
    route_id: str
    short_name: str
    long_name: str
    route_type: int
    color: str

    @property
    def type_name(self) -> str:
        return ROUTE_TYPE_NAMES.get(self.route_type, "Diğer")

    @property
    def display_name(self) -> str:
        if self.short_name and self.long_name:
            return f"{self.short_name} — {self.long_name}"
        return self.short_name or self.long_name or self.route_id


@dataclass
class Pattern:
    """Bir hattın bir yöndeki temsilî durak dizisi ve kümülatif süreleri."""
    route_id: str
    direction_id: int
    stop_ids: list[str]
    cum_minutes: list[float]  # ilk duraktan itibaren dakika


@dataclass
class Departure:
    seconds: int
    route_id: str
    direction_id: int
    headsign: str


class GTFSError(Exception):
    pass


def _read_table(source: "_Source", name: str) -> list[dict[str, str]]:
    raw = source.read(name)
    if raw is None:
        return []
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return [{(k or "").strip(): (v or "").strip() for k, v in row.items()}
            for row in reader]


class _Source:
    """Dizin ya da zip'ten GTFS tablolarını okuyan basit soyutlama."""

    def __init__(self, path: Path):
        self._dir: Path | None = None
        self._zip: zipfile.ZipFile | None = None
        if path.is_dir():
            self._dir = path
        elif zipfile.is_zipfile(path):
            self._zip = zipfile.ZipFile(path)
        else:
            raise GTFSError(f"GTFS kaynağı dizin ya da .zip olmalı: {path}")

    def read(self, name: str) -> bytes | None:
        if self._dir is not None:
            p = self._dir / name
            return p.read_bytes() if p.exists() else None
        assert self._zip is not None
        try:
            return self._zip.read(name)
        except KeyError:
            return None


class Feed:
    def __init__(self) -> None:
        self.source_label: str = ""
        self.stops: dict[str, Stop] = {}
        self.routes: dict[str, Route] = {}
        self.patterns: list[Pattern] = []
        # stop_id -> [(pattern_index, position)]
        self.stop_to_patterns: dict[str, list[tuple[int, int]]] = {}
        # stop_id -> sıralı kalkış listesi (çizelgeden)
        self.departures: dict[str, list[Departure]] = {}

    # ---- yükleme ----------------------------------------------------------
    @classmethod
    def load(cls, source: str | Path | None = None) -> "Feed":
        if source is None:
            source = DEFAULT_DATA_DIR
        label = str(source)

        if isinstance(source, str) and source.lower().startswith(("http://", "https://")):
            tmp = Path(tempfile.gettempdir()) / "istanbul_gtfs_download.zip"
            urllib.request.urlretrieve(source, tmp)  # noqa: S310 (kullanıcı verir)
            src = _Source(tmp)
        else:
            src = _Source(Path(source))

        feed = cls()
        feed.source_label = label
        feed._build(src)
        return feed

    def _build(self, src: _Source) -> None:
        # routes
        for row in _read_table(src, "routes.txt"):
            rid = row.get("route_id", "")
            if not rid:
                continue
            try:
                rtype = int(row.get("route_type") or 3)
            except ValueError:
                rtype = 3
            self.routes[rid] = Route(
                route_id=rid,
                short_name=row.get("route_short_name", ""),
                long_name=row.get("route_long_name", ""),
                route_type=rtype,
                color=row.get("route_color", "") or "",
            )

        # stops
        for row in _read_table(src, "stops.txt"):
            sid = row.get("stop_id", "")
            if not sid:
                continue
            self.stops[sid] = Stop(
                stop_id=sid,
                name=row.get("stop_name", "") or sid,
                lat=_to_float(row.get("stop_lat")),
                lon=_to_float(row.get("stop_lon")),
            )

        # trips: trip_id -> (route_id, direction_id, headsign)
        trips: dict[str, tuple[str, int, str]] = {}
        for row in _read_table(src, "trips.txt"):
            tid = row.get("trip_id", "")
            if not tid:
                continue
            try:
                direction = int(row.get("direction_id") or 0)
            except ValueError:
                direction = 0
            trips[tid] = (row.get("route_id", ""), direction,
                          row.get("trip_headsign", ""))

        # stop_times: sefere göre sıralı durak listesi kur
        per_trip: dict[str, list[tuple[int, str, int | None]]] = {}
        for row in _read_table(src, "stop_times.txt"):
            tid = row.get("trip_id", "")
            if tid not in trips:
                continue
            try:
                seq = int(row.get("stop_sequence") or 0)
            except ValueError:
                continue
            dep = parse_gtfs_time(row.get("departure_time") or row.get("arrival_time", ""))
            per_trip.setdefault(tid, []).append((seq, row.get("stop_id", ""), dep))

        for stops_list in per_trip.values():
            stops_list.sort(key=lambda x: x[0])

        self._build_patterns(trips, per_trip)
        self._build_departures(trips, per_trip)

    def _build_patterns(self, trips, per_trip) -> None:
        # (route_id, direction) için en çok duraklı seferi temsilci say
        best: dict[tuple[str, int], list[tuple[int, str, int | None]]] = {}
        for tid, stops_list in per_trip.items():
            route_id, direction, _ = trips[tid]
            key = (route_id, direction)
            if key not in best or len(stops_list) > len(best[key]):
                best[key] = stops_list

        for (route_id, direction), stops_list in sorted(best.items()):
            stop_ids = [s for _, s, _ in stops_list]
            base = stops_list[0][2]
            cum: list[float] = []
            for _, _, dep in stops_list:
                if dep is not None and base is not None:
                    cum.append((dep - base) / 60.0)
                else:
                    cum.append(float(len(cum)))  # süre yoksa durak sayısını kullan
            idx = len(self.patterns)
            self.patterns.append(Pattern(route_id, direction, stop_ids, cum))
            for pos, sid in enumerate(stop_ids):
                self.stop_to_patterns.setdefault(sid, []).append((idx, pos))
                if sid in self.stops:
                    self.stops[sid].route_ids.add(route_id)

    def _build_departures(self, trips, per_trip) -> None:
        for tid, stops_list in per_trip.items():
            route_id, direction, headsign = trips[tid]
            last = len(stops_list) - 1
            for i, (_, sid, dep) in enumerate(stops_list):
                if i == last:
                    continue  # son durakta biniş olmaz
                if dep is None:
                    continue
                self.departures.setdefault(sid, []).append(
                    Departure(dep, route_id, direction, headsign))
        for deps in self.departures.values():
            deps.sort(key=lambda d: d.seconds)

    # ---- sorgular ---------------------------------------------------------
    def search_routes(self, query: str) -> list[Route]:
        q = fold(query)
        out = [r for r in self.routes.values()
               if q == fold(r.route_id) or q in fold(r.short_name)
               or q in fold(r.long_name) or q in fold(r.type_name)]
        return sorted(out, key=lambda r: (r.route_type, r.short_name or r.route_id))

    def search_stops(self, query: str) -> list[Stop]:
        q = fold(query)
        exact = [s for s in self.stops.values() if fold(s.name) == q or s.stop_id == query]
        if exact:
            return sorted(exact, key=lambda s: s.name)
        out = [s for s in self.stops.values() if q in fold(s.name) or q in fold(s.stop_id)]
        return sorted(out, key=lambda s: s.name)

    def resolve_route(self, query: str) -> Route | None:
        if query in self.routes:
            return self.routes[query]
        matches = self.search_routes(query)
        return matches[0] if matches else None

    def resolve_stop(self, query: str) -> Stop | None:
        if query in self.stops:
            return self.stops[query]
        matches = self.search_stops(query)
        return matches[0] if len(matches) >= 1 else None

    def routes_for_stop(self, stop_id: str) -> list[Route]:
        return sorted(
            (self.routes[r] for r in self.stops[stop_id].route_ids if r in self.routes),
            key=lambda r: (r.route_type, r.short_name or r.route_id),
        )

    def pattern(self, route_id: str, direction_id: int) -> Pattern | None:
        for p in self.patterns:
            if p.route_id == route_id and p.direction_id == direction_id:
                return p
        return None

    def upcoming_departures(self, stop_id: str, after_seconds: int,
                            limit: int = 10) -> list[Departure]:
        deps = self.departures.get(stop_id, [])
        out = [d for d in deps if d.seconds >= after_seconds]
        return out[:limit]


def _to_float(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None
