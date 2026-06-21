"""İETT ücretsiz entegrasyon (besleme hattı) verisi.

Belirli otobüs hatlarının hangi metro/tramvay/otobüs hatlarıyla ücretsiz
aktarma kapsamında olduğunu modellenir. Bu besleme hatları GTFS rota
grafiğinde YER ALMAZ; yalnızca ücretsiz aktarma referansıdır.

Veri data/integrations.json içinde; bu modül onu çift yönlü bir sorgu
dizinine dönüştürür. Hat grupları (TM, 50, ARN gibi kodlu hat aileleri)
ayrıca toplu sorgulanabilir.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from .gtfs import fold

DEFAULT_INTEGRATIONS = Path(__file__).parent / "data" / "integrations.json"


@dataclass
class IntegrationResult:
    code: str                      # sorgulanan hattın görünen adı
    kind: str                      # "line" | "group"
    yaka: list[str] = field(default_factory=list)
    # (etiket, not) — etiket gerçek bir hat ya da "TM kodlu hatlar" gibi grup olabilir
    targets: list[tuple[str, str]] = field(default_factory=list)
    members: list[str] = field(default_factory=list)   # "group" türünde üyeler
    internal_free: bool = False                        # grup kendi içinde ücretsiz mi


class Integrations:
    def __init__(self) -> None:
        self.groups: dict[str, list[str]] = {}
        self.adj: dict[str, dict[str, str]] = {}   # fold(kod) -> {hedef_görünen: not}
        self.display: dict[str, str] = {}          # fold(kod) -> görünen ad
        self.yaka: dict[str, set[str]] = {}        # fold(kod) -> {yaka}
        self._group_by_fold: dict[str, str] = {}   # fold(grup adı) -> grup adı

    @classmethod
    def load(cls, path: str | Path = DEFAULT_INTEGRATIONS) -> "Integrations":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        obj = cls()
        obj.groups = {k: v for k, v in data.get("groups", {}).items()}
        obj._group_by_fold = {fold(name): name for name in obj.groups}
        for rec in data.get("records", []):
            obj._add_record(rec)
        return obj

    def _link(self, a: str, b: str, note: str, yaka: str) -> None:
        ka = fold(a)
        self.display.setdefault(ka, a)
        self.yaka.setdefault(ka, set())
        if yaka:
            self.yaka[ka].add(yaka)
        slot = self.adj.setdefault(ka, {})
        if b not in slot or (note and not slot.get(b)):
            slot[b] = note

    def _add_record(self, rec: dict) -> None:
        yaka = rec.get("yaka", "")
        note = rec.get("note", "")
        lines = rec.get("lines", [])
        real_targets = rec.get("with", [])
        group_targets = [f"@{g}" for g in rec.get("with_groups", [])]
        for a in lines:
            for b in real_targets:
                if fold(a) == fold(b):
                    continue
                self._link(a, b, note, yaka)   # gerçek hatlar çift yönlü listelenir
                self._link(b, a, note, yaka)
            for g in group_targets:
                self._link(a, g, note, yaka)   # gruplara yalnızca tek yön (sorguda açılır)

    # ---- yardımcılar ------------------------------------------------------
    def _expand_token(self, token: str) -> str:
        """'@TM' -> 'TM kodlu hatlar (19)'. Gerçek hatlar olduğu gibi döner."""
        if token.startswith("@"):
            name = token[1:]
            n = len(self.groups.get(name, []))
            return f"{name} kodlu hatlar ({n})"
        return token

    @staticmethod
    def _sort_key(label: str) -> tuple:
        # Metro/tramvay hatlarını öne al, sonra alfabetik
        is_group = "kodlu hatlar" in label
        is_rail = label[:1] in ("M", "T") and not is_group
        return (0 if is_rail else 1, label)

    def query(self, code: str) -> IntegrationResult | None:
        key = fold(code)
        # Grup adı mı? (TM, 50, ARN)
        if key in self._group_by_fold:
            return self._query_group(self._group_by_fold[key])
        if key not in self.adj:
            return None
        targets: list[tuple[str, str]] = []
        for b, note in self.adj[key].items():
            targets.append((self._expand_token(b), note))
        targets.sort(key=lambda t: self._sort_key(t[0]))
        return IntegrationResult(
            code=self.display.get(key, code),
            kind="line",
            yaka=sorted(self.yaka.get(key, set())),
            targets=targets,
        )

    def _query_group(self, name: str) -> IntegrationResult:
        members = self.groups[name]
        member_folds = {fold(m) for m in members}
        external: dict[str, str] = {}
        internal = False
        yaka: set[str] = set()
        for m in members:
            km = fold(m)
            yaka |= self.yaka.get(km, set())
            for b, note in self.adj.get(km, {}).items():
                if b == f"@{name}":
                    internal = True
                    continue
                if fold(b) in member_folds:
                    continue
                if b not in external or (note and not external[b]):
                    external[b] = note
        targets = [(self._expand_token(b), note) for b, note in external.items()]
        targets.sort(key=lambda t: self._sort_key(t[0]))
        return IntegrationResult(
            code=name,
            kind="group",
            yaka=sorted(yaka),
            targets=targets,
            members=list(members),
            internal_free=internal,
        )
