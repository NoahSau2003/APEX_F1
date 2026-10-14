from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime configuration. Override with environment variables or backend/.env."""

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_prefix="APEX_", extra="ignore")

    data_dir: Path = BACKEND_DIR / "data"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    http_timeout_s: float = 20.0
    http_retries: int = 3
    openf1_base_url: str = "https://api.openf1.org/v1"
    jolpica_base_url: str = "https://api.jolpi.ca/ergast/f1"
    livetiming_base_url: str = "https://livetiming.formula1.com/static"
    first_season: int = 2018
    # Location and telemetry windows are capped so a single response stays small.
    max_window_s: int = 1800
    location_chunk_s: int = 600
    # Loaded FastF1 sessions are large; keep only a few in memory.
    max_loaded_sessions: int = 2

    @property
    def fastf1_cache_dir(self) -> Path:
        return self.data_dir / "fastf1-cache"

    @property
    def processed_dir(self) -> Path:
        return self.data_dir / "processed"

    @property
    def http_cache_dir(self) -> Path:
        return self.data_dir / "http-cache"


@lru_cache
def get_settings() -> Settings:
    return Settings()
