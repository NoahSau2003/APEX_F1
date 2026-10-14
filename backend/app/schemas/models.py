"""Response schemas. Every dataset response carries `source` (provenance) and
`cache` (where the server got it) so the UI can show a data-source indicator."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Source(BaseModel):
    provider: str
    origin: str | None = None
    calculated: bool | None = None
    note: str | None = None
    model_config = {"extra": "allow"}


class CacheInfo(BaseModel):
    served_from: str
    processed_at: str | None = None


class Dataset(BaseModel, Generic[T]):
    session_id: str
    rows: list[T]
    source: Source
    cache: CacheInfo


class Health(BaseModel):
    status: str
    version: str
    fastf1_version: str
    cache_dir: str


class SessionRef(BaseModel):
    id: str
    session_key: int | None
    name: str
    code: str | None
    kind: str
    date_utc: str | None
    status: str
    replay_available: bool
    unavailable_reason: str | None


class Meeting(BaseModel):
    id: str
    meeting_key: int | None
    year: int
    round: int
    name: str
    official_name: str
    country: str
    location: str
    date: str | None
    format: str
    sessions: list[SessionRef]


class DriverRow(BaseModel):
    driver_number: str
    abbreviation: str | None
    first_name: str | None
    last_name: str | None
    full_name: str | None
    broadcast_name: str | None
    team_name: str | None
    team_id: str | None
    driver_id: str | None
    team_color: str
    team_color_official: bool
    country_code: str | None
    headshot_url: str | None


class ResultRow(BaseModel):
    driver_number: str
    position: int | None
    classified_position: str | None
    grid: int | None
    status: str | None
    time: float | None
    points: float | None
    laps: int | None
    q1: float | None
    q2: float | None
    q3: float | None
    best_lap: float | None


class LapRow(BaseModel):
    driver_number: str
    lap: int | None
    start: float | None
    end: float | None
    lap_time: float | None
    s1: float | None
    s2: float | None
    s3: float | None
    s1_end: float | None
    s2_end: float | None
    compound: str | None
    tyre_life: int | None
    stint: int | None
    pit_in: float | None
    pit_out: float | None
    position: int | None
    track_status: str | None
    deleted: bool
    personal_best: bool
    speed_trap: float | None


class StintRow(BaseModel):
    driver_number: str
    stint: int
    compound: str | None
    lap_start: int | None
    lap_end: int | None
    tyre_life_start: int | None
    fresh: bool | None


class PitRow(BaseModel):
    driver_number: str
    lap: int | None
    time: float | None
    lane_duration: float | None
    stop_duration: float | None


class WeatherRow(BaseModel):
    time: float | None
    air_temp: float | None
    track_temp: float | None
    humidity: float | None
    pressure: float | None
    rainfall: bool | None
    wind_direction: int | None
    wind_speed: float | None


class RaceControlRow(BaseModel):
    time: float | None
    category: str | None
    flag: str | None
    scope: str | None
    sector: int | None
    driver_number: str | None
    lap: int | None
    message: str | None


class TrackStatusRow(BaseModel):
    time: float | None
    status: str | None
    message: str | None


class PositionRow(BaseModel):
    driver_number: str
    lap: int
    position: int
    time: float | None


class Locations(BaseModel):
    session_id: str
    start: float
    end: float
    time_unit: str
    coordinate_unit: str
    drivers: dict[str, dict[str, list[int]]]
    source: Source
    cache: CacheInfo


class Telemetry(BaseModel):
    session_id: str
    driver_number: str
    start: float
    end: float
    lap: int | None
    time_unit: str
    channels: dict[str, list[Any]]
    units: dict[str, str]
    source: Source
    cache: CacheInfo
