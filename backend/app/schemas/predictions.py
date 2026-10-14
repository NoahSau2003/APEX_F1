from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

PredictionStage = Literal["pre-qualifying", "post-qualifying", "pre-race"]


class PredictRequest(BaseModel):
    stage: PredictionStage = "pre-qualifying"


class UpcomingRace(BaseModel):
    event_id: str
    meeting_key: int | None = None
    year: int
    round: int
    name: str
    official_name: str | None = None
    country: str | None = None
    location: str | None = None
    circuit: str | None = None
    race_start_utc: str
    format: str | None = None
    stages: dict[str, bool]
    calendar_source: str | None = None

    model_config = ConfigDict(extra="ignore")


class UpcomingRacesResponse(BaseModel):
    fetched_at: str
    server_time_utc: str
    races: list[UpcomingRace]


class DriverPredictionOut(BaseModel):
    driver_id: str
    code: str | None = None
    given_name: str
    family_name: str
    constructor_id: str
    constructor: str
    team_color: str | None = None
    predicted_position: int
    expected_position: float
    win_probability: float
    podium_probability: float
    top10_probability: float
    explanation: list[dict[str, Any]] = Field(default_factory=list)
    features: dict[str, float] = Field(default_factory=dict)


class ForecastSnapshot(BaseModel):
    snapshot_id: str
    event_id: str
    stage: PredictionStage
    generated_at: str
    cutoff_utc: str
    model: dict[str, Any]
    grid_source: str
    drivers: list[DriverPredictionOut]
    weather: dict[str, Any]
    news: dict[str, Any]
    warnings: list[str] = Field(default_factory=list)
    sources: dict[str, Any] = Field(default_factory=dict)
    feature_names: list[str] = Field(default_factory=list)
