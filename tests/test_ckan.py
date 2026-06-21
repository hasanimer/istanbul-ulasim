"""İBB CKAN API istemcisi testleri (ağsız, enjekte edilen yanıtlarla)."""
from __future__ import annotations

import json
import unittest

from istanbul_ulasim import ckan


def make_opener(payload: dict):
    """Sabit bir JSON yanıtı döndüren sahte opener üretir."""
    raw = json.dumps(payload).encode("utf-8")

    def opener(url, data, headers):
        opener.last_url = url
        return raw

    return opener


class ParseTest(unittest.TestCase):
    def test_success(self):
        result = ckan.parse_response('{"success": true, "result": {"records": [1, 2]}}')
        self.assertEqual(result["records"], [1, 2])

    def test_failure_raises(self):
        with self.assertRaises(ckan.CKANError):
            ckan.parse_response('{"success": false, "error": {"message": "yok"}}')


class PickGtfsTest(unittest.TestCase):
    def test_picks_gtfs_zip(self):
        resources = [
            {"name": "durak csv", "format": "CSV", "url": "https://x/durak.csv"},
            {"name": "İETT GTFS", "format": "GTFS", "url": "https://x/gtfs.zip"},
            {"name": "readme", "format": "TXT", "url": "https://x/readme.txt"},
        ]
        res = ckan.pick_gtfs_resource(resources)
        self.assertIsNotNone(res)
        self.assertEqual(res["url"], "https://x/gtfs.zip")

    def test_none_when_no_gtfs(self):
        resources = [{"name": "durak", "format": "CSV", "url": "https://x/d.csv"}]
        self.assertIsNone(ckan.pick_gtfs_resource(resources))


class ClientTest(unittest.TestCase):
    def test_datastore_search(self):
        payload = {"success": True, "result": {"records": [{"id": 1}], "total": 1}}
        client = ckan.CKANClient(opener=make_opener(payload))
        result = client.datastore_search("res-123", q="taksim", limit=5)
        self.assertEqual(ckan.records(result), [{"id": 1}])

    def test_datastore_search_sql(self):
        payload = {"success": True, "result": {"records": [{"DURAK": "Taksim"}]}}
        client = ckan.CKANClient(opener=make_opener(payload))
        rows = client.datastore_search_sql('SELECT * FROM "res" LIMIT 1')
        self.assertEqual(rows[0]["DURAK"], "Taksim")

    def test_resolve_gtfs_url(self):
        payload = {"success": True, "result": {"resources": [
            {"name": "doc", "format": "PDF", "url": "https://x/d.pdf"},
            {"name": "GTFS", "format": "GTFS", "url": "https://x/iett-gtfs.zip"},
        ]}}
        client = ckan.CKANClient(opener=make_opener(payload))
        url = client.resolve_gtfs_url("iett-gtfs-verisi")
        self.assertEqual(url, "https://x/iett-gtfs.zip")

    def test_api_key_header(self):
        client = ckan.CKANClient(api_key="secret-key")
        self.assertEqual(client._headers.get("Authorization"), "secret-key")


if __name__ == "__main__":
    unittest.main()
