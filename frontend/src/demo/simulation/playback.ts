import type { TyreCompound } from '@/types/domain';
import { lowerIndex } from '@/utils/math';
import { PIT_POINT } from './race';
import { distanceAtTimeFrac, timeFracAtDistance, type TrackModel } from './track';
import type {
  CarState,
  RaceSimulation,
  RaceTrace,
  SessionSimulation,
  SessionSnapshot,
  TimedSimulation,
  TimedTrace,
  TimingRow,
} from './types';

/**
 * Pure functions that answer "where is every car at time t?". They are cheap
 * enough to call every animation frame and contain no React.
 */

/** Lateral offset of the pit lane from the centreline, metres. */
export const PIT_LANE_OFFSET = 26;

/** Driver-specific racing-line offset so cars running close together don't overlap. */
const laneFor = (index: number) => ((index % 5) - 2) * 2.6;

function refCum(track: TrackModel): [number, number, number] {
  const w = track.sectorWeights;
  return [0, w[0], w[0] + w[1]];
}

/** Lap-time fraction (with per-lap sector split) → distance fraction. */
function lapDistance(track: TrackModel, split: [number, number, number], tf: number): number {
  const cum = [0, split[0], split[0] + split[1]];
  const rc = refCum(track);
  const j = tf < cum[1] ? 0 : tf < cum[2] ? 1 : 2;
  const local = split[j] > 0 ? (tf - cum[j]) / split[j] : 0;
  return distanceAtTimeFrac(track, rc[j] + local * track.sectorWeights[j]);
}

/** Distance fraction → lap-time fraction (inverse of lapDistance). */
function lapTimeFrac(track: TrackModel, split: [number, number, number], s: number): number {
  const rc = refCum(track);
  const p = timeFracAtDistance(track, s);
  const j = p < rc[1] ? 0 : p < rc[2] ? 1 : 2;
  const local = (p - rc[j]) / track.sectorWeights[j];
  const cum = [0, split[0], split[0] + split[1]];
  return cum[j] + local * split[j];
}

// ---------------------------------------------------------------- race ----

function raceCarState(tr: RaceTrace, index: number, track: TrackModel, t: number, refLap: number): CarState {
  const base: CarState = {
    driverId: tr.driverId,
    visible: true,
    distance: tr.startOffset,
    lapFrac: (tr.startOffset + 1) % 1,
    lap: 1,
    status: 'grid',
    lateral: laneFor(index),
    pace: 1,
  };
  if (t <= 0) return base;
  if (tr.retired && t >= tr.retired.time) {
    return { ...base, visible: false, status: 'retired', distance: tr.retired.lap + tr.retired.distance, lap: tr.retired.lap + 1 };
  }
  if (tr.finishTime != null && t >= tr.finishTime) {
    const laps = tr.lapEnd.length;
    const cool = (t - tr.finishTime) / (refLap * 1.5);
    if (cool > 0.92) return { ...base, visible: false, status: 'finished', distance: laps, lapFrac: 0, lap: laps };
    const s = distanceAtTimeFrac(track, cool);
    return { ...base, status: 'finished', distance: laps + s, lapFrac: s, lap: laps, pace: 1.5 };
  }

  // Lap in progress (k is 0-based). A retired car is still driving its final partial lap.
  let k = lowerIndex(tr.lapEnd, t) + 1;
  const lapStart = k === 0 ? 0 : tr.lapEnd[k - 1];
  let lapTime = tr.lapTimes[k];
  let split = tr.sectorSplit[k];
  if (lapTime == null) {
    // Final partial lap before a retirement: extrapolate from the last lap.
    lapTime = tr.lapTimes[k - 1] ?? refLap;
    split = tr.sectorSplit[k - 1] ?? track.sectorWeights;
    k = tr.lapEnd.length;
  }
  const inLap = t - lapStart;
  const pitIdx = tr.pitLaps.indexOf(k + 1);
  const loss = pitIdx >= 0 ? tr.pitLoss[pitIdx] : 0;
  const drive = lapTime - loss;
  let tf: number;
  let status: CarState['status'] = 'running';
  let lateral = base.lateral;
  if (pitIdx >= 0) {
    const stopAt = drive * lapTimeFrac(track, split, PIT_POINT);
    if (inLap < stopAt) tf = inLap / drive;
    else if (inLap < stopAt + loss) {
      tf = lapTimeFrac(track, split, PIT_POINT);
      status = 'pit';
      // Ease into and out of the pit lane.
      const into = Math.min(1, (inLap - stopAt) / 2.5, (stopAt + loss - inLap) / 2.5);
      lateral = base.lateral + PIT_LANE_OFFSET * Math.max(0, into);
    } else tf = (inLap - loss) / drive;
  } else tf = inLap / lapTime;

  let s = lapDistance(track, split, Math.min(1, tf));
  if (k === 0) s = tr.startOffset + (1 - tr.startOffset) * s;
  return {
    ...base,
    distance: k + s,
    lapFrac: ((s % 1) + 1) % 1,
    lap: k + 1,
    status,
    lateral,
    pace: drive / refLap,
  };
}

