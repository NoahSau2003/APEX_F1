import { useEffect, useMemo, useState } from 'react';
import type { SessionInfo } from '@/services/api/types';
import { useStore } from '@/state/store';
import { bindSession, startReplayClock, unbindSession } from './clock';
import { LocationLoader, loaderStore } from './loader';

/** Where a replay opens: lights out for races and sprints, otherwise the first sample. */
export function initialReplayTime(info: SessionInfo): number {
  const { session_start, first_sample } = info.timeline;
  return info.kind === 'race' && session_start != null ? session_start - 5 : first_sample;
}

/**
 * Binds the replay clock and a location loader to one session. Switching session
 * cancels outstanding downloads and drops the previous session's samples before the
 * new session is shown.
 */
export function useReplay(info: SessionInfo | undefined) {
  const [loader, setLoader] = useState<LocationLoader | null>(null);
  const progress = useStore(loaderStore, (s) => s);

  useEffect(() => {
    if (!info) return;
    startReplayClock();
    bindSession(info.id, info.timeline.first_sample, info.timeline.last_sample, initialReplayTime(info));
    const l = new LocationLoader(info);
    setLoader(l);
    void l.run();
    return () => {
      l.cancel();
      setLoader(null);
      unbindSession();
    };
  }, [info]);

  const current = loader && info && loader.engine.sessionId === info.id ? loader : null;
  return useMemo(() => ({ loader: current, progress: progress.sessionId === info?.id ? progress : null }), [current, progress, info?.id]);
}
