#!/usr/bin/env python3
"""İstanbul raylı/BRT ağından gerçek hat ve istasyon verisiyle GTFS üretir.

Hatların istasyon sıraları kamuya açık kaynaklardan (metro.istanbul, Vikipedi,
Moovit, vb.; ~Haziran 2026) derlenmiştir. Aktarma noktaları, gerçek
istasyonların aynı `stop_id`'yi paylaşması ile modellenir (örn. Yenikapı'da
M1A/M1B/M2/Marmaray birleşir). Sefer saatleri sentetiktir: her hat için sabit
sefer aralığı ve duraklar arası sabit süre varsayılır — yalnızca çizelge/rota
araçlarının çalışabilmesi içindir, resmî tarife değildir.

Marmaray, Metrobüs ve T1, asıl ağın temsilî alt kümeleridir (yalnızca ana
aktarma durakları); böylece raylı metro ağıyla bağlantı kurulur. Tam doğruluk
için resmî GTFS feed'ini ISTANBUL_GTFS_PATH ile kullanın.

Çıktı: src/istanbul_ulasim/data/sample/ — depoya işlenir, yeniden üretilebilir.
"""
from __future__ import annotations

import csv
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "src" / "istanbul_ulasim" / "data" / "sample"

# route_type: 0=Tramvay, 1=Metro, 2=Tren (Marmaray), 3=Otobüs (Metrobüs)
#
# Her hat: stops = [(stop_id, ad), ...] sırayla. Aktarma istasyonları birden çok
# hatta AYNI stop_id ile geçer; bu, aktarmayı oluşturur. Paylaşılan id'lerde
# aynı ad kullanılır (ilk geçiş kazanır).
LINES = [
    dict(route_id="M1A", short="M1A", long="Yenikapı - Atatürk Havalimanı",
         type=1, color="E30613", headway=7, hop=3, stops=[
             ("yenikapi", "Yenikapı"), ("aksaray", "Aksaray"),
             ("emniyet_fatih", "Emniyet-Fatih"), ("topkapi", "Topkapı-Ulubatlı"),
             ("bayrampasa", "Bayrampaşa-Maltepe"), ("sagmalcilar", "Sağmalcılar"),
             ("kocatepe", "Kocatepe"), ("otogar", "Otogar"),
             ("terazidere", "Terazidere"), ("davutpasa", "Davutpaşa-YTÜ"),
             ("merter", "Merter"), ("zeytinburnu", "Zeytinburnu"),
             ("bakirkoy_incirli", "Bakırköy-İncirli"), ("bahcelievler", "Bahçelievler"),
             ("atakoy_sirinevler", "Ataköy-Şirinevler"), ("yenibosna", "Yenibosna"),
             ("dtm", "DTM-İstanbul Fuar Merkezi"), ("ataturk_hava", "Atatürk Havalimanı"),
         ]),
    dict(route_id="M1B", short="M1B", long="Yenikapı - Kirazlı",
         type=1, color="E30613", headway=9, hop=3, stops=[
             ("yenikapi", "Yenikapı"), ("aksaray", "Aksaray"),
             ("emniyet_fatih", "Emniyet-Fatih"), ("topkapi", "Topkapı-Ulubatlı"),
             ("bayrampasa", "Bayrampaşa-Maltepe"), ("sagmalcilar", "Sağmalcılar"),
             ("kocatepe", "Kocatepe"), ("otogar", "Otogar"),
             ("esenler", "Esenler"), ("menderes", "Menderes"),
             ("ucyuzlu", "Üçyüzlü"), ("bagcilar_meydan", "Bağcılar-Meydan"),
             ("kirazli", "Kirazlı"),
         ]),
    dict(route_id="M2", short="M2", long="Yenikapı - Hacıosman",
         type=1, color="009A44", headway=6, hop=3, stops=[
             ("yenikapi", "Yenikapı"), ("vezneciler", "Vezneciler-İstanbul Ü."),
             ("halic", "Haliç"), ("sishane", "Şişhane"), ("taksim", "Taksim"),
             ("osmanbey", "Osmanbey"), ("mecidiyekoy", "Mecidiyeköy"),
             ("gayrettepe", "Gayrettepe"), ("levent", "Levent"),
             ("dort_levent", "4.Levent"), ("sanayi", "Sanayi Mahallesi"),
             ("seyrantepe", "Seyrantepe"), ("itu_ayazaga", "İTÜ-Ayazağa"),
             ("oto_sanayi", "Atatürk Oto Sanayi"), ("darussafaka", "Darüşşafaka"),
             ("haciosman", "Hacıosman"),
         ]),
    dict(route_id="M3", short="M3", long="Bakırköy Sahil - Kayaşehir Merkez",
         type=1, color="00A0DF", headway=8, hop=3, stops=[
             ("bakirkoy_sahil", "Bakırköy Sahil"), ("ozgurluk_meydani", "Özgürlük Meydanı"),
             ("incirli", "İncirli"), ("haznedar", "Haznedar"),
             ("ilkyuva", "İlkyuva"), ("yildiztepe", "Yıldıztepe"),
             ("molla_gurani", "Molla Gürani"), ("kirazli", "Kirazlı"),
             ("yenimahalle_m3", "Yenimahalle (M3)"), ("mahmutbey", "Mahmutbey"),
             ("istoc", "İSTOÇ"), ("ikitelli_sanayi", "İkitelli Sanayi"),
             ("turgut_ozal", "Turgut Özal"), ("siteler", "Siteler"),
             ("basak_konutlari", "Başak Konutları"), ("basaksehir", "Başakşehir-Metrokent"),
             ("onurkent", "Onurkent"), ("sehir_hastanesi", "Şehir Hastanesi"),
             ("toplu_konutlar", "Toplu Konutlar"), ("kayasehir", "Kayaşehir Merkez"),
         ]),
    dict(route_id="M4", short="M4", long="Kadıköy - Sabiha Gökçen Havalimanı",
         type=1, color="E6007E", headway=6, hop=3, stops=[
             ("kadikoy", "Kadıköy"), ("ayrilik", "Ayrılık Çeşmesi"),
             ("acibadem", "Acıbadem"), ("unalan", "Ünalan"),
             ("goztepe", "Göztepe"), ("yenisahra", "Yenisahra"),
             ("kozyatagi", "Kozyatağı"), ("bostanci", "Bostancı"),
             ("kucukyali", "Küçükyalı"), ("maltepe", "Maltepe"),
             ("huzurevi", "Huzurevi"), ("gulsuyu", "Gülsuyu"),
             ("esenkent", "Esenkent"), ("hastane_adliye", "Hastane-Adliye"),
             ("soganlik", "Soğanlık"), ("kartal", "Kartal"),
             ("yakacik", "Yakacık-Adnan Kahveci"), ("pendik", "Pendik"),
             ("tavsantepe", "Tavşantepe"), ("fevzi_cakmak", "Fevzi Çakmak-Hastane"),
             ("yayalar", "Yayalar-Şeyhli"), ("kurtkoy", "Kurtköy"),
             ("sabiha_gokcen", "Sabiha Gökçen Havalimanı"),
         ]),
    dict(route_id="M5", short="M5", long="Üsküdar - Samandıra Merkez",
         type=1, color="7B2682", headway=7, hop=3, stops=[
             ("uskudar", "Üsküdar"), ("fistikagaci", "Fıstıkağacı"),
             ("baglarbasi", "Bağlarbaşı"), ("altunizade", "Altunizade"),
             ("kisikli", "Kısıklı"), ("bulgurlu", "Bulgurlu"),
             ("umraniye", "Ümraniye"), ("carsi", "Çarşı"),
             ("yamanevler", "Yamanevler"), ("cakmak", "Çakmak"),
             ("ihlamurkuyu", "Ihlamurkuyu"), ("altinsehir", "Altınşehir"),
             ("imam_hatip", "İmam Hatip Lisesi"), ("dudullu", "Dudullu"),
             ("necip_fazil", "Necip Fazıl"), ("cekmekoy", "Çekmeköy"),
             ("meclis", "Meclis"), ("sarigazi", "Sarıgazi"),
             ("sancaktepe_sh", "Sancaktepe Şehir Hastanesi"), ("sancaktepe", "Sancaktepe"),
             ("samandira", "Samandıra Merkez"),
         ]),
    dict(route_id="M6", short="M6", long="Levent - Boğaziçi Ü./Hisarüstü",
         type=1, color="A05A2C", headway=10, hop=2, stops=[
             ("levent", "Levent"), ("nispetiye", "Nispetiye"),
             ("etiler", "Etiler"), ("bogazici", "Boğaziçi Ü./Hisarüstü"),
         ]),
    dict(route_id="M7", short="M7", long="Yıldız - Mahmutbey",
         type=1, color="EC619F", headway=7, hop=3, stops=[
             ("yildiz", "Yıldız"), ("fulya", "Fulya"),
             ("mecidiyekoy", "Mecidiyeköy"), ("caglayan", "Çağlayan"),
             ("kagithane", "Kağıthane"), ("nurtepe", "Nurtepe"),
             ("alibeykoy", "Alibeyköy"), ("circir", "Çırçır Mahallesi"),
             ("veysel_karani_m7", "Veysel Karani-Akşemsettin"), ("yesilpinar", "Yeşilpınar"),
             ("kazim_karabekir", "Kazım Karabekir"), ("yenimahalle_m7", "Yenimahalle (M7)"),
             ("karadeniz_mah", "Karadeniz Mahallesi"), ("tekstilkent", "Tekstilkent-Giyimkent"),
             ("oruc_reis", "Oruç Reis"), ("goztepe_mah_m7", "Göztepe Mahallesi"),
             ("mahmutbey", "Mahmutbey"),
         ]),
    dict(route_id="M8", short="M8", long="Bostancı - Parseller",
         type=1, color="00A19A", headway=9, hop=3, stops=[
             ("bostanci", "Bostancı"), ("emin_ali_pasa", "Emin Ali Paşa"),
             ("aysekadin", "Ayşekadın"), ("kozyatagi", "Kozyatağı"),
             ("kucukbakkalkoy", "Küçükbakkalköy"), ("icerenkoy", "İçerenköy"),
             ("kayisdagi", "Kayışdağı"), ("mevlana", "Mevlana"),
             ("imes", "İmes"), ("modoko", "Modoko-Keyap"),
             ("dudullu", "Dudullu"), ("huzur", "Huzur"),
             ("parseller", "Parseller"),
         ]),
    dict(route_id="M9", short="M9", long="Ataköy - Olimpiyat",
         type=1, color="F4A900", headway=10, hop=3, stops=[
             ("atakoy", "Ataköy"), ("yenibosna", "Yenibosna"),
             ("cobancesme", "Çobançeşme"), ("ekim29", "29 Ekim Cumhuriyet"),
             ("dogu_sanayi", "Doğu Sanayi"), ("mimar_sinan", "Mimar Sinan"),
             ("temmuz15", "15 Temmuz"), ("halkali_caddesi", "Halkalı Caddesi"),
             ("ataturk_mah", "Atatürk Mahallesi"), ("bahariye", "Bahariye"),
             ("masko", "MASKO"), ("ikitelli_sanayi", "İkitelli Sanayi"),
             ("ziya_gokalp", "Ziya Gökalp Mahallesi"), ("olimpiyat", "Olimpiyat"),
         ]),
    dict(route_id="M11", short="M11", long="Gayrettepe - İstanbul Havalimanı - Arnavutköy",
         type=1, color="0033A0", headway=12, hop=4, stops=[
             ("gayrettepe", "Gayrettepe"), ("kagithane", "Kağıthane"),
             ("hasdal", "Hasdal"), ("kemerburgaz", "Kemerburgaz"),
             ("gokturk", "Göktürk"), ("ihsaniye", "İhsaniye"),
             ("istanbul_hava", "İstanbul Havalimanı"), ("kargo", "Kargo Terminali"),
             ("tasoluk", "Taşoluk"), ("arnavutkoy", "Arnavutköy"),
         ]),
    dict(route_id="MR", short="Marmaray", long="Halkalı - Gebze (temsilî)",
         type=2, color="0067A6", headway=10, hop=4, stops=[
             ("halkali", "Halkalı"), ("atakoy", "Ataköy"),
             ("yenikapi", "Yenikapı"), ("sirkeci", "Sirkeci"),
             ("uskudar", "Üsküdar"), ("ayrilik", "Ayrılık Çeşmesi"),
             ("sogutlucesme", "Söğütlüçeşme"), ("bostanci", "Bostancı"),
             ("pendik", "Pendik"), ("gebze", "Gebze"),
         ]),
    dict(route_id="34", short="34", long="Metrobüs: Beylikdüzü - Söğütlüçeşme (temsilî)",
         type=3, color="C8102E", headway=5, hop=4, stops=[
             ("beylikduzu", "Beylikdüzü"), ("avcilar", "Avcılar"),
             ("cevizlibag", "Cevizlibağ"), ("zincirlikuyu", "Zincirlikuyu"),
             ("mecidiyekoy", "Mecidiyeköy"), ("sogutlucesme", "Söğütlüçeşme"),
         ]),
    dict(route_id="T1", short="T1", long="Kabataş - Bağcılar (temsilî)",
         type=0, color="0061A8", headway=6, hop=3, stops=[
             ("kabatas", "Kabataş"), ("karakoy", "Karaköy"),
             ("eminonu", "Eminönü"), ("sirkeci", "Sirkeci"),
             ("sultanahmet", "Sultanahmet"), ("beyazit", "Beyazıt"),
             ("aksaray", "Aksaray"), ("zeytinburnu", "Zeytinburnu"),
             ("bagcilar", "Bağcılar"),
         ]),
]

