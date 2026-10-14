"""Circuit archetypes for transfer learning across similar tracks."""

from __future__ import annotations

# 1=street 2=high-speed 3=low-grip/street-hybrid 4=technical 5=altitude/power
_CLUSTER: dict[str, int] = {
    "monaco": 1,
    "baku": 1,
    "singapore": 1,
    "miami": 1,
    "las vegas": 1,
    "jeddah": 2,
    "monza": 2,
    "spa": 2,
    "silverstone": 2,
    "suzuka": 4,
    "hungaroring": 4,
    "zandvoort": 4,
    "imola": 4,
    "barcelona": 4,
    "red bull ring": 5,
    "mexico": 5,
    "austin": 3,
    "interlagos": 3,
    "são paulo": 3,
    "melbourne": 3,
    "shanghai": 3,
}


def cluster_id(circuit: str | None, locality: str | None = None) -> float:
    text = f"{circuit or ''} {locality or ''}".lower()
    for key, cid in _CLUSTER.items():
        if key in text:
            return cid / 5.0
    return 0.5
