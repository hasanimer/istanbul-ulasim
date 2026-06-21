"""Metro İstanbul API istemcisi ve metro_duyurular aracı testleri (ağsız)."""
from __future__ import annotations

import json
import unittest

from istanbul_ulasim import metro

LINES_ENV = {"Success": True, "Error": None, "Data": [
    {"Id": 1, "Name": "M2", "FunctionalCode": "M2", "IsActive": True,
     "Color_R": 0, "Color_G": 154, "Color_B": 68},
]}
ANN_ENV = {"Success": True, "Data": [
    {"LineName": "M2", "Title": "Bakım", "Message": "Gece bakım çalışması",
     "Date": "2026-06-21"},
]}


def make_opener(payload: dict):
    raw = json.dumps(payload).encode("utf-8")

    def opener(url, data, headers):
        opener.last_url = url
        return raw

    return opener


class EnvelopeTest(unittest.TestCase):
    def test_success(self):
        data = metro.parse_envelope(json.dumps(LINES_ENV))
        self.assertEqual(data[0]["Name"], "M2")

    def test_failure_raises(self):
        bad = json.dumps({"Success": False, "Error": {"Message": "yetkisiz"}})
        with self.assertRaises(metro.MetroError):
            metro.parse_envelope(bad)


class HelpersTest(unittest.TestCase):
    def test_color_hex_flat(self):
        self.assertEqual(metro.color_hex(LINES_ENV["Data"][0]), "009A44")

    def test_color_hex_nested(self):
        line = {"Color": {"Color_R": 237, "Color_G": 28, "Color_B": 36}}
        self.assertEqual(metro.color_hex(line), "ED1C24")

    def test_color_hex_missing(self):
        self.assertIsNone(metro.color_hex({"Name": "X"}))

    def test_line_summary(self):
        s = metro.line_summary(LINES_ENV["Data"][0])
        self.assertEqual(s["code"], "M2")
        self.assertEqual(s["color"], "009A44")

    def test_format_announcement(self):
        out = metro.format_announcement(ANN_ENV["Data"][0])
        self.assertIn("M2", out)
        self.assertIn("Bakım", out)
        self.assertIn("2026-06-21", out)

    def test_format_announcement_defensive(self):
        # bilinmeyen şekil bile çökmemeli
        out = metro.format_announcement({"weird": "field"})
        self.assertIsInstance(out, str)


class ClientTest(unittest.TestCase):
    def test_get_lines(self):
        client = metro.MetroClient(opener=make_opener(LINES_ENV))
        lines = client.get_lines()
        self.assertEqual(lines[0]["FunctionalCode"], "M2")

    def test_get_announcements(self):
        client = metro.MetroClient(opener=make_opener(ANN_ENV))
        anns = client.get_announcements()
        self.assertEqual(anns[0]["Title"], "Bakım")


class FakeMetro:
    def __init__(self, anns=None, error=None):
        self._anns = anns or []
        self._error = error

    def get_announcements(self, path=None):
        if self._error:
            raise self._error
        return self._anns


class DuyurularToolTest(unittest.TestCase):
    def tearDown(self):
        from istanbul_ulasim import server
        server._metro_client = None  # her testten sonra sıfırla

    def test_lists_and_filters(self):
        from istanbul_ulasim import server
        server._metro_client = FakeMetro(ANN_ENV["Data"])
        out = server.metro_duyurular("M2")
        self.assertIn("Bakım", out)
        # eşleşmeyen hat -> duyuru yok
        self.assertIn("bulunamadı", server.metro_duyurular("M1A"))

    def test_error_is_graceful(self):
        from istanbul_ulasim import server
        server._metro_client = FakeMetro(error=metro.MetroError("ağ yok"))
        out = server.metro_duyurular()
        self.assertIn("alınamadı", out)


if __name__ == "__main__":
    unittest.main()
