import type { DriverId, EventId, TeamId } from '@/types/domain';
import { clamp, mean, spearman, stdDev } from '@/utils/math';
import { createRng, hashString } from '@/utils/random';
import { teamQualiGapByRace } from './analytics';
import { catalog, circuitCode } from './catalog';
import type {
  BacktestReport,
  BacktestRow,
  CompletedRace,
  DriverPrediction,
  PredictionFeature,
  PredictionScenario,
  PredictionService,
  PredictionSet,
  PredictionStage,
} from './contracts';
import { demoRaceStore } from './demoRaceData';
import { transport } from './transport';

/**
 * ILLUSTRATIVE PROTOTYPE CALCULATION — NOT A TRAINED MODEL.
 *
 * A transparent weighted score over features observable before the event
 * (recent form, team qualifying pace, circuit history, grid), followed by a
 * seeded Monte Carlo to turn scores into finishing-position probabilities.
 * It exists so the prediction UI can be designed and exercised; an ML
 * inference service can implement PredictionService with the same output.
 */

export const DEFAULT_SCENARIO: PredictionScenario = {
  gridOverride: null,
  conditions: 'forecast',
  reliabilityRisk: 1,
  teamAdjustment: null,
  safetyCar: 0.3,
};

const STAGE_WEIGHTS: Record<PredictionStage, Record<'form' | 'carPace' | 'grid' | 'circuit' | 'wet', number>> = {
  'pre-qualifying': { form: 0.9, carPace: 1.1, grid: 0, circuit: 0.35, wet: 0.55 },
  'post-qualifying': { form: 0.5, carPace: 0.6, grid: 1.2, circuit: 0.2, wet: 0.45 },
  'pre-race': { form: 0.45, carPace: 0.6, grid: 1.25, circuit: 0.2, wet: 0.5 },
};
const STAGE_NOISE: Record<PredictionStage, number> = { 'pre-qualifying': 1.35, 'post-qualifying': 1.05, 'pre-race': 0.95 };

interface Features {
  form: Map<DriverId, number>;
  carPace: Map<TeamId, number>;
  circuit: Map<DriverId, number | null>;
  wet: Map<DriverId, number | null>;
  dnfRate: Map<TeamId, number>;
  grid: Map<DriverId, number> | null;
  gridSource: PredictionSet['gridSource'];
}

function priorRaces(eventId: EventId): CompletedRace[] {
  const event = catalog.event(eventId);
  const thisSeason = demoRaceStore.season(event.season).filter((r) => r.event.round < event.round);
  if (thisSeason.length >= 3 || !catalog.seasons.includes(event.season - 1)) return thisSeason;
  return [...demoRaceStore.season(event.season - 1).slice(-(5 - thisSeason.length)), ...thisSeason];
}

function features(eventId: EventId, stage: PredictionStage): Features {
  const event = catalog.event(eventId);
  const prior = priorRaces(eventId);
  const recent = prior.slice(-5);
  const form = new Map(catalog.drivers.map((d) => [d.id, mean(recent.map((r) => r.race.find((c) => c.driverId === d.id)?.points ?? 0))]));
  const carPace = new Map(catalog.teams.map((t) => [t.id, recent.length ? mean(recent.map((r) => teamQualiGapByRace(r, t.id))) : 1]));

  const lastYear = catalog.events.find((e) => e.season === event.season - 1 && e.circuitId === event.circuitId && e.status === 'completed');
  const lastYearRace = lastYear ? demoRaceStore.race(lastYear.id) : null;
  const circuit = new Map(
    catalog.drivers.map((d) => {
      const c = lastYearRace?.race.find((x) => x.driverId === d.id);
      return [d.id, c && c.status !== 'dnf' ? c.position : null] as const;
    }),
  );

  const allPrior = [...(catalog.seasons.includes(event.season - 1) ? demoRaceStore.season(event.season - 1) : []), ...prior].filter(
    (r, i, arr) => arr.findIndex((x) => x.event.id === r.event.id) === i && r.event.date < event.date,
  );
  const wet = new Map(
    catalog.drivers.map((d) => {
      const fin = (rs: CompletedRace[]) =>
        rs.map((r) => r.race.find((c) => c.driverId === d.id)!).filter((c) => c.status !== 'dnf').map((c) => c.position);
      const w = fin(allPrior.filter((r) => r.event.weather !== 'dry'));
      const dry = fin(allPrior.filter((r) => r.event.weather === 'dry'));
      return [d.id, w.length && dry.length ? mean(w) - mean(dry) : null] as const;
    }),
  );

  const dnfRate = new Map(
    catalog.teams.map((t) => {
      const ids = catalog.driversOf(t.id).map((d) => d.id);
      const res = allPrior.flatMap((r) => r.race.filter((c) => ids.includes(c.driverId)));
      const mech = res.filter((c) => c.status === 'dnf' && c.reason !== 'collision').length;
      // Shrink towards a 4% prior so a single failure does not dominate.
      return [t.id, (mech + 0.04 * 20) / (res.length + 20)] as const;
    }),
  );

  let grid: Map<DriverId, number> | null = null;
  let gridSource: Features['gridSource'] = 'none';
  if (stage !== 'pre-qualifying') {
    if (event.status === 'completed') {
      grid = new Map(demoRaceStore.qualifying(eventId).qualifying!.map((q) => [q.driverId, q.position]));
      gridSource = 'qualifying';
    } else {
      // No qualifying yet in the demo calendar: project a grid from pace and form.
      const order = [...catalog.drivers].sort(
        (a, b) => (carPace.get(a.teamId)! - form.get(a.id)! * 0.02) - (carPace.get(b.teamId)! - form.get(b.id)! * 0.02),
      );
      grid = new Map(order.map((d, i) => [d.id, i + 1]));
      gridSource = 'projected';
    }
  }
  return { form, carPace, circuit, wet, dnfRate, grid, gridSource };
}

