"""İETT SOAP web servisleri istemcisi ve SOAP→GTFS dönüştürücü.

İETT'nin api.ibb.gov.tr/iett servislerini çağırıp verilerini bu projenin GTFS
formatına dönüştürür. **Ağ erişimi gerektirir** (api.ibb.gov.tr). Ayrıştırma ve
eşleme mantığı ağsız test edilebilir; canlı çağrılar ağ erişimi olan bir ortamda
çalıştırılmalıdır.

Kullanılan servisler (İETT Web Servis Dokümanı V1.5):
  HatDurakGuzergah.asmx     GetDurak_json   tüm duraklar (koordinatlı)
                            GetHat_json     tüm hatlar (uzunluk, sefer süresi)
  ibb/ibb.asmx              DurakDetay_GYY  hattın sıralı durakları (SIRANO)
  PlanlananSeferSaati.asmx  GetPlanlananSeferSaati_json  planlanan kalkış saatleri
  FiloDurum/SeferGerceklesme.asmx  GetHatOtoKonum_json  canlı araç konumu

Dönüştürücü (build_gtfs) bir "client" nesnesi alır; bu sayede gerçek
IETTClient ile canlı, ya da sahte bir client ile çevrimdışı test edilebilir.

NOT: Servislerin tam yanıt şekilleri (özellikle DurakDetay_GYY'nin XML DataSet
düzeni) bu ortamdan doğrulanamadı; ayrıştırıcılar belgelenmiş alan adlarına göre
toleranslı yazıldı. Canlı yanıtla doğrulanması önerilir.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

BASE = "https://api.ibb.gov.tr/iett"
NS = "http://tempuri.org/"
SOAP_ENV = "http://schemas.xmlsoap.org/soap/envelope/"

ENDPOINTS = {
    "hatdurak": "/UlasimAnaVeri/HatDurakGuzergah.asmx",
    "ibb": "/ibb/ibb.asmx",
    "plan": "/UlasimAnaVeri/PlanlananSeferSaati.asmx",
    "sefer": "/FiloDurum/SeferGerceklesme.asmx",
}

# İETT gün tipi (SGUNTIPI) -> GTFS service_id
DAYTYPE_SERVICE = {"I": "HAFTAICI", "İ": "HAFTAICI", "C": "CUMARTESI", "P": "PAZAR"}
SERVICE_DAYS = {
    "HAFTAICI": (1, 1, 1, 1, 1, 0, 0),
    "CUMARTESI": (0, 0, 0, 0, 0, 1, 0),
    "PAZAR": (0, 0, 0, 0, 0, 0, 1),
}


class IETTError(Exception):
    pass


# --------------------------------------------------------------------------
# ayrıştırma yardımcıları (saf, ağsız test edilebilir)
# --------------------------------------------------------------------------
def parse_coordinate(value: str) -> tuple[float | None, float | None]:
    """Koordinat metninden (enlem, boylam) çıkarır.

    İETT verisinde X=boylam, Y=enlem'dir. İstanbul için enlem ~41, boylam ~29
    olduğundan değerler aralığa göre ayrıştırılır; aksi halde 'X Y' sırası
    varsayılır.
    """
    nums = re.findall(r"-?\d+(?:[.,]\d+)?", value or "")
    if len(nums) < 2:
        return (None, None)
    a, b = (float(n.replace(",", ".")) for n in nums[:2])

    def is_lat(x: float) -> bool:
        return 39.0 <= x <= 43.0

    def is_lon(x: float) -> bool:
        return 26.0 <= x <= 32.0

    if is_lat(a) and is_lon(b):
        return (a, b)
    if is_lon(a) and is_lat(b):
        return (b, a)
    return (b, a)  # varsayım: ilk=boylam(X), ikinci=enlem(Y)


def hhmm_to_seconds(value: str) -> int | None:
    """'HH:mm' ya da 'HH:mm:ss' -> gün başından saniye."""
    value = (value or "").strip()
    m = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$", value)
    if not m:
        return None
    h, mn, s = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    return h * 3600 + mn * 60 + s


def seconds_to_hhmmss(sec: int) -> str:
    h, rem = divmod(int(sec), 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _to_int(value) -> int | None:
    m = re.search(r"-?\d+", str(value or ""))
    return int(m.group()) if m else None


def _to_float(value) -> float | None:
    m = re.search(r"-?\d+(?:[.,]\d+)?", str(value or ""))
    return float(m.group().replace(",", ".")) if m else None


def direction_from(yon: str) -> int:
    """İETT yön bilgisini (G/D, 1/2, Gidiş/Dönüş) GTFS direction_id'ye çevirir."""
    y = (yon or "").strip().upper()
    if y in ("D", "2", "DONUS", "DÖNÜŞ", "DÖN"):
        return 1
    return 0


def _find_result(raw: bytes) -> ET.Element:
    root = ET.fromstring(raw)
    for el in root.iter():
        if el.tag.split("}")[-1].endswith("Result"):
            return el
    raise IETTError("SOAP yanıtında *Result öğesi bulunamadı")


