"""Public RSS headlines with deterministic keyword classification.

Only the headline, publication time, a short plain-text summary and the link are
kept; the full article stays with its publisher. Classification is a transparent
keyword rule set (no language model); every matched term is returned.
"""

from __future__ import annotations

import html
import re
import time
from datetime import datetime, timezone

import feedparser

from app.core.config import get_settings
from app.providers import http
from app.repositories.file_cache import FileCache

FEEDS = [
    {"id": "f1", "name": "Formula1.com", "url": "https://www.formula1.com/en/latest/all.xml"},
    {"id": "motorsport", "name": "Motorsport.com", "url": "https://www.motorsport.com/rss/f1/news/"},
    {"id": "bbc", "name": "BBC Sport", "url": "https://feeds.bbci.co.uk/sport/formula1/rss.xml"},
    {"id": "the-race", "name": "The Race", "url": "https://www.the-race.com/category/formula-1/feed/"},
]

COMPONENT_RULES: dict[str, list[str]] = {
    "front-wing": ["front wing", "endplate", "nose"],
    "rear-wing": ["rear wing", "beam wing", "drs"],
    "floor": ["floor", "diffuser", "ride height", "porpoising", "plank"],
    "suspension": ["suspension", "wishbone", "pushrod", "pullrod"],
    "cooling": ["cooling", "louvre", "brake duct", "overheating"],
    "power-unit": ["power unit", "engine", "turbo", "mgu-k", "mgu-h", "energy store", "battery", "gearbox"],
    "reliability": ["reliability", "failure", "retire", "hydraulic", "grid penalty", "dnf"],
    "sidepods": ["sidepod", "engine cover", "bodywork"],
    "upgrade": ["upgrade", "update package", "new parts", "development", "aero package"],
    "tyres": ["tyre", "tire", "pirelli", "compound"],
    "regulations": ["regulation", "fia", "technical directive", "rules", "2026 rules"],
}

STATUS_RULES: dict[str, list[str]] = {
    "confirmed": ["confirmed", "confirms", "announced", "announces", "official"],
    "reported": ["understood", "according to", "reportedly", "set to", "expected to", "could", "rumour", "linked"],
}

TEAM_RULES: dict[str, list[str]] = {
    "red_bull": ["red bull"],
    "ferrari": ["ferrari"],
    "mercedes": ["mercedes"],
    "mclaren": ["mclaren"],
    "aston_martin": ["aston martin"],
    "alpine": ["alpine"],
    "williams": ["williams"],
    "rb": ["racing bulls", "visa cash app", "alphatauri"],
    "sauber": ["sauber", "kick sauber", "audi"],
    "haas": ["haas"],
    "cadillac": ["cadillac"],
}

_TAG = re.compile(r"<[^>]+>")


def _clean(text: str, limit: int = 280) -> str:
    t = html.unescape(_TAG.sub(" ", text or ""))
    t = re.sub(r"\s+", " ", t).strip()
    return t if len(t) <= limit else t[: limit - 1].rsplit(" ", 1)[0] + "…"


def _match(text: str, rules: dict[str, list[str]]) -> dict[str, list[str]]:
    out = {}
    for rule, terms in rules.items():
        hit = [t for t in terms if re.search(rf"\b{re.escape(t)}", text)]
        if hit:
            out[rule] = hit
    return out


def classify(title: str, summary: str) -> dict:
    text = f"{title} {summary}".lower()
    comps = _match(text, COMPONENT_RULES)
    status = _match(text, STATUS_RULES)
    teams = _match(text, TEAM_RULES)
    technical = any(k in comps for k in ("front-wing", "rear-wing", "floor", "suspension", "cooling", "power-unit", "sidepods", "upgrade"))
    return {
        "components": sorted(comps),
        "teams": sorted(teams),
        "status": "confirmed" if "confirmed" in status and "reported" not in status else "reported" if "reported" in status else "unclassified",
        "technical": technical,
        "rules_fired": [{"rule": f"component.{k}", "terms": v} for k, v in comps.items()]
        + [{"rule": f"status.{k}", "terms": v} for k, v in status.items()]
        + [{"rule": f"team.{k}", "terms": v} for k, v in teams.items()],
    }


def _fetch(feed: dict) -> dict:
    try:
        r = http.get(feed["url"])
        parsed = feedparser.parse(r.content)
    except Exception as e:  # one broken feed must not hide the others
        return {"feed": feed, "ok": False, "error": str(e), "items": []}
    items = []
    for e in parsed.entries[:40]:
        published = None
        for k in ("published_parsed", "updated_parsed"):
            if e.get(k):
                published = datetime(*e[k][:6], tzinfo=timezone.utc).isoformat()
                break
        title = _clean(e.get("title", ""), 200)
        summary = _clean(e.get("summary", ""))
        if not title or not e.get("link"):
            continue
        items.append(
            {
                "id": f"{feed['id']}:{e.get('id') or e.get('link')}",
                "title": title,
                "summary": summary,
                "link": e["link"],
                "published": published,
                "source": feed["name"],
                "source_id": feed["id"],
                **classify(title, summary),
            }
        )
    return {"feed": feed, "ok": True, "error": None, "items": items}


def news(max_age_s: float = 1800) -> dict:
    fc = FileCache(get_settings().http_cache_dir / "rss")
    hit = fc.get("all")
    if hit and time.time() - hit["fetched_at"] < max_age_s:
        data = hit["data"]
    else:
        results = [_fetch(f) for f in FEEDS]
        data = {
            "feeds": [{"id": r["feed"]["id"], "name": r["feed"]["name"], "url": r["feed"]["url"], "ok": r["ok"], "error": r["error"], "count": len(r["items"])} for r in results],
            "items": sorted([i for r in results for i in r["items"]], key=lambda i: i["published"] or "", reverse=True),
        }
        if any(r["ok"] for r in results) or not hit:
            fc.put("all", {"fetched_at": time.time(), "data": data})
        else:
            data = hit["data"]
    return {
        **data,
        "fetched_at": datetime.fromtimestamp((hit if hit and data is hit["data"] else {"fetched_at": time.time()})["fetched_at"], timezone.utc).isoformat(),
        "rules": {"components": COMPONENT_RULES, "status": STATUS_RULES, "teams": TEAM_RULES},
        "source": {"provider": "Public RSS feeds", "note": "Headlines and summaries belong to their publishers; links open the original article."},
    }
