import { useMemo, useState } from 'react';
import { Bell, CircleUser, ExternalLink, Keyboard, LogOut, Menu, MonitorPlay, Newspaper, RotateCcw, Server, ServerOff, Settings } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useQuery } from '@/hooks/useQuery';
import { API_BASE_URL, api } from '@/services/api/client';
import type { Meeting } from '@/services/api/types';
import { selectMeeting, selectSession, selectYear, useHistoricalContext } from '@/state/historical';
import { navigate } from '@/state/router';
import { resetSettings } from '@/state/settings';
import { formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { MenuItem, Popover } from '@/components/ui/Popover';
import { Select } from '@/components/ui/Select';
import { NAV } from './nav';

export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="flex shrink-0 flex-col border-b border-line bg-surface">
      <div className="flex h-12 items-center gap-2 px-3 md:px-4">
        <IconButton label="Open navigation" className="md:hidden" onClick={onOpenNav}>
          <Menu />
        </IconButton>
        <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
          <SessionSelectors />
        </div>
        <div className="flex-1 sm:hidden">
          <span className="text-[13px] font-semibold">Apex</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <DataStatus />
          <Notifications />
          <ProfileMenu />
        </div>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto border-t border-line px-3 py-2 sm:hidden">
        <SessionSelectors />
      </div>
    </header>
  );
}

function SessionSelectors() {
  const ctx = useHistoricalContext();
  const wide = useMediaQuery('(min-width: 1180px)');
  const seasons = ctx.seasons.data?.seasons ?? [];
  const meetings = ctx.meetings.data ?? [];

  return (
    <>
      <Select
        label="Season"
        value={ctx.year ?? 0}
        onChange={(y) => selectYear(y)}
        className="w-[92px] shrink-0"
        options={seasons.length ? seasons.map((y) => ({ value: y, label: String(y), text: String(y) })) : [{ value: 0, label: ctx.seasons.status === 'error' ? 'Offline' : '…', text: '…' }]}
      />
      <Select
        label="Grand Prix"
        value={ctx.meeting?.id ?? ''}
        onChange={(id) => {
          const m = meetings.find((x) => x.id === id);
          if (m) selectMeeting(m);
        }}
        className="w-[200px] shrink-0 sm:w-[240px] sm:min-w-0 sm:shrink"
        menuClassName="w-[320px]"
        options={
          meetings.length
            ? meetings.map((m) => ({
                value: m.id,
                text: m.name,
                group: m.sessions.some((s) => s.replay_available) ? 'Completed' : 'Scheduled',
                disabled: !m.sessions.some((s) => s.replay_available),
                label: (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="num w-6 shrink-0 text-[11px] text-fg-3">R{m.round}</span>
                    <span className="truncate">{m.name.replace(' Grand Prix', ' GP')}</span>
                  </span>
                ),
                hint: m.date ? formatDate(m.date.slice(0, 10), { day: 'numeric', month: 'short' }) : undefined,
              }))
            : [{ value: '', label: ctx.meetings.status === 'error' ? 'Unavailable' : 'Loading…', text: '' }]
        }
      />
      <Select
        label="Session"
        value={ctx.session?.id ?? ''}
        onChange={selectSession}
        className="w-[150px] shrink-0"
        options={
          ctx.meeting?.sessions.map((s) => ({
            value: s.id,
            text: s.name,
            label: s.name,
            disabled: !s.replay_available,
            hint: s.replay_available ? undefined : 'n/a',
          })) ?? [{ value: '', label: '…', text: '' }]
        }
      />
      {ctx.session && wide && <ReplayStatus meeting={ctx.meeting} replayable={ctx.session.replay_available} date={ctx.session.date_utc} />}
    </>
  );
}