def result_text(raw: bytes) -> str:
    """JSON döndüren metotlar için Result öğesinin metnini verir."""
    return _find_result(raw).text or ""


def _rows_from_element(parent: ET.Element) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for node in parent.iter():
        children = list(node)
        if children and all(len(list(c)) == 0 for c in children):
            row = {c.tag.split("}")[-1]: (c.text or "").strip() for c in children}
            if row:
                rows.append(row)
    return rows


def result_rows(raw: bytes) -> list[dict[str, str]]:
    """XML DataSet döndüren metotlar (DurakDetay_GYY) için satırları verir."""
    el = _find_result(raw)
    rows = _rows_from_element(el)
    if not rows and el.text and "<" in el.text:
        # Result içinde kaçışlı XML string olabilir
        rows = _rows_from_element(ET.fromstring(el.text))
    return rows


def loads_list(text: str) -> list[dict]:
    text = (text or "").strip()
    if not text:
        return []
    data = json.loads(text)
    return data if isinstance(data, list) else [data]


def _envelope(method: str, params: dict[str, str]) -> str:
    inner = "".join(f"<{k}>{escape(str(v))}</{k}>" for k, v in params.items())
    return (f'<?xml version="1.0" encoding="utf-8"?>'
            f'<soap:Envelope xmlns:soap="{SOAP_ENV}"><soap:Body>'
            f'<{method} xmlns="{NS}">{inner}</{method}>'
            f'</soap:Body></soap:Envelope>')