function zScores(values: Map<string, number | null>, invert: boolean): Map<string, number> {
  const xs = [...values.values()].filter((v): v is number => v != null);
  const m = mean(xs);
  const sd = stdDev(xs) || 1;
  return new Map([...values.entries()].map(([k, v]) => [k, v == null ? 0 : ((invert ? m - v : v - m) / sd)]));
}

function computePrediction(eventId: EventId, stage: PredictionStage, scenario: PredictionScenario, iterations = 4000): PredictionSet {
  const event = catalog.event(eventId);
  const f = features(eventId, stage);
  const w = STAGE_WEIGHTS[stage];
  const wetIntensity = scenario.conditions === 'dry' ? 0 : scenario.conditions === 'wet' ? 1 : event.weather === 'wet' ? 1 : event.weather === 'mixed' ? 0.5 : 0;

  let grid = f.grid;
  if (grid && scenario.gridOverride) {
    // Move one driver to the requested slot and shuffle the rest around them.
    const { driverId, position } = scenario.gridOverride;
    const order = [...grid.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id).filter((id) => id !== driverId);
    order.splice(clamp(position, 1, order.length + 1) - 1, 0, driverId);
    grid = new Map(order.map((id, i) => [id, i + 1]));
  }

  const zForm = zScores(f.form, false);
  const zPace = zScores(new Map(catalog.drivers.map((d) => [d.id, f.carPace.get(d.teamId)!])), true);
  const zCircuit = zScores(f.circuit, true);
  const zWet = zScores(f.wet, true);
  const zGrid = grid ? zScores(new Map([...grid.entries()].map(([k, v]) => [k, v as number | null])), true) : null;
  const paceSd = stdDev([...f.carPace.values()]) || 0.4;
  const gridWeight = w.grid * (1 - 0.35 * scenario.safetyCar);
  const sigma = STAGE_NOISE[stage] * (1 + 0.6 * scenario.safetyCar) * (1 + 0.25 * wetIntensity);

  const contributions = new Map<DriverId, Record<PredictionFeature, number>>();
  const scores = catalog.drivers.map((d) => {
    const adj = scenario.teamAdjustment && scenario.teamAdjustment.teamId === d.teamId ? (-scenario.teamAdjustment.percent / paceSd) * w.carPace : 0;
    const dnf = clamp((f.dnfRate.get(d.teamId)! + 0.02) * scenario.reliabilityRisk * (1 + 0.5 * wetIntensity), 0, 0.6);
    const c: Record<PredictionFeature, number> = {
      form: w.form * zForm.get(d.id)!,
      carPace: w.carPace * zPace.get(d.id)!,
      grid: zGrid ? gridWeight * zGrid.get(d.id)! : 0,
      circuit: w.circuit * zCircuit.get(d.id)!,
      wet: w.wet * wetIntensity * zWet.get(d.id)!,
      // Expected cost of retirement risk, expressed in score units for the explanation panel.
      reliability: -(dnf - 0.06) * 4,
      adjustment: adj,
    };
    contributions.set(d.id, c);
    const score = c.form + c.carPace + c.grid + c.circuit + c.wet + c.adjustment;
    return { id: d.id, score, dnf };
  });

  const n = scores.length;
  const rng = createRng(hashString(`${eventId}:${stage}:${JSON.stringify(scenario)}`));
  const hist = scores.map(() => new Uint32Array(n));
  const dnfCount = new Uint32Array(n);
  const perf = new Float64Array(n);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const out = rng.next() < scores[i].dnf;
      if (out) dnfCount[i]++;
      perf[i] = out ? -100 - rng.next() : scores[i].score + rng.gauss() * sigma;
    }
    idx.sort((a, b) => perf[b] - perf[a]);
    for (let p = 0; p < n; p++) hist[idx[p]][p]++;
  }

  const drivers: DriverPrediction[] = scores.map((s, i) => {
    const h = hist[i];
    const pr = (k: number) => {
      let acc = 0;
      for (let p = 0; p < k; p++) acc += h[p];
      return acc / iterations;
    };
    let expected = 0;
    for (let p = 0; p < n; p++) expected += (p + 1) * h[p];
    expected /= iterations;
    const pct = (q: number) => {
      let acc = 0;
      for (let p = 0; p < n; p++) {
        acc += h[p];
        if (acc / iterations >= q) return p + 1;
      }
      return n;
    };
    return {
      driverId: s.id,
      predictedPosition: 0,
      expectedPosition: expected,
      range: [pct(0.1), pct(0.9)],
      win: pr(1),
      podium: pr(3),
      top5: pr(5),
      top10: pr(10),
      dnf: dnfCount[i] / iterations,
      score: s.score,
      contributions: contributions.get(s.id)!,
    };
  });
  drivers.sort((a, b) => a.expectedPosition - b.expectedPosition || b.win - a.win);
  drivers.forEach((d, i) => (d.predictedPosition = i + 1));

  return {
    eventId,
    stage,
    scenario,
    drivers,
    uncertainty: mean(drivers.slice(0, 10).map((d) => d.range[1] - d.range[0])),
    featureWeights: {
      form: w.form,
      carPace: w.carPace,
      grid: gridWeight,
      circuit: w.circuit,
      wet: w.wet * wetIntensity,
      reliability: 0.3 * scenario.reliabilityRisk,
      adjustment: scenario.teamAdjustment ? Math.abs(scenario.teamAdjustment.percent / paceSd) * w.carPace : 0,
    },
    gridSource: f.gridSource,
    illustrative: true,
  };
}

