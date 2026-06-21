"""Metro İstanbul REST API istemcisi (raylı sistem: metro/füniküler/tramvay).

api.ibb.gov.tr/MetroIstanbul, ASP.NET Web API (REST/JSON) sunar. Yanıt zarfı:
    { "Success": bool, "Error": {...}, "Data": <...> }

Bu modül resmî hat metadata'sını (ad, kod, **renk**) ve **gerçek-zamanlı
duyuruları** sağlar — bunlar gömülü/GTFS veride bulunmayan, bu API'ye özgü
değerlerdir. Statik metro ağı için CKAN hazır GTFS yeterlidir (bu modül onu
tekrar etmez).

**Ağ erişimi gerektirir** (api.ibb.gov.tr). Ayrıştırma/biçimleme mantığı ağsız
test edilebilir (enjekte edilebilir `opener`).

Endpoint notları:
  - GetLines endpoint'i doğrulanmıştır: api/MetroMobile/V2/GetLines
  - Duyuru endpoint'inin tam yolu /Help'ten doğrulanmalıdır; varsayılan yol
    METRO_ANNOUNCEMENTS_PATH ortam değişkeniyle değiştirilebilir.
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.ibb.gov.tr/MetroIstanbul"
LINES_PATH = "api/MetroMobile/V2/GetLines"
ANNOUNCEMENTS_PATH = os.environ.get(
    "METRO_ANNOUNCEMENTS_PATH", "api/MetroMobile/V2/GetAnnouncements")


class MetroError(Exception):
    pass


def parse_envelope(raw: bytes | str):
    """{Success, Error, Data} zarfını çözer; Success=false ise hata atar."""
    data = json.loads(raw)
    if not data.get("Success", False):
        err = data.get("Error") or {}
        msg = err.get("Message") if isinstance(err, dict) else err
        raise MetroError(f"Metro İstanbul API hata: {msg or err}")
    return data.get("Data")


def _component(line: dict, *keys):
    for k in keys:
        if line.get(k) is not None:
            return line.get(k)
    color = line.get("Color")
    if isinstance(color, dict):
        for k in keys:
            if color.get(k) is not None:
                return color.get(k)
    return None


def color_hex(line: dict) -> str | None:
    """Hat nesnesinden RGB bileşenlerini alıp HEX renk üretir."""
    r = _component(line, "Color_R", "R")
    g = _component(line, "Color_G", "G")
    b = _component(line, "Color_B", "B")
    if None in (r, g, b):
        return None
    try:
        return f"{int(r):02X}{int(g):02X}{int(b):02X}"
    except (TypeError, ValueError):
        return None


def line_summary(line: dict) -> dict:
    """Hat nesnesini sade bir özet sözlüğe indirger."""
    return {
        "id": line.get("Id"),
        "name": line.get("Name"),
        "code": line.get("FunctionalCode"),
        "active": line.get("IsActive"),
        "color": color_hex(line),
    }


def format_announcement(a: dict) -> str:
    """Bir duyuru nesnesini okunabilir tek satıra biçimler (savunmacı)."""
    title = a.get("Title") or a.get("Header") or ""
    msg = (a.get("Message") or a.get("Content") or a.get("Description")
           or a.get("ShortDescription") or "")
    line = a.get("LineName") or a.get("Line") or a.get("FunctionalCode") or ""
    date = a.get("Date") or a.get("CreatedDate") or a.get("UpdateDate") or ""
    parts = [p for p in (line, title, msg) if p]
    head = " — ".join(parts) if parts else json.dumps(a, ensure_ascii=False)
    return f"{head}  ({date})" if date else head


class MetroClient:
    """Metro İstanbul REST API istemcisi.

    opener: test için enjekte edilebilir (url, data, headers) -> bytes (GET için data=None).
    """

    def __init__(self, base: str = BASE, timeout: int = 30, opener=None) -> None:
        self.base = base.rstrip("/")
        self.timeout = timeout
        self._opener = opener
        self._headers = {"Accept": "application/json",
                         "User-Agent": "istanbul-ulasim/metro"}

    def get(self, path: str, params: dict | None = None):
        url = f"{self.base}/{path.lstrip('/')}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        if self._opener is not None:
            raw = self._opener(url, None, self._headers)
        else:
            req = urllib.request.Request(url, headers=self._headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                    raw = resp.read()
            except urllib.error.URLError as exc:
                raise MetroError(f"Metro İstanbul API'ye erişilemedi ({url}): {exc}") from exc
        return parse_envelope(raw)

    def get_lines(self) -> list[dict]:
        data = self.get(LINES_PATH)
        return data if isinstance(data, list) else []

    def get_announcements(self, path: str | None = None) -> list[dict]:
        data = self.get(path or ANNOUNCEMENTS_PATH)
        return data if isinstance(data, list) else ([] if data is None else [data])


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Metro İstanbul REST API yardımcısı (ağ erişimi gerekir).")
    parser.add_argument("--base", default=BASE)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("lines", help="Hat listesini (resmî metadata) yazdırır")
    p_ann = sub.add_parser("announcements", help="Güncel duyuruları yazdırır")
    p_ann.add_argument("--path", default=None, help="Duyuru endpoint yolu (varsayılanı geçersiz kıl)")

    args = parser.parse_args(argv)
    client = MetroClient(base=args.base)
    try:
        if args.cmd == "lines":
            for line in client.get_lines():
                print(json.dumps(line_summary(line), ensure_ascii=False))
        elif args.cmd == "announcements":
            for a in client.get_announcements(path=args.path):
                print(format_announcement(a))
    except MetroError as exc:
        print(f"HATA: {exc}")
        print("Ağ erişimi gerekir (api.ibb.gov.tr). Duyuru yolu farklıysa "
              "METRO_ANNOUNCEMENTS_PATH ile ayarlayın (bkz. /MetroIstanbul/Help).")
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