/** Session time at which a trace reached a total race distance. */
function raceTimeAtDistance(tr: RaceTrace, track: TrackModel, d: number): number | null {
  const k = Math.floor(d);
  if (k < 0) return 0;
  if (k >= tr.lapTimes.length) return null;
  let s = d - k;
  const lapStart = k === 0 ? 0 : tr.lapEnd[k - 1];
  if (k === 0) s = (s - tr.startOffset) / (1 - tr.startOffset);
  const pitIdx = tr.pitLaps.indexOf(k + 1);
  const loss = pitIdx >= 0 ? tr.pitLoss[pitIdx] : 0;
  const drive = tr.lapTimes[k] - loss;
  let inLap = lapTimeFrac(track, tr.sectorSplit[k], s) * drive;
  if (pitIdx >= 0 && s > PIT_POINT) inLap += loss;
  return lapStart + inLap;
}

function raceSnapshot(sim: RaceSimulation, track: TrackModel, t: number, refLap: number): SessionSnapshot {
  const states = sim.traces.map((tr, i) => raceCarState(tr, i, track, t, refLap));
  const live = sim.traces
    .map((tr, i) => ({ tr, st: states[i] }))
    .sort((a, b) => {
      const ra = a.st.status === 'retired';
      const rb = b.st.status === 'retired';
      if (ra !== rb) return ra ? 1 : -1;
      if (ra && rb) return (b.tr.retired?.time ?? 0) - (a.tr.retired?.time ?? 0);
      // Once flagged, finishers are ordered by classification.
      const fa = a.st.status === 'finished';
      const fb = b.st.status === 'finished';
      if (fa && fb) return a.tr.lapEnd.length !== b.tr.lapEnd.length ? b.tr.lapEnd.length - a.tr.lapEnd.length : (a.tr.finishTime as number) - (b.tr.finishTime as number);
      const da = fa ? a.tr.lapEnd.length : a.st.distance;
      const db = fb ? b.tr.lapEnd.length : b.st.distance;
      if (fa !== fb && Math.floor(da) === Math.floor(db)) return fa ? -1 : 1;
      return db - da;
    });

  const leader = live[0];
  const leaderLap = leader.st.lap;
  const overallBest = bestRaceLap(sim, t);

  const rows: TimingRow[] = live.map(({ tr, st }, i) => {
    const done = completedLaps(tr, t);
    const lastLap = done > 0 ? tr.lapTimes[done - 1] : null;
    const valid = tr.lapTimes.slice(0, done).filter((_, li) => li > 0 && !tr.pitLaps.includes(li + 1));
    const best = valid.length ? Math.min(...valid) : null;
    const stint = tr.compound[Math.min(done, tr.compound.length - 1)] ?? tr.compound[0] ?? 'M';
    const stops = tr.pitLaps.filter((p) => p <= done).length;
    const lastPit = [...tr.pitLaps].reverse().find((p) => p <= done);
    const tyreAge = done - (lastPit ?? 0);

    let gap: number | null = null;
    let interval: number | null = null;
    let lapsDown = 0;
    if (st.status === 'finished' || st.status === 'retired') {
      gap = st.status === 'finished' && leader.tr.finishTime != null ? (tr.finishTime as number) - (leader.tr.finishTime as number) : null;
      lapsDown = st.status === 'finished' ? Math.max(0, leader.tr.lapEnd.length - tr.lapEnd.length) : 0;
    } else if (i > 0) {
      const ld = leader.st.status === 'finished' ? leader.tr.lapEnd.length : leader.st.distance;
      lapsDown = Math.max(0, Math.floor(ld - st.distance));
      const lt = raceTimeAtDistance(leader.tr, track, st.distance);
      gap = lt != null ? Math.max(0, t - lt) : null;
      const ahead = live[i - 1];
      const at = raceTimeAtDistance(ahead.tr, track, st.distance);
      interval = at != null ? Math.max(0, t - at) : null;
    }

    const sectorIdx = sectorOf(track, st.lapFrac);
    const lapIdx = Math.min(done, tr.lapTimes.length - 1);
    const sectors: (number | null)[] = [null, null, null];
    if (lapIdx >= 0 && tr.lapTimes[lapIdx] != null) {
      const sp = tr.sectorSplit[lapIdx];
      for (let j = 0; j < sectorIdx - 1; j++) sectors[j] = sp[j] * tr.lapTimes[lapIdx];
    }

    return {
      driverId: tr.driverId,
      position: i + 1,
      change: tr.grid - (i + 1),
      gap: i === 0 ? 0 : gap,
      interval: i === 0 ? 0 : interval,
      lapsDown,
      lap: st.lap,
      lastLap,
      bestLap: best,
      sector: sectorIdx,
      sectors,
      compound: stint as TyreCompound,
      tyreAge,
      pitStops: stops,
      status: st.status,
      lastLapFlag:
        lastLap != null && overallBest && Math.abs(lastLap - overallBest.time) < 1e-6 && overallBest.driverId === tr.driverId
          ? 'overall'
          : lastLap != null && best != null && Math.abs(lastLap - best) < 1e-6
            ? 'personal'
            : 'none',
    };
  });

  const sc = sim.safetyCar.find((p) => t >= p.startTime && t < p.endTime);
  const flagged = t >= sim.winnerTime;
  const recentRetire = sim.traces.some((tr) => tr.retired && t >= tr.retired.time && t - tr.retired.time < 25);
  return {
    time: t,
    lap: Math.min(leaderLap, sim.totalLaps),
    totalLaps: sim.totalLaps,
    rows,
    trackStatus: flagged ? 'chequered' : sc ? 'sc' : recentRetire ? 'yellow' : 'green',
    fastest: overallBest,
    segmentLabel: null,
    remaining: null,
  };
}

