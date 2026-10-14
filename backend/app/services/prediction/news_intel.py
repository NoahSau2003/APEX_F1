"""Filter and annotate RSS items for a specific upcoming event."""

from __future__ import annotations

import re

from app.services import news_service


def _tokens(text: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) > 2}


def for_event(*, event_name: str, location: str | None, country: str | None, limit: int = 30) -> dict:
    feed = news_service.news()
    needles = _tokens(f"{event_name} {location or ''} {country or ''}")
    items = []
    for item in feed.get("items") or []:
        hay = _tokens(f"{item.get('title', '')} {item.get('summary', '')}")
        overlap = needles & hay
        rel = len(overlap) / max(len(needles), 1)
        if rel < 0.15 and not any(n in (item.get("title") or "").lower() for n in ("penalty", "grid", "substitute", "injury", "upgrade")):
            continue
        used_in_model = bool(
            item.get("status") == "confirmed"
            and any(k in hay for k in ("penalty", "substitute", "withdraw", "dns", "dsq", "grid penalty"))
        )
        items.append(
            {
                **item,
                "relevance_score": round(rel, 3),
                "matched_tokens": sorted(overlap)[:8],
                "used_in_model": used_in_model,
                "context_only": not used_in_model,
            }
        )
    items.sort(key=lambda i: (i.get("relevance_score", 0), i.get("published") or ""), reverse=True)
    return {
        "fetched_at": feed.get("fetched_at"),
        "source": feed.get("source"),
        "items": items[:limit],
    }
