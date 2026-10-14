import type { Circuit, Driver, QualifyingClassification, RaceEvent, RaceTimelineEvent, SessionType, TyreCompound } from '@/types/domain';
import { DRIVER_MODEL } from '@/demo/data/demoModel';
import { createRng, type Rng } from '@/utils/random';
import { formatLapTime } from '@/utils/format';
import { eventSeed, weatherLapFactor, weekendPace } from './pace';
import type { TrackModel } from './track';
import type { TimedLap, TimedSimulation, TimedTrace } from './types';

export function splitFor(track: TrackModel, rng: Rng): [number, number, number] {
  const w = track.sectorWeights.map((x) => Math.max(0.05, x * (1 + rng.gauss() * 0.006)));
  const s = w[0] + w[1] + w[2];
  return [w[0] / s, w[1] / s, w[2] / s];
}

const Q_SEGMENTS: [number, number][] = [
  [0, 18 * 60],
  [25 * 60, 40 * 60],
  [48 * 60, 60 * 60],
];

const SEGMENT_NAMES = ['Q1', 'Q2', 'Q3'];

export function simulateQualifying(event: RaceEvent, circuit: Circuit, track: TrackModel, drivers: Driver[]): TimedSimulation {
  const rng = createRng(eventSeed(event, 'qualifying'));
  const ref = circuit.referenceLap * weatherLapFactor(event.weather);
  const wet = event.weather === 'wet';
  const compound: TyreCompound = wet ? 'I' : 'S';

  const base = new Map(drivers.map((d) => [d.id, ref * (1 + weekendPace(d, event, circuit) / 100) * 0.986]));
  const noise = (id: string) => rng.gauss() * DRIVER_MODEL[id].consistency * 0.006 * ref;

  // Knockout: Q1 (all) → Q2 (15) → Q3 (10).
  const times: Record<string, (number | null)[]> = {};
  let field = drivers.map((d) => d.id);
  const advance = [15, 10];
  for (let seg = 0; seg < 3; seg++) {
    const evolution = seg * 0.18;
    for (const id of field) {
      times[id] ??= [null, null, null];
      times[id][seg] = (base.get(id) as number) - evolution + noise(id);
    }
    if (seg < 2) field = [...field].sort((a, b) => (times[a][seg] as number) - (times[b][seg] as number)).slice(0, advance[seg]);
  }

  const classification: QualifyingClassification[] = drivers
    .map((d) => d.id)
    .sort((a, b) => {
      const ra = times[a].filter((t) => t != null).length;
      const rb = times[b].filter((t) => t != null).length;
      if (ra !== rb) return rb - ra;
      return (times[a][ra - 1] as number) - (times[b][rb - 1] as number);
    })
    .map((id, i) => ({ driverId: id, position: i + 1, q1: times[id][0] as number, q2: times[id][1], q3: times[id][2] }));

  const traces: TimedTrace[] = drivers.map((d) => {
    const laps: TimedLap[] = [];
    for (let seg = 0; seg < 3; seg++) {
      const best = times[d.id][seg];
      if (best == null) continue;
      const [s0, s1] = Q_SEGMENTS[seg];
      const out = ref * 1.32;
      const cool = ref * 1.38;
      // First run early in the segment, final run timed to finish before the flag.
      // Short segments on long laps only leave room for a single run.
      const run2PushEnd = s1 - rng.range(8, 40);
      const run2 = run2PushEnd - best - out;
      const run1Push = best + rng.range(0.15, 0.7);
      const run1 = s0 + rng.range(20, 90);
      const twoRuns = run1 + out + run1Push + cool + 40 < run2;
      const runs: [number, number][] = twoRuns ? [[run1, run1Push], [run2, best]] : [[run2, best]];
      for (const [start, push] of runs) {
        laps.push({ start, duration: out, kind: 'out', segment: seg, compound, sectorSplit: splitFor(track, rng) });
        laps.push({ start: start + out, duration: push, kind: 'push', segment: seg, compound, sectorSplit: splitFor(track, rng) });
        laps.push({ start: start + out + push, duration: cool, kind: 'in', segment: seg, compound, sectorSplit: splitFor(track, rng) });
      }
    }
    laps.sort((a, b) => a.start - b.start);
    return { driverId: d.id, laps };
  });

  const events = timedEvents(traces, Q_SEGMENTS, SEGMENT_NAMES, drivers);
  for (let seg = 0; seg < 2; seg++) {
    const out = classification.filter((c) => [c.q1, c.q2, c.q3].filter((t) => t != null).length === seg + 1);
    const codes = out.map((c) => drivers.find((d) => d.id === c.driverId)?.code).join(', ');
    events.push({ id: `elim-${seg}`, kind: 'flag', time: Q_SEGMENTS[seg][1], lap: 0, text: `${SEGMENT_NAMES[seg]} ended — eliminated: ${codes}` });
  }
  events.sort((a, b) => a.time - b.time);

  return {
    kind: 'timed',
    eventId: event.id,
    session: 'Q',
    duration: 60 * 60,
    segments: Q_SEGMENTS,
    advance,
    traces,
    events,
    qualifying: classification,
    weather: event.weather,
    ...temps(event, rng),
  };
}

