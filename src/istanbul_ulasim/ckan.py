"""İBB Açık Veri (CKAN) API istemcisi.

data.ibb.gov.tr bir CKAN portalıdır ve REST/JSON DataStore API'si sunar:
  datastore_search       — tablo veri seti sorgulama (q, filters, limit)
  datastore_search_sql   — SQL ile sorgulama
  package_show           — veri setinin kaynaklarını (resources) listeler

Bu modülün asıl pratik değeri: portalda yayımlanan **hazır GTFS** veri setinin
indirme adresini bulup (resolve_gtfs_url) indirebilmektir. İndirilen GTFS,
projenin mevcut yükleyicisi (gtfs.py) tarafından ek koda gerek kalmadan okunur:

    url = CKANClient().resolve_gtfs_url("iett-gtfs-verisi")
    # ISTANBUL_GTFS_URL=<url> istanbul-ulasim-mcp

**Ağ erişimi gerektirir** (data.ibb.gov.tr). Ayrıştırma mantığı ağsız test
edilebilir (enjekte edilebilir `opener` ile). Portal bazı kaynaklar için
"İBB Login"/API anahtarı isteyebilir; gerekirse `api_key` verin.
"""
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://data.ibb.gov.tr"
DEFAULT_GTFS_DATASET = "iett-gtfs-verisi"


class CKANError(Exception):
    pass


def parse_response(raw: bytes | str) -> dict:
    """CKAN JSON yanıtını çözer ve result'ı döndürür; success=false ise hata atar."""
    data = json.loads(raw)
    if not data.get("success", False):
        raise CKANError(f"CKAN hata: {data.get('error')}")
    return data.get("result", {})


def pick_gtfs_resource(resources: list[dict]) -> dict | None:
    """Bir veri setinin kaynakları içinden GTFS (zip) kaynağını seçer."""
    def score(r: dict) -> int:
        fmt = (r.get("format") or "").strip().lower()
        name = (r.get("name") or "").lower()
        url = (r.get("url") or "").lower()
        if fmt == "gtfs":
            return 3
        if "gtfs" in name and (url.endswith(".zip") or fmt == "zip"):
            return 2
        if "gtfs" in url and url.endswith(".zip"):
            return 2
        if url.endswith(".zip") and "gtfs" in (name + " " + url):
            return 1
        return 0

    best = max(resources, key=score, default=None)
    return best if best is not None and score(best) > 0 else None


def records(result: dict) -> list[dict]:
    """datastore_search / _sql sonucundan kayıt listesini verir."""
    return result.get("records", [])


class CKANClient:
    """data.ibb.gov.tr CKAN API istemcisi (REST/JSON).

    opener: test için enjekte edilebilir çağrılabilir
            (url, data, headers) -> response_bytes. data=None ise GET.
    """

    def __init__(self, base: str = BASE, api_key: str | None = None,
                 timeout: int = 30, opener=None) -> None:
        self.base = base.rstrip("/")
        self.timeout = timeout
        self._opener = opener
        self._headers = {"Accept": "application/json",
                         "User-Agent": "istanbul-ulasim/ckan"}
        if api_key:
            self._headers["Authorization"] = api_key

    def _get(self, action: str, params: dict[str, str]) -> dict:
        url = f"{self.base}/api/3/action/{action}?{urllib.parse.urlencode(params)}"
        if self._opener is not None:
            raw = self._opener(url, None, self._headers)
        else:
            req = urllib.request.Request(url, headers=self._headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                    raw = resp.read()
            except urllib.error.URLError as exc:
                raise CKANError(f"CKAN API'ye erişilemedi ({url}): {exc}") from exc
        return parse_response(raw)

    def datastore_search(self, resource_id: str, q: str | None = None,
                         limit: int = 100, offset: int = 0) -> dict:
        params = {"resource_id": resource_id, "limit": str(limit), "offset": str(offset)}
        if q:
            params["q"] = q
        return self._get("datastore_search", params)

    def datastore_search_sql(self, sql: str) -> list[dict]:
        return records(self._get("datastore_search_sql", {"sql": sql}))

    def package_show(self, dataset_id: str) -> dict:
        return self._get("package_show", {"id": dataset_id})

    def resolve_gtfs_url(self, dataset_id: str = DEFAULT_GTFS_DATASET) -> str | None:
        """Veri setindeki GTFS kaynağının indirme adresini döndürür (yoksa None)."""
        resources = self.package_show(dataset_id).get("resources", [])
        res = pick_gtfs_resource(resources)
        return res.get("url") if res else None

    def download_gtfs(self, dataset_id: str, dest: str | Path) -> Path:
        """GTFS zip'ini indirir; indirilen dosyanın yolunu döndürür."""
        url = self.resolve_gtfs_url(dataset_id)
        if not url:
            raise CKANError(f"'{dataset_id}' veri setinde GTFS kaynağı bulunamadı.")
        dest = Path(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            urllib.request.urlretrieve(url, dest)  # noqa: S310
        except urllib.error.URLError as exc:
            raise CKANError(f"GTFS indirilemedi ({url}): {exc}") from exc
        return dest


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="İBB Açık Veri (CKAN) API yardımcısı (ağ erişimi gerekir).")
    parser.add_argument("--base", default=BASE, help="CKAN taban adresi")
    parser.add_argument("--api-key", default=None, help="Gerekirse İBB API anahtarı")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_url = sub.add_parser("url", help="Hazır GTFS kaynağının indirme adresini yazdırır")
    p_url.add_argument("--dataset", default=DEFAULT_GTFS_DATASET)

    p_fetch = sub.add_parser("fetch", help="Hazır GTFS zip'ini indirir")
    p_fetch.add_argument("--dataset", default=DEFAULT_GTFS_DATASET)
    p_fetch.add_argument("--out", default="data/iett-gtfs.zip")

    p_sql = sub.add_parser("sql", help="datastore_search_sql çalıştırır")
    p_sql.add_argument("sql", help='Örn: SELECT * FROM "<resource_id>" LIMIT 5')

    args = parser.parse_args(argv)
    client = CKANClient(base=args.base, api_key=args.api_key)
    try:
        if args.cmd == "url":
            url = client.resolve_gtfs_url(args.dataset)
            print(url or "GTFS kaynağı bulunamadı.")
        elif args.cmd == "fetch":
            path = client.download_gtfs(args.dataset, args.out)
            print(f"İndirildi: {path}")
            print(f"Kullanım: ISTANBUL_GTFS_PATH={path} istanbul-ulasim-mcp")
        elif args.cmd == "sql":
            for row in client.datastore_search_sql(args.sql):
                print(json.dumps(row, ensure_ascii=False))
    except CKANError as exc:
        print(f"HATA: {exc}")
        print("Bu komut data.ibb.gov.tr'ye ağ erişimi gerektirir.")
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
