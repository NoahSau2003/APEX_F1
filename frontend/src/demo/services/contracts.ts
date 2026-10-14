import type { SessionSimulation, RaceSimulation, TimedSimulation } from '@/demo/simulation/types';
import type {
  Circuit,
  Driver,
  DriverId,
  EventId,
  QualifyingClassification,
  RaceClassification,
  RaceEvent,
  SessionType,
  Team,
  TeamId,
} from '@/types/domain';

/**
 * Service contracts. The UI depends only on these interfaces; the demo
 * implementations can be swapped for a historical-data API, a live timing
 * stream and an ML inference service without touching components.
 */

/** Static reference data, loaded once at startup. */
export interface Catalog {
  teams: Team[];
  drivers: Driver[];
  circuits: Circuit[];
  events: RaceEvent[];
  seasons: number[];
  team(id: TeamId): Team;
  driver(id: DriverId): Driver;
  circuit(id: string): Circuit;
  event(id: EventId): RaceEvent;
  driversOf(teamId: TeamId): Driver[];
}

export interface CompletedRace {
  event: RaceEvent;
  qualifying: QualifyingClassification[];
  race: RaceClassification[];
  sim: RaceSimulation;
}

export interface RaceDataService {
  /** Full session timeline (replay today, a live stream adapter later). */
  getSession(eventId: EventId, session: SessionType): Promise<SessionSimulation>;
  getQualifying(eventId: EventId): Promise<TimedSimulation>;
  getRace(eventId: EventId): Promise<CompletedRace>;
  /** Every completed race of a season, in round order. */
  getSeason(season: number): Promise<CompletedRace[]>;
}

export type PredictionStage = 'pre-qualifying' | 'post-qualifying' | 'pre-race';

export interface PredictionScenario {
  /** Override one driver's grid slot (post-qualifying and pre-race only). */
  gridOverride: { driverId: DriverId; position: number } | null;
  conditions: 'forecast' | 'dry' | 'wet';
  /** Multiplier on baseline retirement probability, 0.5–3. */
  reliabilityRisk: number;
  /** Pace adjustment for one team in percent of lap time (negative = faster). */
  teamAdjustment: { teamId: TeamId; percent: number } | null;
  /** Probability-like intensity of a safety car, 0–1. */
  safetyCar: number;
}

export type PredictionFeature = 'form' | 'carPace' | 'grid' | 'circuit' | 'wet' | 'reliability' | 'adjustment';

export interface DriverPrediction {
  driverId: DriverId;
  predictedPosition: number;
  expectedPosition: number;
  /** 10th–90th percentile finishing range. */
  range: [number, number];
  win: number;
  podium: number;
  top5: number;
  top10: number;
  dnf: number;
  score: number;
  contributions: Record<PredictionFeature, number>;
}

export interface PredictionSet {
  eventId: EventId;
  stage: PredictionStage;
  scenario: PredictionScenario;
  drivers: DriverPrediction[];
  /** Mean of the top-10 interval widths; a coarse uncertainty indicator. */
  uncertainty: number;
  featureWeights: Record<PredictionFeature, number>;
  /** Whether the grid used was the actual qualifying result or a projection. */
  gridSource: 'qualifying' | 'projected' | 'none';
  /** Always true in this prototype: values come from an illustrative formula, not a trained model. */
  illustrative: true;
}

export interface BacktestRow {
  eventId: EventId;
  round: number;
  name: string;
  winnerHit: boolean;
  podiumOverlap: number;
  top10Overlap: number;
  positionMae: number;
  rankCorrelation: number;
  predictedWinner: DriverId;
  actualWinner: DriverId;
}

export interface BacktestReport {
  season: number;
  stage: PredictionStage;
  rows: BacktestRow[];
  winnerAccuracy: number;
  podiumAccuracy: number;
  top10Accuracy: number;
  meanMae: number;
  meanRankCorrelation: number;
}

export interface PredictionService {
  predict(eventId: EventId, stage: PredictionStage, scenario: PredictionScenario): Promise<PredictionSet>;
  backtest(season: number, stage: PredictionStage): Promise<BacktestReport>;
}

export type ClaimStatus = 'reported' | 'confirmed' | 'unverified';
export type EvidenceLevel = 'single-source' | 'multiple-sources' | 'team-statement' | 'official-document' | 'photographic';
export type Confidence = 'low' | 'medium' | 'high';
export type Component =
  | 'front-wing'
  | 'rear-wing'
  | 'floor'
  | 'suspension'
  | 'cooling'
  | 'power-unit'
  | 'reliability'
  | 'sidepods';
export type UpgradeCategory = 'performance' | 'track-specific' | 'reliability' | 'correlation';

export interface TechnicalClaim {
  id: string;
  text: string;
  component: Component;
  status: ClaimStatus;
  evidence: EvidenceLevel;
  confidence: Confidence;
}

export interface NewsArticle {
  id: string;
  date: string;
  season: number;
  /** Round at which the reported change was (or is expected to be) introduced. */
  round: number;
  teamId: TeamId;
  title: string;
  summary: string;
  body: string[];
  source: { name: string; kind: 'publication' | 'team-media' | 'governing-body' | 'technical-analyst'; url: string };
  category: UpgradeCategory;
  components: Component[];
  status: ClaimStatus;
  evidence: EvidenceLevel;
  confidence: Confidence;
  claims: TechnicalClaim[];
  circuitRelevance: { trait: 'downforce' | 'topSpeed' | 'tyreWear' | 'overtaking'; direction: 'high' | 'low'; note: string };
}

export interface NewsQuery {
  search?: string;
  teams?: TeamId[];
  components?: Component[];
  status?: ClaimStatus | 'all';
}

export interface NewsService {
  list(query: NewsQuery): Promise<NewsArticle[]>;
  get(id: string): Promise<NewsArticle | null>;
}
