"""Gömülü örnek veriyle çekirdek işlevlerin testleri (stdlib unittest)."""
from __future__ import annotations

import asyncio
import unittest

from istanbul_ulasim import routing
from istanbul_ulasim.gtfs import Feed, fold, parse_gtfs_time


class FoldTest(unittest.TestCase):
    def test_turkish_fold(self):
        self.assertEqual(fold("Üsküdar"), "uskudar")
        self.assertEqual(fold("Şişli"), "sisli")
        self.assertEqual(fold("İstanbul"), "istanbul")

    def test_parse_time(self):
        self.assertEqual(parse_gtfs_time("06:03:00"), 6 * 3600 + 180)
        self.assertEqual(parse_gtfs_time("25:00:00"), 25 * 3600)
        self.assertIsNone(parse_gtfs_time(""))


class FeedTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.feed = Feed.load()  # varsayılan örnek veri

    def test_counts(self):
        self.assertEqual(len(self.feed.routes), 14)
        self.assertGreater(len(self.feed.stops), 150)
        for rid in ("M1A", "M2", "M4", "M7", "M11", "MR", "34", "T1"):
            self.assertIn(rid, self.feed.routes)

    def test_search_route(self):
        self.assertTrue(self.feed.search_routes("marmaray"))
        self.assertEqual(self.feed.resolve_route("M2").route_id, "M2")

    def test_search_route_by_type(self):
        # 'metro' türe göre gerçek metro hatlarını da bulmalı
        ids = {r.route_id for r in self.feed.search_routes("metro")}
        self.assertIn("M2", ids)
        self.assertIn("M1B", ids)

    def test_terminus_is_not_a_departure(self):
        # Yenikapı, M2/M1A/M1B'nin son durağı; o yönde "kalkış" listelenmemeli
        deps = self.feed.departures["yenikapi"]
        for d in deps:
            if d.route_id in ("M2", "M1A", "M1B"):
                self.assertNotIn("Yenikapı", d.headsign)

    def test_search_stop_turkish(self):
        # aksansız sorgu Türkçe durağı bulmalı
        stop = self.feed.resolve_stop("uskudar")
        self.assertIsNotNone(stop)
        self.assertEqual(stop.stop_id, "uskudar")

    def test_shared_hub_has_multiple_routes(self):
        # Yenikapı M1A + M1B + M2 + Marmaray'a hizmet eder
        self.assertGreaterEqual(len(self.feed.stops["yenikapi"].route_ids), 4)

    def test_departures_sorted_and_filtered(self):
        deps = self.feed.upcoming_departures("taksim", 8 * 3600, limit=5)
        self.assertTrue(deps)
        self.assertTrue(all(d.seconds >= 8 * 3600 for d in deps))
        self.assertEqual(deps, sorted(deps, key=lambda d: d.seconds))


class RoutingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.feed = Feed.load()

    def test_direct_route(self):
        j = routing.plan(self.feed, "taksim", "levent")
        self.assertIsNotNone(j)
        self.assertEqual(j.transfers, 0)
        self.assertEqual(j.legs[0].route_id, "M2")

    def test_direct_m4(self):
        # Kadıköy -> Kartal: M4 üzerinde aktarmasız
        j = routing.plan(self.feed, "kadikoy", "kartal")
        self.assertIsNotNone(j)
        self.assertEqual(j.transfers, 0)
        self.assertEqual(j.legs[0].route_id, "M4")

    def test_transfer_via_yenikapi(self):
        # Üsküdar (M5/Marmaray) -> Taksim (M2), Yenikapı'da aktarma
        j = routing.plan(self.feed, "uskudar", "taksim")
        self.assertIsNotNone(j)
        self.assertEqual(j.transfers, 1)
        self.assertEqual(j.legs[-1].route_id, "M2")
        self.assertEqual(j.legs[0].alight_stop_id, "yenikapi")

    def test_transfer_via_sirkeci(self):
        # Kabataş (T1) -> Üsküdar (Marmaray), Sirkeci'de aktarma
        j = routing.plan(self.feed, "kabatas", "uskudar")
        self.assertIsNotNone(j)
        self.assertEqual(j.transfers, 1)
        self.assertEqual(j.legs[0].route_id, "T1")
        self.assertEqual(j.legs[-1].route_id, "MR")

    def test_cross_bosphorus_transfer(self):
        # Üsküdar (M5/Marmaray) -> Kadıköy (M4): Ayrılık Çeşmesi'nde aktarma
        j = routing.plan(self.feed, "uskudar", "kadikoy")
        self.assertIsNotNone(j)
        self.assertEqual(j.transfers, 1)
        self.assertEqual(j.legs[-1].route_id, "M4")

    def test_same_stop(self):
        j = routing.plan(self.feed, "taksim", "taksim")
        self.assertIsNotNone(j)
        self.assertEqual(j.legs, [])


class ServerToolsTest(unittest.TestCase):
    def test_tools_registered(self):
        from istanbul_ulasim import server

        tools = asyncio.run(server.mcp.list_tools())
        names = {t.name for t in tools}
        self.assertEqual(
            names,
            {"hat_ara", "durak_ara", "hat_duraklari",
             "durak_kalkislari", "rota_bul", "ag_ozeti"},
        )

    def test_rota_bul_text(self):
        from istanbul_ulasim import server

        out = server.rota_bul("Üsküdar", "Taksim")
        self.assertIn("aktarma", out)
        self.assertIn("Yenikapı", out)


if __name__ == "__main__":
    unittest.main()
