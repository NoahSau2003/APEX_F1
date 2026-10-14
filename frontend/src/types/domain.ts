/**
 * Core domain model. These types are the contract between the data layer
 * (demo today, real APIs / ML services later) and the presentation layer.
 */

export type TeamId = string;
export type DriverId = string;
export type CircuitId = string;
export type EventId = string;

export interface Team {
  id: TeamId;
  name: string;
  short: string;
  color: string;
  powerUnit: string;
  base: string;
}

export interface Driver {
  id: DriverId;
  code: string;
  number: number;
  firstName: string;
  lastName: string;
  teamId: TeamId;
  nationality: string;
}

export type CircuitType = 'permanent' | 'street' | 'hybrid';

export interface Circuit {
  id: CircuitId;
  name: string;
  locality: string;
  country: string;
  countryCode: string;
  lengthKm: number;
  laps: number;
  corners: number;
  type: CircuitType;
  /** Reference lap time used to scale the simulation, seconds. */
  referenceLap: number;
  /** 0–1 characteristics used by the simulation and illustrative predictions. */
  traits: {
    downforce: number;
    topSpeed: number;
    overtaking: number;
    tyreWear: number;
  };
  /** Stylised 2D outline, arbitrary units; normalised by the track builder. */
  outline: [number, number][];
}

export type EventStatus = 'completed' | 'upcoming';

export interface RaceEvent {
  id: EventId;
  season: number;
  round: number;
  name: string;
  circuitId: CircuitId;
  date: string;
  status: EventStatus;
  weather: Weather;
}

export type Weather = 'dry' | 'mixed' | 'wet';

export type SessionType = 'FP1' | 'FP2' | 'FP3' | 'Q' | 'R';

export const SESSION_LABELS: Record<SessionType, string> = {
  FP1: 'Practice 1',
  FP2: 'Practice 2',
  FP3: 'Practice 3',
  Q: 'Qualifying',
  R: 'Race',
};

export type TyreCompound = 'S' | 'M' | 'H' | 'I' | 'W';

export type FinishStatus = 'finished' | 'lapped' | 'dnf';

export interface RaceClassification {
  driverId: DriverId;
  position: number;
  grid: number;
  status: FinishStatus;
  /** Retirement reason when status is dnf. */
  reason?: 'mechanical' | 'collision' | 'hydraulics' | 'power unit';
  lapsCompleted: number;
  totalTime: number | null;
  gapToWinner: number | null;
  bestLap: number;
  bestLapNumber: number;
  points: number;
  pitStops: number;
}

export interface QualifyingClassification {
  driverId: DriverId;
  position: number;
  q1: number;
  q2: number | null;
  q3: number | null;
}

export interface StandingRow {
  id: string;
  position: number;
  points: number;
  wins: number;
  podiums: number;
}

export type RaceEventKind =
  | 'start'
  | 'overtake'
  | 'pit'
  | 'fastest-lap'
  | 'retirement'
  | 'safety-car'
  | 'safety-car-end'
  | 'flag'
  | 'finish';

export interface RaceTimelineEvent {
  id: string;
  kind: RaceEventKind;
  /** Session time in seconds when the event happened. */
  time: number;
  lap: number;
  driverId?: DriverId;
  otherDriverId?: DriverId;
  text: string;
}

export type TrackStatus = 'green' | 'yellow' | 'sc' | 'chequered' | 'red';
