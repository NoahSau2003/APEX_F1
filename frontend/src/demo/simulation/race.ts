import { DRIVER_MODEL, TEAM_MODEL } from '@/demo/data/demoModel';
import type {
  Circuit,
  Driver,
  QualifyingClassification,
  RaceClassification,
  RaceEvent,
  RaceTimelineEvent,
  TyreCompound,
} from '@/types/domain';
const COMPOUND_NAMES: Record<string, string> = { S: 'Soft', M: 'Medium', H: 'Hard', I: 'Intermediate', W: 'Wet' };
import { clamp } from '@/utils/math';
import { createRng } from '@/utils/random';
import { formatLapTime } from '@/utils/format';
import { eventSeed, weatherLapFactor, weekendPace } from './pace';
import { splitFor } from './timed';
import { timeFracAtDistance, type TrackModel } from './track';
import type { RaceSimulation, RaceTrace } from './types';

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
/** Distance fraction where cars stop in the pit lane. */
export const PIT_POINT = 0.975;

const COMPOUND_OFFSET: Record<TyreCompound, number> = { S: -0.55, M: 0, H: 0.4, I: 0, W: 1.5 };
const COMPOUND_DEG: Record<TyreCompound, number> = { S: 0.085, M: 0.052, H: 0.032, I: 0.05, W: 0.03 };

interface Strategy {
  stints: TyreCompound[];
  pitLaps: number[];
}

function planStrategy(event: RaceEvent, circuit: Circuit, rng: ReturnType<typeof createRng>): Strategy {
  const N = circuit.laps;
  if (event.weather === 'wet') return { stints: ['I', 'I'], pitLaps: [Math.round(N * rng.range(0.42, 0.58))] };
  if (event.weather === 'mixed') {
    const swap = Math.round(N * rng.range(0.24, 0.34));
    return rng.chance(0.55)
      ? { stints: ['I', 'M', 'H'], pitLaps: [swap, Math.round(N * rng.range(0.6, 0.72))] }
      : { stints: ['I', 'H'], pitLaps: [swap] };
  }
  const twoStop = rng.chance(circuit.traits.tyreWear > 0.6 ? 0.7 : 0.18);
  if (twoStop) {
    const a = Math.round(N * rng.range(0.24, 0.34));
    const b = Math.round(N * rng.range(0.58, 0.7));
    return { stints: rng.chance(0.5) ? ['S', 'M', 'H'] : ['M', 'H', 'M'], pitLaps: [a, b] };
  }
  return { stints: rng.chance(0.6) ? ['M', 'H'] : ['S', 'H'], pitLaps: [Math.round(N * rng.range(0.36, 0.55))] };
}

