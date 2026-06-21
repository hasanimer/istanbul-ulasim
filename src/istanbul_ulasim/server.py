"""İstanbul ulaşım MCP sunucusu.

Araçlar (MCP tools):
  - hat_ara          : hatları ada/numaraya göre arar
  - durak_ara        : durakları ada göre arar
  - hat_duraklari    : bir hattın duraklarını sırasıyla listeler
  - durak_kalkislari : bir duraktan sonraki kalkışları (çizelgeden) listeler
  - rota_bul         : iki durak arası en az aktarmalı rota önerir
  - ag_ozeti         : yüklü GTFS verisinin özetini verir
  - entegre_hatlar   : bir hattın ücretsiz entegrasyon (aktarma) hatlarını verir
  - metro_duyurular  : Metro İstanbul raylı hat duyuruları (canlı; ağ gerekir)
  - metro_haritalari : Metro İstanbul resmî harita bağlantıları (canlı; ağ gerekir)
  - raylsistem_istasyon_ara : resmî raylı istasyonları gerçek koordinatla arar
  - raylsistem_hatlari : resmî raylı hatları (uzunluk/kapasite/durum) listeler

GTFS kaynağı varsayılan olarak gömülü örnek veridir. Gerçek İBB feed'i için:
  ISTANBUL_GTFS_PATH=/yol/feed_dizini  (ya da .zip)
  ISTANBUL_GTFS_URL=https://.../gtfs.zip
"""
from __future__ import annotations

import os
from datetime import datetime

from mcp.server.fastmcp import FastMCP

from . import geodata, metro, routing
from .gtfs import DEFAULT_DATA_DIR, Feed, parse_gtfs_time, seconds_to_hhmm
from .integrations import Integrations

mcp = FastMCP("istanbul-ulasim")

_feed: Feed | None = None
_integrations: Integrations | None = None
_metro_client: metro.MetroClient | None = None
_rail_data: geodata.RailData | None = None


def get_feed() -> Feed:
    """GTFS feed'ini (tembel) yükler ve önbelleğe alır."""
    global _feed
    if _feed is None:
        src = os.environ.get("ISTANBUL_GTFS_PATH") or os.environ.get("ISTANBUL_GTFS_URL")
        _feed = Feed.load(src or DEFAULT_DATA_DIR)
    return _feed


def get_integrations() -> Integrations:
    """Ücretsiz entegrasyon verisini (tembel) yükler ve önbelleğe alır."""
    global _integrations
    if _integrations is None:
        _integrations = Integrations.load()
    return _integrations


def get_metro_client() -> "metro.MetroClient":
    """Metro İstanbul API istemcisini (tembel) oluşturur ve önbelleğe alır."""
    global _metro_client
    if _metro_client is None:
        _metro_client = metro.MetroClient()
    return _metro_client


def get_rail_data() -> geodata.RailData:
    """İBB resmî raylı sistem istasyon/hat verisini (tembel) yükler."""
    global _rail_data
    if _rail_data is None:
        _rail_data = geodata.RailData.load()
    return _rail_data


def _stop_disambiguation(feed: Feed, query: str) -> str:
    matches = feed.search_stops(query)
    if not matches:
        return f"'{query}' için durak bulunamadı."
    lines = [f"'{query}' birden çok durakla eşleşiyor, lütfen netleştirin:"]
    for s in matches[:10]:
        lines.append(f"  • {s.name} (id: {s.stop_id})")
    return "\n".join(lines)


@mcp.tool()
def hat_ara(sorgu: str) -> str:
    """İstanbul toplu taşıma hatlarını ada veya numaraya göre arar.

    Örnekler: 'M2', 'metro', 'marmaray', 'metrobüs', 'tramvay'.
    """
    feed = get_feed()
    routes = feed.search_routes(sorgu)
    if not routes:
        return f"'{sorgu}' için hat bulunamadı."
    lines = [f"'{sorgu}' için {len(routes)} hat bulundu:"]
    for r in routes:
        lines.append(f"  • {r.short_name or r.route_id} — {r.long_name} "
                     f"[{r.type_name}] (id: {r.route_id})")
    return "\n".join(lines)


