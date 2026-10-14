/**
 * Service registry. Swap a demo implementation for a real adapter here; the
 * rest of the application only sees the contracts in ./contracts.
 */
import type { PredictionService, RaceDataService } from './contracts';

import { demoPredictions } from './demoPredictions';
import { demoRaceData } from './demoRaceData';

export { catalog, circuitCode } from './catalog';
export { transport, DataSourceError } from './transport';

export const raceData: RaceDataService = demoRaceData;
export const predictions: PredictionService = demoPredictions;

export const DATA_SOURCE = {
  label: 'Demo data',
  description: 'Locally simulated, deterministic sample data. Teams and drivers are fictional.',
} as const;