function completedLaps(tr: RaceTrace, t: number): number {
  return lowerIndex(tr.lapEnd, t) + 1;
}

function bestRaceLap(sim: RaceSimulation, t: number) {
  let best: { driverId: string; time: number; lap: number } | null = null;
  for (const tr of sim.traces) {
    const done = completedLaps(tr, t);
    for (let i = 1; i < done; i++) {
      if (tr.pitLaps.includes(i + 1)) continue;
      if (!best || tr.lapTimes[i] < best.time) best = { driverId: tr.driverId, time: tr.lapTimes[i], lap: i + 1 };
    }
  }
  return best;
}

function sectorOf(track: TrackModel, s: number): 1 | 2 | 3 {
  return s < track.sectorStarts[0] ? 1 : s < track.sectorStarts[1] ? 2 : 3;
}

// --------------------------------------------------------------- timed ----

function findLap(tr: TimedTrace, t: number) {
  let lo = 0;
  let hi = tr.laps.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tr.laps[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  const lap = tr.laps[found];
  return t < lap.start + lap.duration ? { lap, index: found } : null;
}

function timedCarState(tr: TimedTrace, index: number, track: TrackModel, t: number, refLap: number): CarState {
  const hit = findLap(tr, t);
  const base: CarState = { driverId: tr.driverId, visible: false, distance: 0, lapFrac: 0, lap: 0, status: 'garage', lateral: laneFor(index), pace: 1 };
  if (!hit) return base;
  const tf = (t - hit.lap.start) / hit.lap.duration;
  const s = lapDistance(track, hit.lap.sectorSplit, tf);
  return { ...base, visible: true, distance: s, lapFrac: s, lap: hit.index + 1, status: 'running', pace: hit.lap.duration / refLap };
}

function timedSnapshot(sim: TimedSimulation, track: TrackModel, t: number, refLap: number): SessionSnapshot {
  const segIdx = Math.max(0, sim.segments.findIndex(([, e]) => t < e) === -1 ? sim.segments.length - 1 : sim.segments.findIndex(([, e]) => t < e));
  const ranking = (time: number) => rankTimed(sim, time, segIdx);
  const now = ranking(t);
  const before = ranking(Math.max(0, t - 300));
  const prevPos = new Map(before.map((r, i) => [r.driverId, i + 1]));
  const leaderBest = now[0]?.best ?? null;
  let fastest: SessionSnapshot['fastest'] = null;

  const rows: TimingRow[] = now.map((r, i) => {
    const tr = sim.traces.find((x) => x.driverId === r.driverId)!;
    const st = timedCarState(tr, sim.traces.indexOf(tr), track, t, refLap);
    const doneLaps = tr.laps.filter((l) => l.start + l.duration <= t);
    const lastPush = [...doneLaps].reverse().find((l) => l.kind === 'push');
    const hit = findLap(tr, t);
    const current = hit?.lap ?? doneLaps[doneLaps.length - 1];
    const sectorIdx = st.visible ? sectorOf(track, st.lapFrac) : 1;
    const sectors: (number | null)[] = [null, null, null];
    if (hit && hit.lap.kind === 'push') {
      for (let j = 0; j < sectorIdx - 1; j++) sectors[j] = hit.lap.sectorSplit[j] * hit.lap.duration;
    }
    if (r.bestOverall != null && (!fastest || r.bestOverall < fastest.time)) fastest = { driverId: r.driverId, time: r.bestOverall, lap: 0 };
    const ahead = now[i - 1];
    return {
      driverId: r.driverId,
      position: i + 1,
      change: (prevPos.get(r.driverId) ?? i + 1) - (i + 1),
      gap: r.best != null && leaderBest != null ? r.best - leaderBest : null,
      interval: r.best != null && ahead?.best != null ? r.best - ahead.best : null,
      lapsDown: 0,
      lap: doneLaps.length + (hit ? 1 : 0),
      lastLap: lastPush ? lastPush.duration : null,
      bestLap: r.best,
      sector: sectorIdx,
      sectors,
      compound: current?.compound ?? 'S',
      tyreAge: 0,
      pitStops: 0,
      status: st.visible ? 'running' : 'garage',
      lastLapFlag: lastPush && r.best != null && Math.abs(lastPush.duration - r.best) < 1e-6 ? (i === 0 ? 'overall' : 'personal') : 'none',
    };
  });

  const [, segEnd] = sim.segments[segIdx];
  const inBreak = sim.segments.every(([s, e]) => t < s || t >= e);
  const finished = t >= sim.duration;
  return {
    time: t,
    lap: 0,
    totalLaps: null,
    rows,
    trackStatus: finished ? 'chequered' : inBreak ? 'yellow' : 'green',
    fastest,
    segmentLabel: sim.session === 'Q' ? `Q${segIdx + 1}${inBreak && !finished ? ' · break' : ''}` : null,
    remaining: Math.max(0, segEnd - t),
  };
}

function rankTimed(sim: TimedSimulation, t: number, segIdx: number) {
  const entries = sim.traces.map((tr) => {
    const done = tr.laps.filter((l) => l.kind === 'push' && l.start + l.duration <= t);
    const segBest = (seg: number) => {
      const ls = done.filter((l) => l.segment === seg);
      return ls.length ? Math.min(...ls.map((l) => l.duration)) : null;
    };
    const reached = sim.session === 'Q' ? new Set(tr.laps.map((l) => l.segment)).size : 1;
    const level = Math.min(reached, segIdx + 1);
    let best = segBest(level - 1);
    let levelKey = level;
    if (best == null && level > 1) {
      // No time yet in the current segment: rank by previous segment time, behind runners with times.
      best = segBest(level - 2);
      levelKey = level - 0.5;
    }
    const all = done.length ? Math.min(...done.map((l) => l.duration)) : null;
    return { driverId: tr.driverId, best, levelKey, bestOverall: all };
  });
  return entries.sort((a, b) => {
    if (a.levelKey !== b.levelKey) return b.levelKey - a.levelKey;
    if (a.best == null || b.best == null) return a.best == null ? (b.best == null ? 0 : 1) : -1;
    return a.best - b.best;
  });
}

// -------------------------------------------------------------- public ----

export function carStates(sim: SessionSimulation, track: TrackModel, t: number, refLap: number, out?: CarState[]): CarState[] {
  const res = out ?? [];
  if (sim.kind === 'race') sim.traces.forEach((tr, i) => (res[i] = raceCarState(tr, i, track, t, refLap)));
  else sim.traces.forEach((tr, i) => (res[i] = timedCarState(tr, i, track, t, refLap)));
  return res;
}

export function snapshot(sim: SessionSimulation, track: TrackModel, t: number, refLap: number): SessionSnapshot {
  return sim.kind === 'race' ? raceSnapshot(sim, track, t, refLap) : timedSnapshot(sim, track, t, refLap);
}

/** Session time when the race leader starts a given lap (1-based). */
export function timeAtLeaderLap(sim: RaceSimulation, lap: number): number {
  const winner = sim.traces.find((t) => t.driverId === sim.classification[0].driverId)!;
  return lap <= 1 ? 0 : winner.lapEnd[Math.min(lap - 2, winner.lapEnd.length - 1)];
}