@mcp.tool()
def durak_ara(sorgu: str, limit: int = 20) -> str:
    """Durakları ada göre arar. Örnekler: 'Taksim', 'Üsküdar', 'Yenikapı'."""
    feed = get_feed()
    stops = feed.search_stops(sorgu)
    if not stops:
        return f"'{sorgu}' için durak bulunamadı."
    lines = [f"'{sorgu}' için {len(stops)} durak bulundu:"]
    for s in stops[:limit]:
        routes = ", ".join(r.short_name or r.route_id for r in feed.routes_for_stop(s.stop_id))
        lines.append(f"  • {s.name} (id: {s.stop_id}) — hatlar: {routes or '—'}")
    if len(stops) > limit:
        lines.append(f"  … ve {len(stops) - limit} durak daha.")
    return "\n".join(lines)


@mcp.tool()
def hat_duraklari(hat: str, yon: int = 0) -> str:
    """Bir hattın duraklarını sırasıyla listeler.

    hat: hat adı/numarası ya da id'si (örn. 'M2', 'Marmaray').
    yon: 0 ya da 1 (gidiş/dönüş).
    """
    feed = get_feed()
    route = feed.resolve_route(hat)
    if route is None:
        return f"'{hat}' hattı bulunamadı."
    pat = feed.pattern(route.route_id, yon)
    if pat is None:
        pat = feed.pattern(route.route_id, 0)
    if pat is None:
        return f"{route.display_name} için durak verisi yok."
    lines = [f"{route.short_name or route.route_id} — {route.long_name} "
             f"[{route.type_name}], yön {pat.direction_id} ({len(pat.stop_ids)} durak):"]
    for i, sid in enumerate(pat.stop_ids):
        name = feed.stops[sid].name if sid in feed.stops else sid
        mark = " ⇄ aktarma" if sid in feed.stops and len(feed.stops[sid].route_ids) > 1 else ""
        lines.append(f"  {i + 1:>2}. {name}{mark}")
    return "\n".join(lines)


@mcp.tool()
def durak_kalkislari(durak: str, saat: str = "", limit: int = 10) -> str:
    """Bir duraktan, verilen saatten sonraki kalkışları (çizelgeye göre) listeler.

    durak: durak adı ya da id'si.
    saat: 'HH:MM' biçiminde. Boş bırakılırsa şu anki saat kullanılır.
    """
    feed = get_feed()
    stop = feed.resolve_stop(durak)
    if stop is None:
        return _stop_disambiguation(feed, durak)

    if saat.strip():
        after = parse_gtfs_time(saat if saat.count(":") == 2 else saat + ":00")
        if after is None:
            return f"Saat biçimi anlaşılamadı: '{saat}'. 'HH:MM' kullanın."
        label = saat
    else:
        now = datetime.now()
        after = now.hour * 3600 + now.minute * 60
        label = now.strftime("%H:%M")

    deps = feed.upcoming_departures(stop.stop_id, after, limit=limit)
    if not deps:
        return f"{stop.name} için {label} sonrası kalkış bulunamadı."
    lines = [f"{stop.name} (id: {stop.stop_id}) — {label} sonrası kalkışlar:"]
    for d in deps:
        route = feed.routes.get(d.route_id)
        name = (route.short_name or route.route_id) if route else d.route_id
        lines.append(f"  {seconds_to_hhmm(d.seconds)}  {name} → {d.headsign}")
    return "\n".join(lines)


@mcp.tool()
def rota_bul(nereden: str, nereye: str, max_aktarma: int = 3) -> str:
    """İki durak arasında en az aktarmalı rotayı önerir.

    nereden / nereye: durak adı ya da id'si (örn. 'Üsküdar', 'Taksim').
    """
    feed = get_feed()
    origin = feed.resolve_stop(nereden)
    dest = feed.resolve_stop(nereye)
    if origin is None:
        return _stop_disambiguation(feed, nereden)
    if dest is None:
        return _stop_disambiguation(feed, nereye)
    if origin.stop_id == dest.stop_id:
        return "Kalkış ve varış durağı aynı."

    journey = routing.plan(feed, origin.stop_id, dest.stop_id, max_transfers=max_aktarma)
    if journey is None or not journey.legs:
        return (f"{origin.name} → {dest.name}: {max_aktarma} aktarmaya kadar "
                f"rota bulunamadı.")

    header = f"{origin.name} → {dest.name}"
    summary = f"{journey.transfers} aktarma, {journey.total_stops} durak"
    if journey.approx_minutes is not None:
        summary += f", ~{round(journey.approx_minutes)} dk"
    lines = [f"{header}  ({summary})", ""]
    for i, leg in enumerate(journey.legs, start=1):
        dur = f", ~{round(leg.approx_minutes)} dk" if leg.approx_minutes is not None else ""
        lines.append(f"  {i}. {leg.route_name} [{leg.route_type_name}]")
        lines.append(f"     {leg.board_stop_name} → {leg.alight_stop_name} "
                     f"({leg.num_stops} durak{dur})")
        if i < len(journey.legs):
            lines.append(f"     ↳ {leg.alight_stop_name} durağında aktarma")
    return "\n".join(lines)