# Bilinen başlıca aktarma/uç istasyonlar için yaklaşık koordinatlar (opsiyonel).
# Listelenmeyen duraklarda koordinat boş bırakılır (uydurmak yerine).
COORDS = {
    "yenikapi": (41.0058, 28.9500), "taksim": (41.0369, 28.9850),
    "mecidiyekoy": (41.0660, 28.9950), "gayrettepe": (41.0680, 29.0070),
    "levent": (41.0820, 29.0090), "haciosman": (41.1080, 29.0350),
    "kadikoy": (40.9920, 29.0270), "ayrilik": (40.9990, 29.0280),
    "uskudar": (41.0255, 29.0150), "sirkeci": (41.0150, 28.9770),
    "sogutlucesme": (40.9890, 29.0360), "bostanci": (40.9540, 29.0950),
    "pendik": (40.8770, 29.2330), "gebze": (40.7920, 29.3920),
    "kirazli": (41.0290, 28.8390), "mahmutbey": (41.0660, 28.8200),
    "atakoy": (40.9820, 28.8540), "zeytinburnu": (41.0050, 28.9020),
    "aksaray": (41.0110, 28.9540), "kabatas": (41.0330, 28.9890),
    "ataturk_hava": (40.9760, 28.8210), "sabiha_gokcen": (40.9050, 29.3090),
    "istanbul_hava": (41.2750, 28.7520),
}