export function simulateRace(
  event: RaceEvent,
  circuit: Circuit,
  track: TrackModel,
  drivers: Driver[],
  grid: QualifyingClassification[],
): RaceSimulation {
  const rng = createRng(eventSeed(event, 'race'));
  const N = circuit.laps;
  const ref = circuit.referenceLap * weatherLapFactor(event.weather);
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const code = (id: string) => byId.get(id)?.code ?? id;
  const wetMult = event.weather === 'dry' ? 1 : 1.8;

  const gridOrder = grid.map((g) => g.driverId);
  const pace = new Map(gridOrder.map((id) => [id, weekendPace(byId.get(id)!, event, circuit) + rng.gauss() * 0.03]));
  const strategy = new Map(gridOrder.map((id) => [id, planStrategy(event, circuit, rng)]));

  // Retirements are decided up front so a crash can trigger a safety car.
  const retirePlan = new Map<string, { lap: number; reason: NonNullable<RaceClassification['reason']>; frac: number }>();
  for (const id of gridOrder) {
    const team = TEAM_MODEL[byId.get(id)!.teamId];
    const dm = DRIVER_MODEL[id];
    if (rng.chance(team.failureRate)) {
      const reasons = ['mechanical', 'hydraulics', 'power unit'] as const;
      retirePlan.set(id, { lap: rng.int(2, N - 2), reason: reasons[rng.int(0, 2)], frac: rng.range(0.1, 0.9) });
    } else if (rng.chance(dm.incidentRate * wetMult)) {
      retirePlan.set(id, { lap: rng.chance(0.3) ? 1 : rng.int(2, N - 3), reason: 'collision', frac: rng.range(0.05, 0.6) });
    }
  }

  const scLaps = new Set<number>();
  const safetyCarPeriods: { startLap: number; endLap: number }[] = [];
  const collisions = [...retirePlan.values()].filter((r) => r.reason === 'collision').map((r) => r.lap);
  const scStarts = collisions.filter(() => rng.chance(0.75));
  if (rng.chance(0.22)) scStarts.push(rng.int(4, N - 10));
  for (const start of [...new Set(scStarts)].sort((a, b) => a - b)) {
    if (safetyCarPeriods.some((p) => start <= p.endLap + 6) || start > N - 4) continue;
    const endLap = Math.min(N - 2, start + rng.int(3, 5));
    safetyCarPeriods.push({ startLap: start + 1, endLap });
    for (let l = start + 1; l <= endLap; l++) scLaps.add(l);
  }

  // Opportunistic stops under the safety car.
  for (const period of safetyCarPeriods) {
    for (const s of strategy.values()) {
      const idx = s.pitLaps.findIndex((l) => l >= period.startLap && l - period.startLap <= 9);
      if (idx >= 0 && !s.pitLaps.includes(period.startLap)) s.pitLaps[idx] = period.startLap;
      s.pitLaps.sort((a, b) => a - b);
    }
  }

  const traces = new Map<string, RaceTrace>(
    gridOrder.map((id, i) => [
      id,
      {
        driverId: id,
        grid: i + 1,
        startOffset: -(20 * i + 14) / track.lengthM,
        lapEnd: [],
        lapTimes: [],
        sectorSplit: [],
        compound: [],
        pitLaps: [],
        pitLoss: [],
        pitStationary: [],
        positions: [],
        retired: null,
        finishTime: null,
      },
    ]),
  );

  const running = new Set(gridOrder);
  const events: RaceTimelineEvent[] = [{ id: 'start', kind: 'start', time: 0, lap: 1, text: 'Lights out — race start' }];
  let order = [...gridOrder];
  let fastest = { driverId: '', lap: 0, time: Infinity };
  let overtakes = 0;

  for (let L = 1; L <= N; L++) {
    const sc = scLaps.has(L);
    let blockEnd = -Infinity;
    let leaderDone = false;
    const prevOrder = order.filter((id) => running.has(id));

    for (let idx = 0; idx < prevOrder.length; idx++) {
      const id = prevOrder[idx];
      const tr = traces.get(id)!;
      const strat = strategy.get(id)!;
      const dm = DRIVER_MODEL[id];
      const prevEnd = L === 1 ? 0 : tr.lapEnd[L - 2];
      const stint = strat.pitLaps.filter((p) => p < L).length;
      const compound = strat.stints[Math.min(stint, strat.stints.length - 1)];
      const stintStart = stint === 0 ? 1 : strat.pitLaps[stint - 1] + 1;
      const age = L - stintStart;
      const pits = strat.pitLaps.includes(L);

      let raw =
        ref * (1 + (pace.get(id) as number) / 100) +
        COMPOUND_OFFSET[compound] +
        COMPOUND_DEG[compound] * age * (0.6 + circuit.traits.tyreWear) +
        (N - L) * 0.055 +
        rng.gauss() * dm.consistency * 0.006 * ref;
      if (L === 1) raw += 3.2 + idx * 0.22;

      let stationary = 0;
      let loss = 0;
      if (pits) {
        stationary = Math.max(1.8, TEAM_MODEL[byId.get(id)!.teamId].pitCrew + Math.abs(rng.gauss()) * 0.35 + (rng.chance(0.05) ? rng.range(1.5, 5) : 0));
        loss = (circuit.id === 'monaco' ? 17 : 19.5) + stationary - 2.4 + rng.range(-0.6, 0.6);
        if (sc) loss *= 0.6;
      }

      const plan = retirePlan.get(id);
      if (plan && plan.lap === L) {
        const time = prevEnd + raw * plan.frac;
        tr.retired = { lap: L - 1, time, distance: plan.frac, reason: plan.reason };
        running.delete(id);
        events.push({
          id: `ret-${id}`,
          kind: 'retirement',
          time,
          lap: L,
          driverId: id,
          text: plan.reason === 'collision' ? `${code(id)} out after contact` : `${code(id)} retires — ${plan.reason}`,
        });
        continue;
      }

      let end: number;
      if (sc) {
        end = leaderDone ? Math.max(prevEnd + ref * 1.22, blockEnd + 0.9) : prevEnd + ref * 1.42;
        end += loss;
      } else {
        let tentative = prevEnd + raw + loss;
        if (leaderDone && !pits && tentative < blockEnd + 0.32) {
          const advantage = blockEnd + 0.32 - tentative;
          const p = clamp(0.04 + circuit.traits.overtaking * 0.5 * dm.racecraft + advantage * 0.22, 0, 0.92);
          if (tentative < blockEnd + 0.05 && rng.chance(p)) {
            tentative = Math.min(tentative, blockEnd - 0.08 - rng.range(0, 0.25));
          } else {
            tentative = blockEnd + 0.32 + rng.range(0, 0.35);
          }
        }
        end = tentative;
      }
      leaderDone = true;
      // A car in the pit lane does not hold up the cars behind it.
      if (!pits) blockEnd = Math.max(blockEnd, end);

      const lapTime = end - prevEnd;
      tr.lapEnd.push(end);
      tr.lapTimes.push(lapTime);
      tr.sectorSplit.push(splitFor(track, rng));
      tr.compound.push(compound);
      if (pits) {
        tr.pitLaps.push(L);
        tr.pitLoss.push(loss);
        tr.pitStationary.push(stationary);
        const next = strat.stints[Math.min(stint + 1, strat.stints.length - 1)];
        events.push({
          id: `pit-${id}-${L}`,
          kind: 'pit',
          time: prevEnd + (lapTime - loss) * timeFracAtDistance(track, PIT_POINT),
          lap: L,
          driverId: id,
          text: `${code(id)} pits — ${COMPOUND_NAMES[compound]} → ${COMPOUND_NAMES[next]} · ${stationary.toFixed(1)}s`,
        });
      }
      if (L > 1 && !pits && lapTime < fastest.time) {
        fastest = { driverId: id, lap: L, time: lapTime };
        if (L > 3) events.push({ id: `fl-${id}-${L}`, kind: 'fastest-lap', time: end, lap: L, driverId: id, text: `${code(id)} sets fastest lap — ${formatLapTime(lapTime)}` });
      }
    }

    const newOrder = [...running].sort((a, b) => traces.get(a)!.lapEnd[L - 1] - traces.get(b)!.lapEnd[L - 1]);
    newOrder.forEach((id, i) => traces.get(id)!.positions.push(i + 1));

    if (L > 1) {
      const prevPos = new Map(prevOrder.map((id, i) => [id, i]));
      for (let i = 0; i < newOrder.length; i++) {
        const a = newOrder[i];
        const ta = traces.get(a)!;
        if (ta.pitLaps.includes(L)) continue;
        for (let j = i + 1; j < newOrder.length; j++) {
          const b = newOrder[j];
          if (traces.get(b)!.pitLaps.includes(L)) continue;
          if ((prevPos.get(a) ?? 0) > (prevPos.get(b) ?? 0)) {
            overtakes++;
            if (i < 12) {
              events.push({
                id: `ot-${a}-${b}-${L}`,
                kind: 'overtake',
                time: ta.lapEnd[L - 1] - ta.lapTimes[L - 1] * 0.35,
                lap: L,
                driverId: a,
                otherDriverId: b,
                text: `${code(a)} passes ${code(b)} for P${i + 1}`,
              });
            }
          }
        }
      }
    }
    order = newOrder;
  }

  // Chequered flag: everyone finishes the lap they are on when the winner crosses the line.
  const winnerId = order[0];
  const winnerTime = traces.get(winnerId)!.lapEnd[N - 1];
  for (const id of running) {
    const tr = traces.get(id)!;
    const k = tr.lapEnd.findIndex((e) => e >= winnerTime - 1e-6);
    const laps = k === -1 ? tr.lapEnd.length : k + 1;
    for (const key of ['lapEnd', 'lapTimes', 'sectorSplit', 'compound', 'positions'] as const) tr[key].length = laps;
    tr.finishTime = tr.lapEnd[laps - 1];
  }

  const scPeriods = safetyCarPeriods.map((p) => {
    const leaderEnds = traces.get(winnerId)!.lapEnd;
    const startTime = leaderEnds[p.startLap - 2] ?? 0;
    const endTime = leaderEnds[p.endLap - 1] ?? startTime;
    events.push({ id: `sc-${p.startLap}`, kind: 'safety-car', time: startTime, lap: p.startLap, text: 'Safety car deployed' });
    events.push({ id: `sce-${p.endLap}`, kind: 'safety-car-end', time: endTime - ref * 0.4, lap: p.endLap, text: 'Safety car in this lap — racing resumes' });
    return { ...p, startTime, endTime };
  });

  const finishers = [...running].sort((a, b) => {
    const ta = traces.get(a)!;
    const tb = traces.get(b)!;
    return tb.lapEnd.length - ta.lapEnd.length || (ta.finishTime as number) - (tb.finishTime as number);
  });
  const retirees = gridOrder
    .filter((id) => !running.has(id))
    .sort((a, b) => traces.get(b)!.retired!.time - traces.get(a)!.retired!.time);

  const classification: RaceClassification[] = [...finishers, ...retirees].map((id, i) => {
    const tr = traces.get(id)!;
    const laps = tr.lapEnd.length;
    const finished = tr.finishTime != null;
    const valid = tr.lapTimes.filter((_, li) => !tr.pitLaps.includes(li + 1) && li > 0);
    const best = Math.min(...(valid.length ? valid : tr.lapTimes.length ? tr.lapTimes : [NaN]));
    return {
      driverId: id,
      position: i + 1,
      grid: tr.grid,
      status: !finished ? 'dnf' : laps < N ? 'lapped' : 'finished',
      reason: tr.retired?.reason,
      lapsCompleted: laps,
      totalTime: finished ? tr.finishTime : null,
      gapToWinner: finished && laps === N ? (tr.finishTime as number) - winnerTime : null,
      bestLap: best,
      bestLapNumber: tr.lapTimes.indexOf(best) + 1,
      points: finished ? (POINTS[i] ?? 0) : 0,
      pitStops: tr.pitLaps.length,
    };
  });

  events.push({ id: 'finish', kind: 'finish', time: winnerTime, lap: N, driverId: winnerId, text: `${code(winnerId)} takes the chequered flag` });
  events.sort((a, b) => a.time - b.time);

  const wet = event.weather !== 'dry';
  const air = wet ? rng.range(14, 19) : rng.range(21, 31);
  const lastFinish = Math.max(...[...running].map((id) => traces.get(id)!.finishTime as number));

  return {
    kind: 'race',
    eventId: event.id,
    session: 'R',
    totalLaps: N,
    duration: lastFinish + 25,
    winnerTime,
    traces: gridOrder.map((id) => traces.get(id)!),
    safetyCar: scPeriods,
    events,
    classification,
    fastestLap: fastest,
    overtakes,
    weather: event.weather,
    airTemp: air,
    trackTemp: air + (wet ? rng.range(2, 5) : rng.range(9, 18)),
  };
}