@mcp.tool()
def ag_ozeti() -> str:
    """Yüklü GTFS verisinin özetini verir: kaynak, hat ve durak sayıları."""
    feed = get_feed()
    by_type: dict[str, int] = {}
    for r in feed.routes.values():
        by_type[r.type_name] = by_type.get(r.type_name, 0) + 1
    transfer_stops = sum(1 for s in feed.stops.values() if len(s.route_ids) > 1)
    lines = [
        "İstanbul ulaşım ağı özeti",
        f"  kaynak       : {feed.source_label}",
        f"  hat sayısı   : {len(feed.routes)}",
        f"  durak sayısı : {len(feed.stops)} ({transfer_stops} aktarma durağı)",
        f"  sefer deseni : {len(feed.patterns)}",
        "  hat türleri  : " + ", ".join(f"{k}: {v}" for k, v in sorted(by_type.items())),
    ]
    return "\n".join(lines)


@mcp.tool()
def entegre_hatlar(hat: str) -> str:
    """Bir hattın ücretsiz entegrasyon (ücretsiz aktarma) kapsamındaki hatlarını listeler.

    hat: hat kodu — metro/tramvay (örn. 'M5', 'M4', 'M2', 'T1'), besleme
         otobüsü (örn. 'UM62', 'KM31', 'MK97', 'HM1') ya da hat grubu
         ('TM', '50', 'ARN').

    Not: Besleme/entegrasyon otobüs hatları İETT verisindendir ve GTFS rota
    grafiğinde yer almaz; bu yalnızca ücretsiz aktarma bilgisidir.
    """
    integ = get_integrations()
    res = integ.query(hat)
    if res is None:
        return (f"'{hat}' için ücretsiz entegrasyon kaydı bulunamadı. "
                f"Örnek: M5, M4, UM62, MK97, TM, ARN.")

    yaka = f" [{', '.join(res.yaka)} Yakası]" if res.yaka else ""
    if res.kind == "group":
        lines = [f"{res.code} kodlu hatlar{yaka} — {len(res.members)} hat:",
                 "  " + ", ".join(res.members)]
        if res.internal_free:
            lines.append("  • Bu hatlar kendi aralarında ücretsiz aktarmalıdır.")
        if res.targets:
            lines.append("  Ücretsiz entegre olduğu hatlar:")
            for label, note in res.targets:
                suffix = f"  ({note})" if note else ""
                lines.append(f"    • {label}{suffix}")
        return "\n".join(lines)

    lines = [f"{res.code}{yaka} ile ücretsiz entegrasyon kapsamındaki hatlar:"]
    for label, note in res.targets:
        suffix = f"  ({note})" if note else ""
        lines.append(f"  • {label}{suffix}")
    return "\n".join(lines)


@mcp.tool()
def metro_duyurular(hat: str = "") -> str:
    """Metro İstanbul raylı hatlarına ait güncel duyuruları (kesinti/arıza) listeler.

    hat: opsiyonel — hat kodu/adıyla süzer (örn. 'M2'). Boşsa tüm duyurular.

    Not: **Canlı veri** — api.ibb.gov.tr'ye ağ erişimi gerekir. Duyuru endpoint
    yolu farklıysa METRO_ANNOUNCEMENTS_PATH ortam değişkeniyle ayarlanabilir.
    """
    try:
        anns = get_metro_client().get_announcements()
    except metro.MetroError as exc:
        return (f"Duyurular alınamadı: {exc}\n"
                "(Bu araç canlı ağ erişimi gerektirir; endpoint yolu farklıysa "
                "METRO_ANNOUNCEMENTS_PATH ayarlayın — bkz. api.ibb.gov.tr/MetroIstanbul/Help.)")
    if hat.strip():
        from .gtfs import fold
        q = fold(hat)
        anns = [a for a in anns
                if q in fold(" ".join(str(v) for v in a.values()))]
    if not anns:
        return f"{'Bu hatta ' if hat.strip() else ''}güncel duyuru bulunamadı."
    lines = [f"Metro İstanbul duyuruları ({len(anns)}):"]
    lines.extend(f"  • {metro.format_announcement(a)}" for a in anns[:30])
    return "\n".join(lines)