SERVICE_ID = "HERGUN"
START_SEC = 6 * 3600        # 06:00
END_SEC = 24 * 3600         # 24:00 (gece yarısı)


def hhmmss(sec: int) -> str:
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def write_csv(path: Path, header: list[str], rows: list[list]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def collect_stops() -> dict[str, str]:
    """Tüm hatlardan benzersiz durakları toplar (ilk geçişteki ad kazanır)."""
    names: dict[str, str] = {}
    for line in LINES:
        for sid, name in line["stops"]:
            names.setdefault(sid, name)
    return names


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    names = collect_stops()

    write_csv(
        OUT_DIR / "agency.txt",
        ["agency_id", "agency_name", "agency_url", "agency_timezone"],
        [["IBB", "İstanbul (örnek/temsilî GTFS verisi)",
          "https://www.metro.istanbul", "Europe/Istanbul"]],
    )

    stop_rows = []
    for sid, name in names.items():
        lat, lon = COORDS.get(sid, ("", ""))
        lat_s = f"{lat:.4f}" if lat != "" else ""
        lon_s = f"{lon:.4f}" if lon != "" else ""
        stop_rows.append([sid, name, lat_s, lon_s])
    write_csv(OUT_DIR / "stops.txt",
              ["stop_id", "stop_name", "stop_lat", "stop_lon"], stop_rows)

    write_csv(
        OUT_DIR / "calendar.txt",
        ["service_id", "monday", "tuesday", "wednesday", "thursday",
         "friday", "saturday", "sunday", "start_date", "end_date"],
        [[SERVICE_ID, 1, 1, 1, 1, 1, 1, 1, "20240101", "20261231"]],
    )

    route_rows, trip_rows, stop_time_rows = [], [], []
    for line in LINES:
        rid = line["route_id"]
        route_rows.append([rid, "IBB", line["short"], line["long"],
                           line["type"], line["color"], "FFFFFF"])
        for direction in (0, 1):
            seq_stops = line["stops"] if direction == 0 else list(reversed(line["stops"]))
            dest_name = seq_stops[-1][1]
            start = START_SEC
            while start < END_SEC:
                trip_id = f"{rid}_{direction}_{hhmmss(start)[:5].replace(':', '')}"
                trip_rows.append([rid, SERVICE_ID, trip_id, dest_name, direction])
                t = start
                for seq, (sid, _name) in enumerate(seq_stops, start=1):
                    stop_time_rows.append([trip_id, hhmmss(t), hhmmss(t), sid, seq])
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

    transfer_stops = sum(
        1 for sid in names
        if sum(1 for ln in LINES if sid in {s for s, _ in ln["stops"]}) > 1
    )
    print(f"Yazıldı: {OUT_DIR}")
    print(f"  hatlar         : {len(route_rows)}")
    print(f"  duraklar       : {len(stop_rows)} ({transfer_stops} aktarma)")
    print(f"  seferler       : {len(trip_rows)}")
    print(f"  durak-zamanlar : {len(stop_time_rows)}")


if __name__ == "__main__":
    main()
