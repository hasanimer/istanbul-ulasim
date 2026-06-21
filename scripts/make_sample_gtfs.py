#!/usr/bin/env python3
"""Gömülü örnek İstanbul GTFS verisini üretir.

Bu betik, gerçek İstanbul ağından küçük ama temsilî bir alt küme oluşturur:
birkaç gerçek hat (M2, M1B, Marmaray, Metrobüs, T1) ve gerçek durak/aktarma
noktaları. Amaç, MCP sunucusunu canlı API'ye ihtiyaç duymadan offline test
edilebilir kılmaktır. Çalışma anında gerçek İBB GTFS feed'i kullanılacaksa
ISTANBUL_GTFS_PATH ortam değişkeni ile asıl feed'e yönlendirilebilir.

Üretilen dosyalar src/istanbul_ulasim/data/sample/ altına yazılır ve depoya
işlenir; bu betiği yeniden çalıştırmak veriyi birebir yeniden üretir.

NOT: Bu örnek veri yalnızca gösterim/test amaçlıdır. Durak koordinatları ve
sefer saatleri yaklaşıktır; gerçek planlama için resmî GTFS feed'i kullanın.
"""
from __future__ import annotations

import csv
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "src" / "istanbul_ulasim" / "data" / "sample"

# stop_id -> (ad, enlem, boylam). Aktarma noktaları birden çok hatta aynı id ile
# geçer; böylece rota motoru bu duraklarda hat değiştirebilir.
STOPS: dict[str, tuple[str, float, float]] = {
    # M2
    "ynk": ("Yenikapı", 41.0058, 28.9500),
    "sshane": ("Şişhane", 41.0275, 28.9740),
    "taksim": ("Taksim", 41.0369, 28.9850),
    "osmanbey": ("Osmanbey", 41.0480, 28.9870),
    "sismec": ("Şişli-Mecidiyeköy", 41.0637, 28.9920),
    "gayrettepe": ("Gayrettepe", 41.0680, 29.0070),
    "levent": ("Levent", 41.0820, 29.0090),
    "haciosman": ("Hacıosman", 41.1080, 29.0350),
    # M1B
    "aksaray": ("Aksaray", 41.0110, 28.9540),
    "emniyet": ("Emniyet-Fatih", 41.0190, 28.9390),
    "otogar": ("Otogar", 41.0405, 28.8960),
    "kirazli": ("Kirazlı", 41.0290, 28.8390),
    # Marmaray
    "halkali": ("Halkalı", 41.0290, 28.7780),
    "sirkeci": ("Sirkeci", 41.0150, 28.9770),
    "uskudar": ("Üsküdar", 41.0255, 29.0150),
    "ayrilik": ("Ayrılık Çeşmesi", 40.9990, 29.0280),
    "sogutlucesme": ("Söğütlüçeşme", 40.9890, 29.0360),
    "bostanci": ("Bostancı", 40.9540, 29.0950),
    "pendik": ("Pendik", 40.8770, 29.2330),
    "gebze": ("Gebze", 40.7920, 29.3920),
    # Metrobüs
    "beylikduzu": ("Beylikdüzü", 41.0030, 28.6400),
    "avcilar": ("Avcılar", 40.9800, 28.7180),
    "cevizlibag": ("Cevizlibağ", 41.0150, 28.9120),
    "zincirlikuyu": ("Zincirlikuyu", 41.0670, 29.0090),
    "mecidiyekoy": ("Mecidiyeköy", 41.0660, 28.9970),
    # T1
    "kabatas": ("Kabataş", 41.0330, 28.9890),
    "karakoy": ("Karaköy", 41.0240, 28.9740),
    "eminonu": ("Eminönü", 41.0170, 28.9710),
    "sultanahmet": ("Sultanahmet", 41.0055, 28.9770),
    "beyazit": ("Beyazıt", 41.0100, 28.9640),
    "zeytinburnu": ("Zeytinburnu", 41.0050, 28.9020),
    "bagcilar": ("Bağcılar", 41.0390, 28.8560),
}