# --------------------------------------------------------------------------
# SOAP istemcisi (canlı; ağ gerektirir)
# --------------------------------------------------------------------------
class IETTClient:
    """İETT ASMX servislerini ham SOAP 1.1 POST ile çağırır (zeep gerektirmez).

    opener: test için enjekte edilebilir bir çağrılabilir
            (url, body_bytes, headers) -> response_bytes.
    """

    def __init__(self, base: str = BASE, timeout: int = 30, opener=None) -> None:
        self.base = base.rstrip("/")
        self.timeout = timeout
        self._opener = opener

    def _post(self, endpoint: str, method: str, params: dict[str, str]) -> bytes:
        url = self.base + ENDPOINTS[endpoint]
        body = _envelope(method, params).encode("utf-8")
        headers = {"Content-Type": "text/xml; charset=utf-8",
                   "SOAPAction": f'"{NS}{method}"'}
        if self._opener is not None:
            return self._opener(url, body, headers)
        req = urllib.request.Request(url, data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                return resp.read()
        except urllib.error.URLError as exc:
            raise IETTError(f"İETT servisine erişilemedi ({url}): {exc}") from exc

    def get_duraklar(self, durak_kodu: str = "") -> list[dict]:
        return loads_list(result_text(self._post("hatdurak", "GetDurak_json",
                                                 {"DurakKodu": durak_kodu})))

    def get_hatlar(self, hat_kodu: str = "") -> list[dict]:
        return loads_list(result_text(self._post("hatdurak", "GetHat_json",
                                                 {"HatKodu": hat_kodu})))

    def durak_detay(self, hat_kodu: str) -> list[dict]:
        return result_rows(self._post("ibb", "DurakDetay_GYY", {"hat_kodu": hat_kodu}))

    def planlanan_sefer_saati(self, hat_kodu: str) -> list[dict]:
        return loads_list(result_text(self._post("plan", "GetPlanlananSeferSaati_json",
                                                 {"HatKodu": hat_kodu})))

    def hat_oto_konum(self, hat_no: str) -> list[dict]:
        """Bir hattaki araçların canlı konumlarını döndürür (saatte 100 istek sınırı)."""
        return loads_list(result_text(self._post("sefer", "GetHatOtoKonum_json",
                                                 {"HatNo": hat_no})))


# --------------------------------------------------------------------------
# SOAP -> GTFS dönüştürücü
# --------------------------------------------------------------------------
def build_gtfs(client, out_dir: str | Path, hat_kodlari: list[str] | None = None,
               default_hop_sec: int = 120) -> dict[str, int]:
    """İETT verisinden GTFS feed'i üretir; out_dir'e yazar ve sayıları döndürür.

    client: get_duraklar/get_hatlar/durak_detay/planlanan_sefer_saati metotları
            olan herhangi bir nesne (gerçek IETTClient ya da sahte).
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    stops: dict[str, tuple[str, float | None, float | None]] = {}
    for d in client.get_duraklar():
        sid = d.get("SDURAKKODU")
        if not sid:
            continue
        lat, lon = parse_coordinate(d.get("KOORDINAT", ""))
        stops[sid] = (d.get("SDURAKADI") or sid, lat, lon)

    hatlar = client.get_hatlar()
    if hat_kodlari is not None:
        wanted = set(hat_kodlari)
        hatlar = [h for h in hatlar if h.get("SHATKODU") in wanted]

    routes: list[tuple[str, str, str, int]] = []
    trips: list[tuple[str, str, str, str, int]] = []
    stop_times: list[tuple[str, str, str, str, int]] = []
    services: set[str] = set()

    for h in hatlar:
        hk = h.get("SHATKODU")
        if not hk:
            continue
        routes.append((hk, hk, h.get("SHATADI") or hk, 3))  # İETT = otobüs (3)
        sefer_sure = _to_int(h.get("SEFER_SURESI"))  # dakika

        # yön bazında sıralı durak deseni (DurakDetay_GYY)
        patterns: dict[int, list[str]] = {}
        for r in client.durak_detay(hk):
            d = direction_from(r.get("YON"))
            sira = _to_int(r.get("SIRANO")) or 0
            sid = r.get("DURAKKODU")
            if not sid:
                continue
            if sid not in stops:
                stops[sid] = (r.get("DURAKADI") or sid,
                              _to_float(r.get("YKOORDINATI")),
                              _to_float(r.get("XKOORDINATI")))
            patterns.setdefault(d, []).append((sira, sid))
        ordered = {d: [s for _, s in sorted(rows)] for d, rows in patterns.items()}

        # planlanan kalkış saatleri (yön + gün tipi)
        deps: dict[tuple[int, str], list[int]] = {}
        for p in client.planlanan_sefer_saati(hk):
            d = direction_from(p.get("SYON"))
            svc = DAYTYPE_SERVICE.get((p.get("SGUNTIPI") or "I").strip().upper()[:1],
                                      "HAFTAICI")
            t = hhmm_to_seconds(p.get("DT"))
            if t is None:
                continue
            deps.setdefault((d, svc), []).append(t)
            services.add(svc)

        for d, seq in ordered.items():
            n = len(seq)
            if n < 2:
                continue
            hop = (sefer_sure * 60 // (n - 1)) if sefer_sure else default_hop_sec
            dest = stops.get(seq[-1], (seq[-1],))[0]
            for (dd, svc), times in deps.items():
                if dd != d:
                    continue
                for start in sorted(times):
                    trip_id = f"{hk}_{d}_{svc}_{seconds_to_hhmmss(start)[:5].replace(':', '')}"
                    trips.append((hk, svc, trip_id, dest, d))
                    t = start
                    for seqno, sid in enumerate(seq, start=1):
                        stop_times.append((trip_id, seconds_to_hhmmss(t),
                                           seconds_to_hhmmss(t), sid, seqno))
                        t += hop

    if not services:
        services.add("HAFTAICI")
    _write_gtfs(out, stops, routes, trips, stop_times, services)
    return {"duraklar": len(stops), "hatlar": len(routes),
            "seferler": len(trips), "durak_zamanlar": len(stop_times)}


def _write_csv(path: Path, header: list[str], rows) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def _write_gtfs(out: Path, stops, routes, trips, stop_times, services) -> None:
    _write_csv(out / "agency.txt",
               ["agency_id", "agency_name", "agency_url", "agency_timezone"],
               [["IETT", "İETT", "https://www.iett.istanbul", "Europe/Istanbul"]])
    _write_csv(out / "stops.txt", ["stop_id", "stop_name", "stop_lat", "stop_lon"],
               [[sid, name, "" if lat is None else f"{lat:.6f}",
                 "" if lon is None else f"{lon:.6f}"]
                for sid, (name, lat, lon) in stops.items()])
    _write_csv(out / "routes.txt",
               ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"],
               [[rid, "IETT", short, long, rtype] for rid, short, long, rtype in routes])
    _write_csv(out / "trips.txt",
               ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"], trips)
    _write_csv(out / "stop_times.txt",
               ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
               stop_times)
    _write_csv(out / "calendar.txt",
               ["service_id", "monday", "tuesday", "wednesday", "thursday",
                "friday", "saturday", "sunday", "start_date", "end_date"],
               [[svc, *SERVICE_DAYS.get(svc, (1, 1, 1, 1, 1, 1, 1)),
                 "20240101", "20261231"] for svc in sorted(services)])


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="İETT SOAP servislerinden GTFS üretir (ağ erişimi gerekir).")
    parser.add_argument("--out", default="data/iett", help="Çıktı GTFS dizini")
    parser.add_argument("--hat", action="append", dest="hatlar",
                        help="Yalnızca bu hat kodları (tekrarlanabilir)")
    parser.add_argument("--base", default=BASE, help="Servis taban adresi")
    args = parser.parse_args(argv)

    client = IETTClient(base=args.base)
    print(f"İETT servisinden veri çekiliyor: {args.base}")
    try:
        summary = build_gtfs(client, args.out, hat_kodlari=args.hatlar)
    except IETTError as exc:
        print(f"HATA: {exc}")
        print("Bu komut api.ibb.gov.tr'ye ağ erişimi gerektirir. "
              "Ağ erişimi olan bir ortamda çalıştırın.")
        raise SystemExit(1) from exc
    print(f"GTFS yazıldı: {args.out}")
    for k, v in summary.items():
        print(f"  {k:14}: {v}")
    print(f"\nKullanım: ISTANBUL_GTFS_PATH={args.out} istanbul-ulasim-mcp")


if __name__ == "__main__":
    main()
