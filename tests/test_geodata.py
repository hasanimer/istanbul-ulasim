"""İBB resmî raylı sistem verisi (geodata) ve araç testleri (gömülü veri)."""
from __future__ import annotations

import unittest

from istanbul_ulasim.geodata import RailData


class RailDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rail = RailData.load()

    def test_counts(self):
        self.assertEqual(len(self.rail.stations), 343)
        self.assertEqual(len(self.rail.lines), 37)

    def test_search_by_name(self):
        res = self.rail.search_stations(ad="Mehmet Akif")
        self.assertTrue(res)
        self.assertEqual(res[0].type, "Tramvay")
        self.assertIsNotNone(res[0].lat)

    def test_search_by_line(self):
        # "M4 Kadıköy" ana hattı 23; yalın "M4" ayrıca Tuzla uzatmasını da kapsar
        self.assertEqual(len(self.rail.search_stations(hat="M4 Kadıköy")), 23)
        self.assertEqual(len(self.rail.search_stations(hat="M4")), 29)

    def test_filter_under_construction(self):
        insaat = self.rail.search_stations(asama="inşaat")
        self.assertEqual(len(insaat), 75)
        self.assertTrue(all(s.under_construction for s in insaat))

    def test_filter_by_type(self):
        self.assertEqual(len(self.rail.search_stations(tur="Füniküler")), 6)

    def test_lines_filter(self):
        metros = self.rail.search_lines(tur="Metro")
        self.assertTrue(metros)
        self.assertTrue(all("metro" in ln.type.lower() for ln in metros))

    def test_summary(self):
        s = self.rail.summary()
        self.assertEqual(s["istasyon"], 343)
        self.assertEqual(s["tur"]["Metro"], 213)


class RailToolsTest(unittest.TestCase):
    def test_istasyon_ara_tool(self):
        from istanbul_ulasim import server
        out = server.raylsistem_istasyon_ara(hat="M4")
        self.assertIn("istasyon bulundu", out)

    def test_hatlari_tool(self):
        from istanbul_ulasim import server
        out = server.raylsistem_hatlari(tur="Tramvay")
        self.assertIn("hattı", out)


if __name__ == "__main__":
    unittest.main()
