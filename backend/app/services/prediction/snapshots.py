"""Immutable forecast snapshots on disk."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.config import get_settings
from app.repositories.file_cache import FileCache


def _fc(event_id: str) -> FileCache:
    safe = event_id.replace("/", "_")
    return FileCache(get_settings().processed_dir / "prediction" / "snapshots" / safe)


def save(event_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    snap_id = payload.get("snapshot_id") or str(uuid.uuid4())
    payload = {**payload, "snapshot_id": snap_id}
    _fc(event_id).put(snap_id, {"saved_at": datetime.now(timezone.utc).timestamp(), "data": payload})
    return payload


def list_for_event(event_id: str) -> list[dict[str, Any]]:
    fc = _fc(event_id)
    out = []
    for path in fc.root.glob("*.json.gz"):
        key = path.name[: -len(".json.gz")]
        hit = fc.get(key)
        if hit:
            out.append(hit["data"])
    out.sort(key=lambda s: s.get("generated_at") or "", reverse=True)
    return out


def get(event_id: str, snapshot_id: str) -> dict[str, Any] | None:
    hit = _fc(event_id).get(snapshot_id)
    return hit["data"] if hit else None
