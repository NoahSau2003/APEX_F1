import type { DriverId, TeamId } from '@/types/domain';

/**
 * DEMO DATA. Hidden "ground truth" parameters that drive the deterministic
 * simulator. They exist only so every generated lap, result and standing is
 * internally consistent. They are not estimates of any real team or driver.
 */

export interface TeamModel {
  /** Car pace deficit vs. a reference car, % of lap time, at round 1. */
  pace: Record<number, number>;
  /** Change in deficit per round (negative = improving through the season). */
  development: Record<number, number>;
  /** Probability of a mechanical retirement per race. */
  failureRate: number;
  /** Mean stationary pit-stop time, seconds. */
  pitCrew: number;
  /** Car sensitivity: positive favours high-downforce tracks. */
  downforceBias: number;
}

export interface DriverModel {
  /** Driver pace offset, % of lap time (negative = faster). */
  skill: number;
  /** Lap-to-lap noise, % of lap time. */
  consistency: number;
  /** Extra pace offset in the wet, % (negative = better in the wet). */
  wet: number;
  /** 0–1 ability to complete overtakes. */
  racecraft: number;
  /** Probability of an incident-related retirement per race. */
  incidentRate: number;
}

export const TEAM_MODEL: Record<TeamId, TeamModel> = {
  halcyon: { pace: { 2025: 0.12, 2026: 0.0 }, development: { 2025: -0.012, 2026: 0.004 }, failureRate: 0.025, pitCrew: 2.35, downforceBias: 0.25 },
  northvale: { pace: { 2025: 0.02, 2026: 0.12 }, development: { 2025: 0.008, 2026: -0.006 }, failureRate: 0.03, pitCrew: 2.15, downforceBias: -0.1 },
  arclight: { pace: { 2025: 0.18, 2026: 0.16 }, development: { 2025: -0.004, 2026: -0.006 }, failureRate: 0.045, pitCrew: 2.4, downforceBias: -0.25 },
  meridian: { pace: { 2025: 0.3, 2026: 0.22 }, development: { 2025: 0.0, 2026: -0.002 }, failureRate: 0.02, pitCrew: 2.45, downforceBias: 0.05 },
  stratos: { pace: { 2025: 0.95, 2026: 0.8 }, development: { 2025: -0.01, 2026: -0.004 }, failureRate: 0.035, pitCrew: 2.6, downforceBias: 0.15 },
  volta: { pace: { 2025: 0.9, 2026: 0.9 }, development: { 2025: 0.004, 2026: -0.012 }, failureRate: 0.05, pitCrew: 2.7, downforceBias: -0.05 },
  tidewater: { pace: { 2025: 1.1, 2026: 0.95 }, development: { 2025: -0.006, 2026: 0.002 }, failureRate: 0.04, pitCrew: 2.55, downforceBias: -0.3 },
  orbis: { pace: { 2025: 1.0, 2026: 1.0 }, development: { 2025: 0.002, 2026: -0.008 }, failureRate: 0.04, pitCrew: 2.5, downforceBias: 0.1 },
  kestrel: { pace: { 2025: 1.25, 2026: 1.1 }, development: { 2025: -0.008, 2026: -0.014 }, failureRate: 0.055, pitCrew: 2.9, downforceBias: 0.0 },
  cinder: { pace: { 2025: 1.3, 2026: 1.15 }, development: { 2025: 0.0, 2026: 0.002 }, failureRate: 0.06, pitCrew: 2.8, downforceBias: -0.15 },
};

export const DRIVER_MODEL: Record<DriverId, DriverModel> = {
  reid: { skill: -0.12, consistency: 0.22, wet: -0.05, racecraft: 0.8, incidentRate: 0.02 },
  brandt: { skill: -0.06, consistency: 0.25, wet: 0.05, racecraft: 0.7, incidentRate: 0.025 },
  voss: { skill: -0.14, consistency: 0.2, wet: -0.25, racecraft: 0.9, incidentRate: 0.02 },
  sakai: { skill: 0.18, consistency: 0.32, wet: 0.1, racecraft: 0.5, incidentRate: 0.04 },
  ferrand: { skill: -0.1, consistency: 0.28, wet: 0.0, racecraft: 0.75, incidentRate: 0.03 },
  lindqvist: { skill: -0.04, consistency: 0.22, wet: -0.1, racecraft: 0.8, incidentRate: 0.02 },
  moreau: { skill: -0.08, consistency: 0.24, wet: -0.05, racecraft: 0.7, incidentRate: 0.025 },
  valdes: { skill: 0.05, consistency: 0.27, wet: 0.08, racecraft: 0.6, incidentRate: 0.03 },
  juhola: { skill: -0.05, consistency: 0.24, wet: -0.12, racecraft: 0.75, incidentRate: 0.02 },
  duarte: { skill: 0.12, consistency: 0.3, wet: 0.1, racecraft: 0.55, incidentRate: 0.04 },
  lacombe: { skill: 0.0, consistency: 0.26, wet: 0.0, racecraft: 0.65, incidentRate: 0.03 },
  whitfield: { skill: 0.08, consistency: 0.3, wet: 0.05, racecraft: 0.55, incidentRate: 0.035 },
  hartmann: { skill: -0.02, consistency: 0.25, wet: -0.08, racecraft: 0.65, incidentRate: 0.025 },
  mehta: { skill: 0.1, consistency: 0.33, wet: 0.12, racecraft: 0.5, incidentRate: 0.045 },
  ibarra: { skill: 0.02, consistency: 0.28, wet: 0.0, racecraft: 0.7, incidentRate: 0.035 },
  achterberg: { skill: 0.14, consistency: 0.34, wet: 0.08, racecraft: 0.45, incidentRate: 0.04 },
  orlov: { skill: 0.0, consistency: 0.27, wet: -0.04, racecraft: 0.6, incidentRate: 0.03 },
  carver: { skill: 0.16, consistency: 0.35, wet: 0.15, racecraft: 0.45, incidentRate: 0.05 },
  nakamura: { skill: 0.04, consistency: 0.3, wet: 0.02, racecraft: 0.55, incidentRate: 0.035 },
  ebner: { skill: 0.1, consistency: 0.31, wet: 0.06, racecraft: 0.5, incidentRate: 0.04 },
};
