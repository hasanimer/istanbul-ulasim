"""İETT istemcisi ve SOAP→GTFS dönüştürücü testleri (ağsız, mock/sahte veri)."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from istanbul_ulasim import iett, routing
from istanbul_ulasim.gtfs import Feed

SOAP_JSON = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
    '<soap:Body><GetDurak_jsonResponse xmlns="http://tempuri.org/">'
    '<GetDurak_jsonResult>'
    '[{"SDURAKKODU":"D1","SDURAKADI":"Durak Bir","KOORDINAT":"29.000000 41.000000"}]'
    '</GetDurak_jsonResult></GetDurak_jsonResponse></soap:Body></soap:Envelope>'
).encode("utf-8")

SOAP_DATASET = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
    '<soap:Body><DurakDetay_GYYResponse xmlns="http://tempuri.org/">'
    '<DurakDetay_GYYResult><NewDataSet>'
    '<Table><HATKODU>500T</HATKODU><YON>G</YON><SIRANO>1</SIRANO>'
    '<DURAKKODU>D1</DURAKKODU><DURAKADI>Durak Bir</DURAKADI></Table>'
    '<Table><HATKODU>500T</HATKODU><YON>G</YON><SIRANO>2</SIRANO>'
    '<DURAKKODU>D2</DURAKKODU><DURAKADI>Durak İki</DURAKADI></Table>'
    '</NewDataSet></DurakDetay_GYYResult>'
    '</DurakDetay_GYYResponse></soap:Body></soap:Envelope>'
).encode("utf-8")


class HelpersTest(unittest.TestCase):
    def test_parse_coordinate_xy_order(self):
        # "boylam enlem" -> (enlem, boylam)
        self.assertEqual(iett.parse_coordinate("29.00 41.00"), (41.0, 29.0))

    def test_parse_coordinate_latlon_order(self):
        # aralık sezgisi: enlem önce verilmiş olsa da doğru ayrışmalı
        self.assertEqual(iett.parse_coordinate("41.00 29.00"), (41.0, 29.0))

    def test_parse_coordinate_invalid(self):
        self.assertEqual(iett.parse_coordinate(""), (None, None))

    def test_hhmm(self):
        self.assertEqual(iett.hhmm_to_seconds("06:30"), 6 * 3600 + 1800)
        self.assertEqual(iett.hhmm_to_seconds("06:30:15"), 6 * 3600 + 1815)
        self.assertIsNone(iett.hhmm_to_seconds("yok"))

    def test_direction(self):
        self.assertEqual(iett.direction_from("G"), 0)
        self.assertEqual(iett.direction_from("D"), 1)
        self.assertEqual(iett.direction_from("2"), 1)


class SoapParsingTest(unittest.TestCase):
    def test_result_text_json(self):
        rows = iett.loads_list(iett.result_text(SOAP_JSON))
        self.assertEqual(rows[0]["SDURAKKODU"], "D1")

    def test_result_rows_dataset(self):
        rows = iett.result_rows(SOAP_DATASET)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["DURAKKODU"], "D1")
        self.assertEqual(rows[1]["SIRANO"], "2")

    def test_client_with_injected_opener(self):
        # gerçek ağ yerine sabit yanıt enjekte et
        calls = {}

        def opener(url, body, headers):
            calls["url"] = url
            return SOAP_JSON

        client = iett.IETTClient(opener=opener)
        duraklar = client.get_duraklar()
        self.assertEqual(duraklar[0]["SDURAKADI"], "Durak Bir")
        self.assertIn("HatDurakGuzergah.asmx", calls["url"])


class FakeClient:
    """build_gtfs için ayrıştırılmış (dict) veri döndüren sahte istemci."""

    def get_duraklar(self):
        return [
            {"SDURAKKODU": "D1", "SDURAKADI": "Tuzla", "KOORDINAT": "29.30 40.81"},
            {"SDURAKKODU": "D2", "SDURAKADI": "Pendik", "KOORDINAT": "29.23 40.87"},
            {"SDURAKKODU": "D3", "SDURAKADI": "Kartal", "KOORDINAT": "29.18 40.90"},
        ]

    def get_hatlar(self):
        return [{"SHATKODU": "500T", "SHATADI": "Tuzla - Kartal", "SEFER_SURESI": "30"}]

    def durak_detay(self, hat_kodu):
        return [
            {"HATKODU": hat_kodu, "YON": "G", "SIRANO": "1", "DURAKKODU": "D1", "DURAKADI": "Tuzla"},
            {"HATKODU": hat_kodu, "YON": "G", "SIRANO": "2", "DURAKKODU": "D2", "DURAKADI": "Pendik"},
            {"HATKODU": hat_kodu, "YON": "G", "SIRANO": "3", "DURAKKODU": "D3", "DURAKADI": "Kartal"},
        ]

    def planlanan_sefer_saati(self, hat_kodu):
        return [
            {"SHATKODU": hat_kodu, "SYON": "G", "SGUNTIPI": "I", "DT": "06:00"},
            {"SHATKODU": hat_kodu, "SYON": "G", "SGUNTIPI": "I", "DT": "06:30"},
            {"SHATKODU": hat_kodu, "SYON": "G", "SGUNTIPI": "C", "DT": "07:00"},
        ]


class BuildGtfsTest(unittest.TestCase):
    def test_end_to_end_conversion(self):
        with tempfile.TemporaryDirectory() as tmp:
            summary = iett.build_gtfs(FakeClient(), tmp)
            self.assertEqual(summary["hatlar"], 1)
            self.assertEqual(summary["duraklar"], 3)

            feed = Feed.load(tmp)
            # rota: hat 500T, durak D1..D3
            self.assertIn("500T", feed.routes)
            self.assertEqual(feed.routes["500T"].route_type, 3)
            self.assertEqual(feed.stops["D1"].name, "Tuzla")
            # koordinat ayrıştırması
            self.assertAlmostEqual(feed.stops["D1"].lat, 40.81, places=2)

            # aktarmasız rota D1 -> D3
            j = routing.plan(feed, "D1", "D3")
            self.assertIsNotNone(j)
            self.assertEqual(j.transfers, 0)
            self.assertEqual(j.legs[0].route_id, "500T")

            # gerçek planlanan saate dayalı kalkışlar (SEFER_SURESI=30, 3 durak -> 15 dk hop)
            deps = feed.upcoming_departures("D1", 6 * 3600, limit=5)
            times = {iett.seconds_to_hhmmss(d.seconds)[:5] for d in deps}
            self.assertIn("06:00", times)
            d2 = feed.upcoming_departures("D2", 6 * 3600, limit=5)
            self.assertIn("06:15", {iett.seconds_to_hhmmss(d.seconds)[:5] for d in d2})


if __name__ == "__main__":
    unittest.main()