const memo = new Map<string, PredictionSet>();
export function predictSync(eventId: EventId, stage: PredictionStage, scenario: PredictionScenario = DEFAULT_SCENARIO, iterations = 4000): PredictionSet {
  const key = `${eventId}|${stage}|${JSON.stringify(scenario)}|${iterations}`;
  let hit = memo.get(key);
  if (!hit) {
    hit = computePrediction(eventId, stage, scenario, iterations);
    if (memo.size > 200) memo.clear();
    memo.set(key, hit);
  }
  return hit;
}

function backtest(season: number, stage: PredictionStage): BacktestReport {
  const rows: BacktestRow[] = demoRaceStore.season(season).map((r) => {
    const p = predictSync(r.event.id, stage, DEFAULT_SCENARIO, 1500);
    const predOrder = p.drivers.map((d) => d.driverId);
    const actualOrder = r.race.map((c) => c.driverId);
    const overlap = (k: number) => predOrder.slice(0, k).filter((id) => actualOrder.slice(0, k).includes(id)).length / k;
    const predPos = new Map(predOrder.map((id, i) => [id, i + 1]));
    const actualPos = new Map(actualOrder.map((id, i) => [id, i + 1]));
    const ids = catalog.drivers.map((d) => d.id);
    return {
      eventId: r.event.id,
      round: r.event.round,
      name: circuitCode(r.event.circuitId),
      winnerHit: predOrder[0] === actualOrder[0],
      podiumOverlap: overlap(3),
      top10Overlap: overlap(10),
      positionMae: mean(ids.map((id) => Math.abs(predPos.get(id)! - actualPos.get(id)!))),
      rankCorrelation: spearman(ids.map((id) => predPos.get(id)!), ids.map((id) => actualPos.get(id)!)),
      predictedWinner: predOrder[0],
      actualWinner: actualOrder[0],
    };
  });
  return {
    season,
    stage,
    rows,
    winnerAccuracy: mean(rows.map((r) => (r.winnerHit ? 1 : 0))),
    podiumAccuracy: mean(rows.map((r) => r.podiumOverlap)),
    top10Accuracy: mean(rows.map((r) => r.top10Overlap)),
    meanMae: mean(rows.map((r) => r.positionMae)),
    meanRankCorrelation: mean(rows.map((r) => r.rankCorrelation)),
  };
}

export const demoPredictions: PredictionService = {
  predict: (eventId, stage, scenario) =>
    transport.request(`predict:${eventId}:${stage}`, () => predictSync(eventId, stage, scenario)),
  backtest: (season, stage) => transport.request(`backtest:${season}:${stage}`, () => backtest(season, stage)),
};
