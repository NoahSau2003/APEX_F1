import type {
  DriverId,
  EventId,
  QualifyingClassification,
  RaceClassification,
  RaceTimelineEvent,
  SessionType,
  TyreCompound,
} from '@/types/domain';

/** One driver's complete, precomputed path through a race. */
export interface RaceTrace {
  driverId: DriverId;
  grid: number;
  /** Distance fraction behind the line at lights out (grid slot). */
  startOffset: number;
  /** Session time at the end of each completed lap. lapEnd[0] = end of lap 1. */
  lapEnd: number[];
  lapTimes: number[];
  /** Fraction of each lap's driving time spent in sectors 1–3. */
  sectorSplit: [number, number, number][];
  compound: TyreCompound[];
  /** Laps (1-based) on which the driver entered the pits at the end. */
  pitLaps: number[];
  pitLoss: number[];
  pitStationary: number[];
  /** Positions at the end of each lap. */
  positions: number[];
  retired: { lap: number; time: number; distance: number; reason: NonNullable<RaceClassification['reason']> } | null;
  /** Session time at which this driver took the chequered flag. */
  finishTime: number | null;
}

export interface RaceSimulation {
  kind: 'race';
  eventId: EventId;
  session: 'R';
  totalLaps: number;
  duration: number;
  winnerTime: number;
  traces: RaceTrace[];
  safetyCar: { startLap: number; endLap: number; startTime: number; endTime: number }[];
  events: RaceTimelineEvent[];
  classification: RaceClassification[];
  fastestLap: { driverId: DriverId; lap: number; time: number };
  /** Overtakes on track (excludes pit-cycle changes). */
  overtakes: number;
  weather: 'dry' | 'mixed' | 'wet';
  trackTemp: number;
  airTemp: number;
}

export type TimedLapKind = 'out' | 'push' | 'cool' | 'in';

export interface TimedLap {
  start: number;
  duration: number;
  kind: TimedLapKind;
  /** Segment index for qualifying (0 = Q1). Always 0 for practice. */
  segment: number;
  compound: TyreCompound;
  sectorSplit: [number, number, number];
}

export interface TimedTrace {
  driverId: DriverId;
  laps: TimedLap[];
}

export interface TimedSimulation {
  kind: 'timed';
  eventId: EventId;
  session: Exclude<SessionType, 'R'>;
  duration: number;
  /** Segment boundaries [start, end] in session time. Practice has one. */
  segments: [number, number][];
  /** Number of drivers that advance from each segment (qualifying only). */
  advance: number[];
  traces: TimedTrace[];
  events: RaceTimelineEvent[];
  qualifying?: QualifyingClassification[];
  weather: 'dry' | 'mixed' | 'wet';
  trackTemp: number;
  airTemp: number;
}

export type SessionSimulation = RaceSimulation | TimedSimulation;

export type CarStatus = 'running' | 'pit' | 'garage' | 'retired' | 'finished' | 'grid';

/** Instantaneous state of one car, cheap enough to compute every frame. */
export interface CarState {
  driverId: DriverId;
  visible: boolean;
  /** Total distance in laps (race) or fraction within the current lap (timed). */
  distance: number;
  /** Fraction within the current lap, 0..1. */
  lapFrac: number;
  lap: number;
  status: CarStatus;
  /** Lateral offset from the centreline in metres. */
  lateral: number;
  /** Pace factor relative to the reference lap (1 = reference). */
  pace: number;
}

export interface TimingRow {
  driverId: DriverId;
  position: number;
  /** Position change vs. grid (race) or vs. 5 minutes earlier (timed). */
  change: number;
  gap: number | null;
  interval: number | null;
  lapsDown: number;
  lap: number;
  lastLap: number | null;
  bestLap: number | null;
  sector: 1 | 2 | 3;
  /** Completed sector times for the lap in progress (or the last lap). */
  sectors: (number | null)[];
  compound: TyreCompound;
  tyreAge: number;
  pitStops: number;
  status: CarStatus;
  /** Personal best on the last lap / overall best. */
  lastLapFlag: 'none' | 'personal' | 'overall';
}

export interface SessionSnapshot {
  time: number;
  lap: number;
  totalLaps: number | null;
  rows: TimingRow[];
  trackStatus: 'green' | 'yellow' | 'sc' | 'chequered';
  fastest: { driverId: DriverId; time: number; lap: number } | null;
  /** Qualifying segment label or null. */
  segmentLabel: string | null;
  remaining: number | null;
}