function ReplayStatus({ meeting, replayable, date }: { meeting?: Meeting; replayable: boolean; date: string | null }) {
  return (
    <Badge tone={replayable ? 'info' : 'neutral'} icon={<MonitorPlay />} title={replayable ? `Recorded session data available for ${meeting?.name}. Historical replay — not live.` : 'No recorded data for this session'}>
      {replayable ? 'Historical' : 'Unavailable'}
      {date && <span className="font-normal text-fg-3"> · {formatDate(date.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
    </Badge>
  );
}

function DataStatus() {
  const health = useQuery('api:health', () => api.health());
  const ok = health.status === 'success';
  return (
    <Popover
      label="Data sources"
      className="w-80 p-3"
      trigger={({ toggle, ref, open, id }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={id}
          className={cn(
            'mr-1 flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-medium transition-colors',
            ok ? 'border-[rgb(91_147_245/0.3)] bg-[rgb(91_147_245/0.08)] text-info' : 'border-[rgb(229_72_77/0.35)] bg-[rgb(229_72_77/0.1)] text-[#ff7a7c]',
          )}
        >
          <span className={cn('size-1.5 rounded-full', ok ? 'bg-info' : health.status === 'loading' ? 'bg-fg-3' : 'bg-bad')} />
          <span className="max-sm:hidden">{ok ? 'Historical data' : health.status === 'loading' ? 'Connecting…' : 'Backend offline'}</span>
        </button>
      )}
    >
      {() => (
        <div className="flex flex-col gap-2.5 text-[12px]">
          <div className="flex items-center gap-2">
            {ok ? <Server className="size-4 text-good" /> : <ServerOff className="size-4 text-bad" />}
            <span className="font-medium">{ok ? `Local backend v${health.data!.version}` : 'Backend not reachable'}</span>
          </div>
          <p className="text-fg-3">
            {ok
              ? `FastF1 ${health.data!.fastf1_version}. Session data is downloaded once from the providers below and served from the local cache afterwards.`
              : `Start it with: cd backend && source .venv/bin/activate && uvicorn app.main:app --reload (expected at ${API_BASE_URL}).`}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
            <dt className="text-fg-3">Timing & positions</dt>
            <dd>FastF1 (F1 live-timing archive)</dd>
            <dt className="text-fg-3">Pit stops (2023+)</dt>
            <dd>OpenF1 historical API</dd>
            <dt className="text-fg-3">Season results</dt>
            <dd>Jolpica-F1</dd>
            <dt className="text-fg-3">News</dt>
            <dd>Public RSS feeds</dd>
            <dt className="text-fg-3">Predictions</dt>
            <dd>Local scikit-learn on Jolpica history</dd>
          </dl>
          {!ok && (
            <Button size="sm" onClick={health.retry}>
              Retry
            </Button>
          )}
        </div>
      )}
    </Popover>
  );
}

function Notifications() {
  const news = useQuery('api:news', () => api.news());
  const items = useMemo(() => (news.data?.items ?? []).slice(0, 6), [news.data]);
  const [read, setRead] = useState<Set<string>>(() => new Set());
  const unread = items.filter((n) => !read.has(n.id)).length;
  return (
    <Popover
      label="Latest headlines"
      className="w-[360px] max-w-[calc(100vw-24px)]"
      trigger={({ toggle, ref, open, id }) => (
        <span className="relative">
          <IconButton ref={ref} label={`Latest headlines${unread ? ` (${unread} unread)` : ''}`} onClick={toggle} aria-expanded={open} aria-controls={id} active={open}>
            <Bell />
          </IconButton>
          {unread > 0 && <span className="pointer-events-none absolute top-1 right-1 size-2 rounded-full border-2 border-surface bg-accent" />}
        </span>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[12.5px] font-semibold">Latest headlines</span>
            <Button size="xs" variant="ghost" disabled={!unread} onClick={() => setRead(new Set(items.map((n) => n.id)))}>
              Mark all read
            </Button>
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-4 text-[12px] text-fg-3">{news.status === 'error' ? 'Feeds unavailable.' : 'Loading headlines…'}</p>
          ) : (
            <ul className="max-h-[380px] overflow-auto p-1">
              {items.map((n) => (
                <li key={n.id}>
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      setRead((r) => new Set(r).add(n.id));
                      close();
                    }}
                    className="flex gap-2.5 rounded-md px-2 py-2 hover:bg-surface-3"
                  >
                    <Newspaper className="mt-0.5 size-4 shrink-0 text-fg-3" />
                    <span className="min-w-0 flex-1">
                      <span className={cn('line-clamp-2 block text-[12px] leading-snug', read.has(n.id) ? 'text-fg-2' : 'font-medium text-fg')}>{n.title}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-3">
                        {n.source}
                        {n.published && ` · ${new Date(n.published).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                        <ExternalLink className="size-3" />
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => (navigate('intel'), close())} className="w-full border-t border-line px-3 py-2 text-left text-[11.5px] text-fg-2 hover:text-fg">
            Open Technical Intelligence
          </button>
        </div>
      )}
    </Popover>
  );
}

function ProfileMenu() {
  const [shortcuts, setShortcuts] = useState(false);
  return (
    <>
      <Popover
        label="Account"
        className="w-60 p-1"
        trigger={({ toggle, ref, open, id }) => (
          <button
            ref={ref}
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={id}
            aria-label="Account menu"
            className={cn('ml-1 flex size-8 items-center justify-center rounded-full border border-line-strong bg-surface-3 text-[11px] font-semibold text-fg-2 transition-colors hover:text-fg', open && 'text-fg')}
          >
            <CircleUser className="size-4" />
          </button>
        )}
      >
        {(close) => (
          <div role="menu">
            <div className="border-b border-line px-2 py-2.5">
              <div className="text-[12.5px] font-medium">Local session</div>
              <div className="text-[11px] text-fg-3">Runs on this machine · no account</div>
            </div>
            <div className="py-1">
              <MenuItem icon={<Settings />} hint="8" onSelect={() => (navigate('settings'), close())}>
                Settings
              </MenuItem>
              <MenuItem icon={<Keyboard />} onSelect={() => (setShortcuts(true), close())}>
                Keyboard shortcuts
              </MenuItem>
              <MenuItem icon={<RotateCcw />} onSelect={() => (resetSettings(), close())}>
                Reset preferences
              </MenuItem>
            </div>
            <div className="border-t border-line py-1">
              <MenuItem icon={<LogOut />} disabled hint="No accounts locally">
                Sign out
              </MenuItem>
            </div>
          </div>
        )}
      </Popover>
      <Modal open={shortcuts} onClose={() => setShortcuts(false)} title="Keyboard shortcuts" width={400}>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[12.5px]">
          {[...NAV.map((n): [string, string] => [n.key, n.label]), ['K', 'Play / pause replay'], ['[', 'Collapse / expand sidebar'], ['Esc', 'Close menus and dialogs']].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-2">{v}</dt>
              <dd>
                <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-3 px-1 font-mono text-[11px]">{k}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </Modal>
    </>
  );
}
