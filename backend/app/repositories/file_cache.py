"""Gzipped JSON files on local disk: the processed-data cache for completed sessions."""

from __future__ import annotations

import gzip
import json
import os
import tempfile
from pathlib import Path
from typing import Any


class FileCache:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        safe = "/".join(part.replace("..", "_") for part in key.split("/"))
        return self.root / f"{safe}.json.gz"

    def get(self, key: str) -> Any | None:
        p = self._path(key)
        if not p.exists():
            return None
        with gzip.open(p, "rt", encoding="utf-8") as f:
            return json.load(f)

    def put(self, key: str, value: Any) -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=p.parent, suffix=".tmp")
        with os.fdopen(fd, "wb") as raw, gzip.open(raw, "wt", encoding="utf-8", compresslevel=5) as f:
            json.dump(value, f, separators=(",", ":"), allow_nan=False)
        os.replace(tmp, p)

    def exists(self, key: str) -> bool:
        return self._path(key).exists()