# route_type: 0=tramvay, 1=metro, 2=banliyö treni (Marmaray), 3=otobüs (metrobüs)
LINES = [
    {
        "route_id": "M2", "short": "M2", "long": "Yenikapı - Hacıosman",
        "type": 1, "color": "009A44", "headway": 6, "hop": 3,
        "stops": ["ynk", "sshane", "taksim", "osmanbey", "sismec",
                  "gayrettepe", "levent", "haciosman"],
    },
    {
        "route_id": "M1B", "short": "M1B", "long": "Yenikapı - Kirazlı",
        "type": 1, "color": "ED1C24", "headway": 10, "hop": 3,
        "stops": ["ynk", "aksaray", "emniyet", "otogar", "kirazli"],
    },
    {
        "route_id": "MR", "short": "Marmaray", "long": "Halkalı - Gebze",
        "type": 2, "color": "0067A6", "headway": 8, "hop": 4,
        "stops": ["halkali", "ynk", "sirkeci", "uskudar", "ayrilik",
                  "sogutlucesme", "bostanci", "pendik", "gebze"],
    },
    {
        "route_id": "34", "short": "34", "long": "Metrobüs: Beylikdüzü - Söğütlüçeşme",
        "type": 3, "color": "C8102E", "headway": 4, "hop": 4,
        "stops": ["beylikduzu", "avcilar", "cevizlibag", "zincirlikuyu",
                  "mecidiyekoy", "sogutlucesme"],
    },
    {
        "route_id": "T1", "short": "T1", "long": "Kabataş - Bağcılar",
        "type": 0, "color": "0061A8", "headway": 8, "hop": 2,
        "stops": ["kabatas", "karakoy", "eminonu", "sirkeci", "sultanahmet",
                  "beyazit", "zeytinburnu", "bagcilar"],
    },
]

SERVICE_ID = "HERGUN"
START_SEC = 6 * 3600        # 06:00
END_SEC = 23 * 3600         # 23:00


def hhmmss(sec: int) -> str:
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def write_csv(path: Path, header: list[str], rows: list[list]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # agency.txt
    write_csv(
        OUT_DIR / "agency.txt",
        ["agency_id", "agency_name", "agency_url", "agency_timezone"],
        [["IBB", "İstanbul Büyükşehir Belediyesi (örnek veri)",
          "https://www.istanbul-ulasim.example", "Europe/Istanbul"]],
    )

    # stops.txt
    stop_rows = [[sid, name, f"{lat:.4f}", f"{lon:.4f}"]
                 for sid, (name, lat, lon) in STOPS.items()]
    write_csv(OUT_DIR / "stops.txt",
              ["stop_id", "stop_name", "stop_lat", "stop_lon"], stop_rows)

    # calendar.txt — her gün aktif tek servis
    write_csv(
        OUT_DIR / "calendar.txt",
        ["service_id", "monday", "tuesday", "wednesday", "thursday",
         "friday", "saturday", "sunday", "start_date", "end_date"],
        [[SERVICE_ID, 1, 1, 1, 1, 1, 1, 1, "20240101", "20261231"]],
    )

    route_rows = []
    trip_rows = []
    stop_time_rows = []

    for line in LINES:
        rid = line["route_id"]
        route_rows.append([rid, "IBB", line["short"], line["long"],
                           line["type"], line["color"], "FFFFFF"])

        for direction in (0, 1):
            stops = line["stops"] if direction == 0 else list(reversed(line["stops"]))
            dest_name = STOPS[stops[-1]][0]
            start = START_SEC
            while start <= END_SEC:
                trip_id = f"{rid}_{direction}_{hhmmss(start)[:5].replace(':', '')}"
                trip_rows.append([rid, SERVICE_ID, trip_id, dest_name, direction])
                t = start
                for seq, sid in enumerate(stops, start=1):
                    stop_time_rows.append(
                        [trip_id, hhmmss(t), hhmmss(t), sid, seq])
                    t += line["hop"] * 60
                start += line["headway"] * 60

    write_csv(
        OUT_DIR / "routes.txt",
        ["route_id", "agency_id", "route_short_name", "route_long_name",
         "route_type", "route_color", "route_text_color"],
        route_rows,
    )
    write_csv(
        OUT_DIR / "trips.txt",
        ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"],
        trip_rows,
    )
    write_csv(
        OUT_DIR / "stop_times.txt",
        ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
        stop_time_rows,
    )

    print(f"Yazıldı: {OUT_DIR}")
    print(f"  duraklar      : {len(stop_rows)}")
    print(f"  hatlar        : {len(route_rows)}")
    print(f"  seferler      : {len(trip_rows)}")
    print(f"  durak-zamanlar : {len(stop_time_rows)}")


if __name__ == "__main__":
    main()
