"""İBB resmî raylı sistem istasyon/hat verisi (GeoJSON'dan türetilmiş).

İBB Açık Veri'nin "Raylı Sistem İstasyon Noktaları" ve "Raylı Sistem Hatları"
veri setlerinden (GeoJSON) türetilen sade JSON'ları yükler. Gömülü GTFS ağından
farklı olarak bu **resmî bir referanstır**: gerçek koordinatlar, tüm türler
(metro/tramvay/banliyö/füniküler/teleferik) ve **yapım durumu** (mevcut/inşaat)
içerir. Sıra (durak dizisi) içermediğinden rota motoru için değil, istasyon/hat
sorgulama için kullanılır.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .gtfs import fold

DATA_DIR = Path(__file__).parent / "data"
STATIONS_FILE = DATA_DIR / "rayli_istasyonlar.json"
LINES_FILE = DATA_DIR / "rayli_hatlar.json"


@dataclass
class RailStation:
    name: str
    line: str
    type: str
    stage: str
    lat: float | None
    lon: float | None

    @property
    def under_construction(self) -> bool:
        return "insaat" in fold(self.stage or "")


@dataclass
class RailLine:
    name: str
    short_name: str
    type: str
    length_km: float | None
    capacity: int | None
    stage: str


def _match_stage(query: str, stage: str) -> bool:
    q = fold(query)
    if q in ("mevcut", "acik", "aktif"):
        return "mevcut" in fold(stage)
    if q in ("insaat", "yapim", "yapilan"):
        return "insaat" in fold(stage)
    return q in fold(stage)


class RailData:
    def __init__(self, stations: list[RailStation], lines: list[RailLine]) -> None:
        self.stations = stations
        self.lines = lines

    @classmethod
    def load(cls) -> "RailData":
        sraw = json.loads(STATIONS_FILE.read_text(encoding="utf-8"))
        lraw = json.loads(LINES_FILE.read_text(encoding="utf-8"))
        stations = [RailStation(d.get("ad"), d.get("hat"), d.get("tur"),
                                d.get("asama"), d.get("enlem"), d.get("boylam"))
                    for d in sraw]
        lines = [RailLine(d.get("ad"), d.get("kisa_ad"), d.get("tur"),
                          d.get("uzunluk_km"), d.get("kapasite"), d.get("asama"))
                 for d in lraw]
        return cls(stations, lines)

    def search_stations(self, ad: str = "", hat: str = "", tur: str = "",
                        asama: str = "") -> list[RailStation]:
        ad_q, hat_q, tur_q = fold(ad), fold(hat), fold(tur)
        out = []
        for s in self.stations:
            if ad_q and ad_q not in fold(s.name or ""):
                continue
            if hat_q and hat_q not in fold(s.line or ""):
                continue
            if tur_q and tur_q not in fold(s.type or ""):
                continue
            if asama and not _match_stage(asama, s.stage or ""):
                continue
            out.append(s)
        return out

    def search_lines(self, tur: str = "") -> list[RailLine]:
        tur_q = fold(tur)
        out = [ln for ln in self.lines if not tur_q or tur_q in fold(ln.type or "")]
        return sorted(out, key=lambda ln: (ln.type or "", ln.short_name or ln.name or ""))

    def summary(self) -> dict:
        by_type: dict[str, int] = {}
        by_stage: dict[str, int] = {}
        for s in self.stations:
            by_type[s.type] = by_type.get(s.type, 0) + 1
            by_stage[s.stage] = by_stage.get(s.stage, 0) + 1
        return {"istasyon": len(self.stations), "hat": len(self.lines),
                "tur": by_type, "asama": by_stage}