const PRACTICE_OFFSET: Record<'FP1' | 'FP2' | 'FP3', number> = { FP1: 1.6, FP2: 1.1, FP3: 0.7 };

export function simulatePractice(
  event: RaceEvent,
  circuit: Circuit,
  track: TrackModel,
  drivers: Driver[],
  session: 'FP1' | 'FP2' | 'FP3',
): TimedSimulation {
  const rng = createRng(eventSeed(event, session));
  const ref = circuit.referenceLap * weatherLapFactor(event.weather);
  const duration = 60 * 60;
  const wet = event.weather === 'wet';

  const traces: TimedTrace[] = drivers.map((d) => {
    const pace = ref * (1 + weekendPace(d, event, circuit) / 100) * 0.99 + PRACTICE_OFFSET[session];
    const laps: TimedLap[] = [];
    let t = rng.range(60, 9 * 60);
    let run = 0;
    while (t < duration - ref * 3) {
      const longRun = session === 'FP2' && run === 2;
      const pushLaps = longRun ? rng.int(6, 9) : rng.int(1, 3);
      const compound: TyreCompound = wet ? 'I' : longRun ? 'M' : (['S', 'M', 'H'] as const)[rng.int(0, 2)];
      const compoundDelta = compound === 'S' ? -0.5 : compound === 'H' ? 0.4 : 0;
      laps.push({ start: t, duration: ref * 1.3, kind: 'out', segment: 0, compound, sectorSplit: splitFor(track, rng) });
      t += ref * 1.3;
      for (let i = 0; i < pushLaps && t < duration - ref; i++) {
        const fuel = longRun ? 1.4 - i * 0.06 : 0;
        const time = pace + compoundDelta + fuel + Math.abs(rng.gauss()) * DRIVER_MODEL[d.id].consistency * 0.008 * ref;
        laps.push({ start: t, duration: time, kind: 'push', segment: 0, compound, sectorSplit: splitFor(track, rng) });
        t += time;
      }
      laps.push({ start: t, duration: ref * 1.35, kind: 'in', segment: 0, compound, sectorSplit: splitFor(track, rng) });
      t += ref * 1.35 + rng.range(4 * 60, 11 * 60);
      run++;
    }
    return { driverId: d.id, laps: laps.filter((l) => l.start + l.duration <= duration) };
  });

  return {
    kind: 'timed',
    eventId: event.id,
    session,
    duration,
    segments: [[0, duration]],
    advance: [],
    traces,
    events: timedEvents(traces, [[0, duration]], [session], drivers),
    weather: event.weather,
    ...temps(event, rng),
  };
}

function temps(event: RaceEvent, rng: Rng) {
  const wet = event.weather !== 'dry';
  const air = wet ? rng.range(14, 19) : rng.range(21, 31);
  return { airTemp: air, trackTemp: air + (wet ? rng.range(2, 5) : rng.range(9, 18)) };
}

/** Session start/end and every new overall-fastest push lap. */
function timedEvents(
  traces: TimedTrace[],
  segments: [number, number][],
  names: string[],
  drivers: Driver[],
): RaceTimelineEvent[] {
  const events: RaceTimelineEvent[] = [];
  const code = (id: string) => drivers.find((d) => d.id === id)?.code ?? id;
  segments.forEach(([s0, s1], seg) => {
    events.push({ id: `seg-start-${seg}`, kind: 'start', time: s0, lap: 0, text: `${names[seg]} — green light, pit exit open` });
    const pushes = traces
      .flatMap((tr) => tr.laps.filter((l) => l.kind === 'push' && l.segment === seg).map((l) => ({ tr, l })))
      .sort((a, b) => a.l.start + a.l.duration - (b.l.start + b.l.duration));
    let best = Infinity;
    for (const { tr, l } of pushes) {
      if (l.duration < best) {
        best = l.duration;
        events.push({
          id: `fl-${seg}-${tr.driverId}-${Math.round(l.start)}`,
          kind: 'fastest-lap',
          time: l.start + l.duration,
          lap: 0,
          driverId: tr.driverId,
          text: `${code(tr.driverId)} tops ${names[seg]} with ${formatLapTime(l.duration)}`,
        });
      }
    }
    if (seg === segments.length - 1) events.push({ id: `seg-end-${seg}`, kind: 'finish', time: s1, lap: 0, text: `Chequered flag — ${names[seg]} complete` });
  });
  return events.sort((a, b) => a.time - b.time);
}

export const SESSION_ORDER: SessionType[] = ['FP1', 'FP2', 'FP3', 'Q', 'R'];