@mcp.tool()
def metro_haritalari(yalnizca_aktif: bool = False) -> str:
    """Metro İstanbul resmî raylı sistem haritalarını (PDF/görsel bağlantıları) listeler.

    yalnizca_aktif: True ise yalnızca güncel (aktif) haritaları döndürür.

    Not: **Canlı veri** — api.ibb.gov.tr'ye ağ erişimi gerekir. Endpoint yolu
    farklıysa METRO_MAPS_PATH ortam değişkeniyle ayarlanabilir.
    """
    try:
        maps = get_metro_client().get_maps()
    except metro.MetroError as exc:
        return (f"Haritalar alınamadı: {exc}\n"
                "(Canlı ağ erişimi gerekir; endpoint farklıysa METRO_MAPS_PATH ayarlayın.)")
    if yalnizca_aktif:
        maps = [m for m in maps if m.get("IsActive")]
    maps = sorted(maps, key=lambda m: (not m.get("IsActive"), m.get("Order") or 0))
    if not maps:
        return "Harita bulunamadı."
    lines = [f"Metro İstanbul haritaları ({len(maps)}):"]
    lines.extend(f"  • {metro.format_map(m)}" for m in maps[:30])
    return "\n".join(lines)


@mcp.tool()
def raylsistem_istasyon_ara(ad: str = "", hat: str = "", tur: str = "",
                            asama: str = "", limit: int = 25) -> str:
    """İBB resmî raylı sistem istasyonlarını **gerçek koordinatlarıyla** arar.

    ad: istasyon adı (örn. 'Taksim'); hat: hat adı (örn. 'M4', 'Marmaray');
    tur: 'Metro' / 'Tramvay' / 'Banliyö' / 'Füniküler' / 'Teleferik';
    asama: 'mevcut' (açık) ya da 'inşaat' (yapım aşamasındaki istasyonlar).

    Gömülü GTFS ağından ayrı, resmî bir referanstır (yapım durumu + koordinat dahil).
    """
    rail = get_rail_data()
    found = rail.search_stations(ad=ad, hat=hat, tur=tur, asama=asama)
    if not found:
        return "Eşleşen istasyon bulunamadı."
    lines = [f"{len(found)} istasyon bulundu:"]
    for s in found[:limit]:
        coord = (f"({s.lat:.5f}, {s.lon:.5f})"
                 if s.lat is not None and s.lon is not None else "")
        insaat = " — İNŞAAT" if s.under_construction else ""
        lines.append(f"  • {s.name} — {s.line} [{s.type}{insaat}] {coord}")
    if len(found) > limit:
        lines.append(f"  … ve {len(found) - limit} istasyon daha.")
    return "\n".join(lines)


@mcp.tool()
def raylsistem_hatlari(tur: str = "") -> str:
    """İBB resmî raylı sistem hatlarını (uzunluk, kapasite, durum) listeler.

    tur: opsiyonel — 'Metro' / 'Tramvay' / 'Banliyö' / 'Füniküler' / 'Teleferik'.
    """
    rail = get_rail_data()
    found = rail.search_lines(tur=tur)
    if not found:
        return "Eşleşen hat bulunamadı."
    lines = [f"{len(found)} raylı sistem hattı:"]
    for ln in found:
        uz = f"{ln.length_km} km" if ln.length_km else "—"
        lines.append(f"  • {ln.short_name or ln.name} [{ln.type}] "
                     f"uzunluk: {uz}, durum: {ln.stage}")
    return "\n".join(lines)


def main() -> None:
    """MCP sunucusunu stdio üzerinden çalıştırır."""
    mcp.run()


if __name__ == "__main__":
    main()
