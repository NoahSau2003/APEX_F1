/** Types mirroring the backend's /api/v1 responses (see backend/app/schemas). */

export interface Source {
  provider: string;
  origin?: string | null;
  calculated?: boolean | null;
  note?: string | null;
  [k: string]: unknown;
}

export interface CacheInfo {
  served_from: string;
  processed_at: string | null;
}

export interface Dataset<T> {
  session_id: string;
  rows: T[];
  source: Source;
  cache: CacheInfo;
}

export interface SessionRef {
  id: string;
  session_key: number | null;
  name: string;
  code: string | null;
  kind: 'race' | 'qualifying' | 'practice' | 'other';
  date_utc: string | null;
  status: 'completed' | 'scheduled';
  replay_available: boolean;
  unavailable_reason: string | null;
}

export interface Meeting {
  id: string;
  meeting_key: number | null;
  year: number;
  round: number;
  name: string;
  official_name: string;
  country: string;
  location: string;
  date: string | null;
  format: string;
  sessions: SessionRef[];
}

export interface DriverCoverage {
  samples: number;
  first_ms: number;
  last_ms: number;
  max_gap_ms: number;
}

export interface SessionInfo {
  id: string;
  session_key: number | null;
  meeting_key: number | null;
  meeting_id: string;
  year: number;
  round: number;
  meeting_name: string;
  official_name: string;
  country: string;
  location: string;
  circuit_short_name: string | null;
  session_name: string;
  session_code: string;
  kind: SessionRef['kind'];
  date_utc: string | null;
  t0_utc: string;
  timeline: { first_sample: number; last_sample: number; session_start: number | null; chunk_s: number; chunks: number[] };
  total_laps: number | null;
  location_coverage: Record<string, DriverCoverage>;
  telemetry_drivers: string[];
  processing: { version: number; processed_at: string; seconds: number };
  sources: (Source & { datasets: string[] })[];
  cache: CacheInfo;
}

export interface Driver {
  driver_number: string;
  abbreviation: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  broadcast_name: string | null;
  team_name: string | null;
  team_id: string | null;
  driver_id: string | null;
  team_color: string;
  team_color_official: boolean;
  country_code: string | null;
  headshot_url: string | null;
}

export interface ResultRow {
  driver_number: string;
  position: number | null;
  classified_position: string | null;
  grid: number | null;
  status: string | null;
  time: number | null;
  points: number | null;
  laps: number | null;
  q1: number | null;
  q2: number | null;
  q3: number | null;
  best_lap: number | null;
}

export interface Lap {
  driver_number: string;
  lap: number | null;
  start: number | null;
  end: number | null;
  lap_time: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  s1_end: number | null;
  s2_end: number | null;
  compound: string | null;
  tyre_life: number | null;
  stint: number | null;
  pit_in: number | null;
  pit_out: number | null;
  position: number | null;
  track_status: string | null;
  deleted: boolean;
  personal_best: boolean;
  speed_trap: number | null;
}

export interface Stint {
  driver_number: string;
  stint: number;
  compound: string | null;
  lap_start: number | null;
  lap_end: number | null;
  tyre_life_start: number | null;
  fresh: boolean | null;
}

export interface PitStop {
  driver_number: string;
  lap: number | null;
  time: number | null;
  lane_duration: number | null;
  stop_duration: number | null;
}

export interface WeatherRow {
  time: number | null;
  air_temp: number | null;
  track_temp: number | null;
  humidity: number | null;
  pressure: number | null;
  rainfall: boolean | null;
  wind_direction: number | null;
  wind_speed: number | null;
}

export interface RaceControlRow {
  time: number | null;
  category: string | null;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  driver_number: string | null;
  lap: number | null;
  message: string | null;
}

export interface TrackStatusRow {
  time: number | null;
  status: string | null;
  message: string | null;
}

export interface TrackValidation {
  status: 'validated' | 'unverified';
  laps_used: number;
  drivers_used: number;
  samples_checked: number;
  length_m: number;
  speed_distance_m: number | null;
  scale_ratio: number | null;
  closure_gap_m: number;
  residual_median_m: number;
  residual_p95_m: number;
  residual_p99_m: number;
  share_within_20m: number;
  forward_share: number;
  start_line_spread_m: number | null;
  corner_reference_median_m: number | null;
  reference: string | null;
  failures: string[];
}

export type Track =
  | { session_id: string; available: false; reason: string; cache: CacheInfo }
  | {
      session_id: string;
      available: true;
      units: 'metre';
      frame: string;
      rotation_deg: number;
      rotation_source: string | null;
      centreline: [number, number][];
      corners: { number: number | null; letter: string | null; x: number; y: number }[];
      validation: TrackValidation;
      method: string;
      debug_raw_points: { x: number[]; y: number[]; stride: number };
      cache: CacheInfo;
    };

export interface LocationWindow {
  session_id: string;
  start: number;
  end: number;
  drivers: Record<string, { t: number[]; x: number[]; y: number[]; on: number[] }>;
  source: Source;
  cache: CacheInfo;
}

export interface Telemetry {
  session_id: string;
  driver_number: string;
  start: number;
  end: number;
  lap: number | null;
  channels: { t: number[]; speed: (number | null)[]; rpm: (number | null)[]; gear: (number | null)[]; throttle: (number | null)[]; brake: (number | null)[]; drs: (number | null)[] };
  units: Record<string, string>;
  source: Source;
  cache: CacheInfo;
}

export interface SeasonResultRow {
  position: number;
  position_text: string;
  driver_id: string;
  code: string | null;
  number: string | null;
  given_name: string;
  family_name: string;
  constructor_id: string;
  constructor: string;
  grid: number | null;
  laps: number;
  status: string;
  points: number;
  time: string | null;
  fastest_lap_rank: number | null;
  fastest_lap_time: string | null;
}

export interface SeasonRace {
  round: number;
  name: string;
  date: string;
  circuit: string;
  locality: string;
  country: string;
  results: SeasonResultRow[];
  sprint: SeasonResultRow[];
}

export interface SeasonResults {
  year: number;
  races: SeasonRace[];
  source: Source;
}

export interface Standings {
  year: number;
  round: number | null;
  drivers: { position: number | null; points: number; wins: number; driver_id: string; code: string | null; given_name: string; family_name: string; constructor_ids: string[]; constructors: string[] }[];
  constructors: { position: number | null; points: number; wins: number; constructor_id: string; name: string }[];
  source: Source;
}

export interface TeamColors {
  year: number;
  colors: Record<string, string>;
  from: string | null;
  source: Source;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  link: string;
  published: string | null;
  source: string;
  source_id: string;
  components: string[];
  teams: string[];
  status: 'confirmed' | 'reported' | 'unclassified';
  technical: boolean;
  rules_fired: { rule: string; terms: string[] }[];
}

export interface News {
  feeds: { id: string; name: string; url: string; ok: boolean; error: string | null; count: number }[];
  items: NewsItem[];
  fetched_at: string;
  rules: { components: Record<string, string[]>; status: Record<string, string[]>; teams: Record<string, string[]> };
  source: Source;
}

export interface Health {
  status: string;
  version: string;
  fastf1_version: string;
  cache_dir: string;
}
