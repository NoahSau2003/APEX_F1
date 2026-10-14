import { useSyncExternalStore } from 'react';

export const ROUTES = ['overview', 'live', 'predictions', 'drivers', 'teams', 'intel', 'history', 'settings'] as const;
export type Route = (typeof ROUTES)[number];

function parse(): { route: Route; query: string } {
  const [path, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  return { route: ROUTES.includes(path as Route) ? (path as Route) : 'overview', query };
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export const useRoute = () => useSyncExternalStore(subscribe, () => parse().route);

/** A single query parameter from the hash, e.g. #/intel?article=n01. */
export const useRouteParam = (name: string) => useSyncExternalStore(subscribe, () => new URLSearchParams(parse().query).get(name));

/** Client-side navigation via the hash: no page reloads, back/forward work. */
export function navigate(route: Route, params?: Record<string, string>) {
  const query = params ? new URLSearchParams(params).toString() : '';
  const hash = `#/${route}${query ? `?${query}` : ''}`;
  if (window.location.hash !== hash) window.location.hash = hash;
}

/** Update query parameters on the current route without adding history entries. */
export function setRouteParams(params: Record<string, string | null>) {
  const { route, query } = parse();
  const q = new URLSearchParams(query);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  history.replaceState(null, '', `#/${route}${s ? `?${s}` : ''}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
