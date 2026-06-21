"""Basit, aktarma sayısını en aza indiren rota motoru.

Yaklaşım: "biniş" grafiği üzerinde genişlik öncelikli arama (BFS). Her seviye
bir kez daha hatta binmeye karşılık gelir; böylece bulunan ilk rota en az
aktarmalı rotadır. Zaman bağımlı tam bir planlayıcı değildir (RAPTOR/CSA gibi),
fakat "hangi hatlarla giderim" sorusuna sağlam bir yanıt verir.

Aktarma noktaları, aynı stop_id'yi paylaşan duraklarla modellenir (örn.
Yenikapı'da M1B/M2/Marmaray). Gerçek GTFS feed'inde paylaşılan istasyon
kimlikleri ya da transfers.txt bu işlevi sağlar.
"""
from __future__ import annotations

from dataclasses import dataclass

from .gtfs import Feed

TRANSFER_PENALTY_MIN = 5.0  # her aktarma için yaklaşık yürüme/bekleme süresi


@dataclass
class Leg:
    route_id: str
    route_name: str
    route_type_name: str
    board_stop_id: str
    board_stop_name: str
    alight_stop_id: str
    alight_stop_name: str
    num_stops: int
    approx_minutes: float | None


@dataclass
class Journey:
    legs: list[Leg]

    @property
    def transfers(self) -> int:
        return max(0, len(self.legs) - 1)

    @property
    def total_stops(self) -> int:
        return sum(leg.num_stops for leg in self.legs)

    @property
    def approx_minutes(self) -> float | None:
        if any(leg.approx_minutes is None for leg in self.legs):
            return None
        ride = sum(leg.approx_minutes or 0 for leg in self.legs)
        return ride + self.transfers * TRANSFER_PENALTY_MIN


def plan(feed: Feed, origin_id: str, dest_id: str,
         max_transfers: int = 3) -> Journey | None:
    """origin_id'den dest_id'ye en az aktarmalı rotayı döndürür (yoksa None)."""
    if origin_id == dest_id:
        return Journey(legs=[])
    if origin_id not in feed.stops or dest_id not in feed.stops:
        return None

    # visited: stop_id -> (önceki_stop, pattern_index, board_pos, alight_pos)
    visited: dict[str, tuple[str, int, int, int] | None] = {origin_id: None}
    frontier = [origin_id]

    for _ in range(max_transfers + 1):
        if dest_id in visited:
            break
        next_frontier: list[str] = []
        for stop in frontier:
            for pidx, pos in feed.stop_to_patterns.get(stop, []):
                pat = feed.patterns[pidx]
                for j in range(pos + 1, len(pat.stop_ids)):
                    nxt = pat.stop_ids[j]
                    if nxt not in visited:
                        visited[nxt] = (stop, pidx, pos, j)
                        next_frontier.append(nxt)
        if not next_frontier:
            break
        frontier = next_frontier

    if dest_id not in visited:
        return None

    legs: list[Leg] = []
    cur = dest_id
    while visited[cur] is not None:
        prev, pidx, bpos, apos = visited[cur]  # type: ignore[misc]
        pat = feed.patterns[pidx]
        route = feed.routes.get(pat.route_id)
        if pat.cum_minutes:
            approx = pat.cum_minutes[apos] - pat.cum_minutes[bpos]
        else:
            approx = None
        legs.append(Leg(
            route_id=pat.route_id,
            route_name=route.display_name if route else pat.route_id,
            route_type_name=route.type_name if route else "",
            board_stop_id=prev,
            board_stop_name=feed.stops[prev].name,
            alight_stop_id=cur,
            alight_stop_name=feed.stops[cur].name,
            num_stops=apos - bpos,
            approx_minutes=approx,
        ))
        cur = prev
    legs.reverse()
    return Journey(legs=legs)
