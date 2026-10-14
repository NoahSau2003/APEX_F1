# Apex — F1 historical data & replay

A local application for exploring real historical Formula 1 sessions: results, lap timing, car telemetry, race control, and a 3D replay of every car's recorded position on a circuit derived from the same session's data.

Everything runs on your machine and uses free data sources only. No accounts, API keys, paid services or cloud infrastructure. **No live data and no machine learning** in this milestone.

```
F1Application/
├── backend/    FastAPI + FastF1 historical data API (Python)
└── frontend/   React + Vite + Three.js application (TypeScript)
```

## Setup

Requirements: Python 3.11+ and Node.js 20+.

**Terminal 1 — backend**

```bash
cd backend
python3 -m venv .venv          # Python 3.12.7 (Anaconda) is the default python3 here
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

To keep Anaconda out of it, Homebrew's Python works too: `/opt/homebrew/bin/python3.11 -m venv .venv`.
Everything is installed inside `backend/.venv`; nothing goes into Anaconda's base environment or system Python.

**Terminal 2 — frontend**

```bash
cd frontend
cp .env.example .env           # VITE_API_BASE_URL=http://localhost:8000/api/v1
npm install
npm run dev
```

| | URL |
|---|---|
| App | http://localhost:5173 |
| API | http://localhost:8000/api/v1 |
| API docs (Swagger) | http://localhost:8000/docs |

The first time a session is opened, the backend downloads it with FastF1 and processes it (typically 15–40 s; the app shows a "Preparing…" state). Afterwards it is served from the local cache in `backend/data/` (about 5–10 MB per race).

## Tests

```bash
cd backend && source .venv/bin/activate && python -m pytest -q     # 15 tests (APEX_SKIP_INTEGRATION=1 skips network-backed ones)
cd frontend && npm test && npm run build                           # 16 replay/coordinate/timing tests + type-check and production build
```

## Data sources and terms

| Source | Used for | Access | Notes |
|---|---|---|---|
| [FastF1](https://docs.fastf1.dev/) (MIT) reading the Formula 1 live-timing archive | Schedules, session results, laps, sectors, tyres, **position samples**, **car telemetry**, weather, race control, track status, team colours, circuit corner markers/rotation (MultiViewer) | Free, no key | Detailed timing from 2018. FastF1 caches downloads in `backend/data/fastf1-cache`. |
| [OpenF1](https://openf1.org/docs/) historical API | Session keys (2023+), pit-lane and stationary times | Free for historical data, no key | Real-time data requires a paid subscription and is **not used**. Coverage starts in 2023. |
| [Jolpica-F1](https://github.com/jolpica/jolpica-f1) (Ergast-compatible) | Season race/sprint results and official standings | Free, rate-limited (the backend paces requests) | Community-run successor of the Ergast API. |
| Public RSS: Formula1.com, Motorsport.com, BBC Sport, The Race | Technical Intelligence headlines | Public feeds | Only headline, short summary, date and link are shown; articles belong to their publishers. |

This project is unofficial and is not associated with Formula 1 companies. F1, FORMULA ONE and related marks are trademarks of Formula One Licensing B.V. Timing data is the property of its rights holders and is used here for personal, non-commercial analysis.

### Identifiers

Sessions and meetings use the **official F1 live-timing keys**, which are the same as OpenF1's `session_key` / `meeting_key` (e.g. 2024 Italian GP race = `9590`). Keys come from OpenF1 (2023+) and F1's yearly `Index.json` / per-session `SessionInfo.json` (earlier years). F1 publishes no key index for 2022 and most 2022 `SessionInfo.json` files return 403. Those sessions are addressed by FastF1's own season/round/session triple, e.g. `2022-10-R`, and are fully replayable.

### Provenance shown in the app

- Every dataset response includes `source` (provider, whether the value is **calculated**, formula note) and `cache` (served from the local processed cache, with processing time). The UI shows this as a source badge.
- Calculated values are labelled: gaps/intervals in the timing tower (difference of line-crossing times), practice classification (ranked by fastest lap), season points totals, averages, places gained, race pace, pit-lane time before 2023 (next lap's `PitOutTime − PitInTime`).
- The Race Predictions page is the earlier prototype's **illustrative demo** with fictional teams. It is clearly labelled and not connected to the historical data.

## How the replay works

### Circuit geometry (backend `app/services/track_geometry.py`)

1. Take every **clean lap** in the session (green flag, no pit in/out, accurate timing, not deleted) from **all drivers**, and their raw position samples (FastF1 `pos_data`, X/Y in 1/10 m).
2. Resample each lap by arc length to 1,000 points and take the per-index median, giving the initial centreline.
3. Refine three times: assign every recorded sample to its nearest centreline vertex, and move each vertex to the median of its samples.
4. Apply a light 5-vertex circular moving average (~25 m), which removes median jitter without reshaping corners.
5. Validate. Each check below is a threshold the circuit must pass to be marked *validated*:
   - Scale: centreline length vs. the median lap distance integrated from recorded speed (independent of X/Y) must be within 0.97–1.03.
   - Residuals: 95th-percentile distance of all recorded samples to the centreline ≤ 20 m.
   - Direction: ≥ 97 % of consecutive samples advance along the centreline.
   - Closure gap ≤ 30 m.
   - Lap-start positions lie near the centreline start (the timing line).
   - Reported for information: distance of FastF1/MultiViewer corner markers from the line.

If fewer than three clean laps exist, the track is reported unavailable instead of guessed. The live-timing position feed places cars on a racing line (not their lateral position), which is why residuals are below about 1.5 m.

### Coordinate transformation (frontend `src/replay/coordinates.ts`)

One similarity transform per session, applied identically to the track, every driver and the debug overlay:
- decimetres → metres
- translate to the circuit centre
- rotate by the official display rotation (FastF1 `circuit_info.rotation`)
- map source Y to scene −Z

There is no per-driver or per-timestamp normalisation, and no non-uniform scaling. Elevation (Z) is ignored, so the scene is flat. Unit tests check distance preservation and handedness.

### Playback (frontend `src/replay/engine.ts`, `clock.ts`, `loader.ts`)

- Location samples are downloaded per 10-minute window, starting nearest the replay clock, and only for the selected session. Switching session aborts downloads and clears the previous session's samples before the new one appears.
- Each driver's samples keep their **original timestamps** (FastF1 SessionTime, ms). At replay time *t*, a marker is drawn at the exact sample if *t* hits one. Otherwise its position is linearly interpolated between the two adjacent real samples when they are < 2 s apart. This is a rendering step only; the tooltip says "between recorded samples".
- Across a larger gap the driver is **not** moved. The dot stays faded at its last real sample with "No samples since …". Outside a driver's recorded span the dot is hidden.
- Telemetry readouts show the latest recorded car-data sample at or before *t* (never interpolated) and its age; nothing is shown if it is older than 2 s.
- Scrubbing pauses playback; it resumes only when Play is pressed. Speeds: 0.5× to 30×.
- Animation runs on `requestAnimationFrame` with instanced meshes. React panels update at 4–10 Hz.

**Debug view:** the bug button in the replay toggles an overlay of recorded samples (mapped) and the derived centreline. *Mapping report* shows the same points in the raw source frame with all validation metrics.

## Verified sessions

Each was processed end to end and its track validated (thresholds above). Shapes for Monza, Suzuka, Baku, Las Vegas and Monaco were also checked visually against their known layouts, including the Suzuka crossover and corner order. The replay, hover, selection, scrubbing, speed, reset and session switching were exercised in the browser on the 2024 Italian GP.

| Session | ID | Length (m) | Scale ratio | p95 residual (m) | Forward | Laps used |
|---|---|---|---|---|---|---|
| 2026 Singapore GP — Race | 11388 | 4,850 | 0.9998 | 0.90 | 99.98 % | 400 |
| 2025 Monaco GP — Race | 9979 | 3,264 | 1.0008 | 0.64 | 99.97 % | 400 |
| 2025 Australian GP — Race (wet) | 9693 | 5,233 | 1.0036 | 0.69 | 99.98 % | 400 |
| 2024 Italian GP — Race | 9590 | 5,754 | 1.0060 | 0.71 | 99.99 % | 400 |
| 2024 São Paulo GP — Sprint | 9635 | 4,226 | 1.0057 | 0.57 | 99.98 % | 377 |
| 2024 Las Vegas GP — Practice 2 | 9638 | 6,140 | 1.0037 | 1.15 | 99.97 % | 265 |
| 2023 Japanese GP — Qualifying | 9169 | 5,761 | 1.0001 | 0.99 | 99.93 % | 70 |
| 2022 British GP — Race | 2022-10-R | 5,816 | 1.0050 | 0.86 | 100.00 % | 400 |
| 2021 Azerbaijan GP — Race | 6234 | 5,948 | 1.0036 | 1.54 | 100.00 % | 400 |
| 2021 Abu Dhabi GP — Race | 6601 | 5,201 | 1.0002 | 0.84 | 100.00 % | 400 |
| 2019 German GP — Race (wet) | 5474 | 4,557 | 1.0003 | 0.69 | 100.00 % | 400 |

Derived lengths are consistently 0.4–2.2 % shorter than published circuit lengths. That fits a recorded racing line cutting inside the surveyed centreline, and is why scale is checked against speed-integrated distance rather than the published figure. Other sessions are processed on demand and carry their own validation report; anything that fails a check is shown as **Track unverified** with the failing check listed.

## Limitations

- **Not live.** Only completed sessions are available; nothing labelled live.
- Position samples arrive at ~4 Hz and are snapped to a racing line by the feed, so the replay cannot show lateral position, overtakes side by side, or exact pit-box locations. Pit-lane samples show where the feed placed the car.
- Retired cars keep reporting their parked position; the timing tower marks them OUT once their laps stop.
- Sessions before 2018 are not supported (no detailed timing in the archive). Some older sessions may lack sector times or telemetry; affected panels show an unavailable state.
- Stationary pit-stop time exists only from the 2024 United States GP (OpenF1). Earlier stops show pit-lane time, calculated from lap timing for pre-2023 seasons.
- Season team colours come from the latest completed race's driver list; constructors that changed colour mid-season show their final colour. Missing colours use a neutral grey that is labelled as a fallback.
- News classification is simple keyword matching: it tags what a headline mentions, not verified facts.
- Large first downloads depend on the F1 archive's availability. FastF1 and Jolpica rate limits apply (the backend paces and retries with backoff).

## Troubleshooting

- **"Backend offline" in the top bar:** start the backend (Terminal 1). If it runs elsewhere, set `VITE_API_BASE_URL` in `frontend/.env` and restart `npm run dev`.
- **A session stays on "Preparing…":** watch the backend terminal; FastF1 logs its downloads. A failed download returns an error card with Retry. Network errors from the F1 archive usually clear on retry.
- **CORS errors:** the backend allows `http://localhost:5173` by default. Add origins with `APEX_CORS_ORIGINS='["http://..."]'` (see `backend/.env.example`).
- **Free disk space:** stop the backend and delete `backend/data/`. It is rebuilt on demand.
- **Stale data after updating the backend:** processed sessions carry a processing version and are rebuilt automatically when it changes.
