import type { Driver, ResultRow, SessionRef } from '@/services/api/types';
import { formatLapTime, formatRaceTime } from '@/utils/format';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DriverChip } from '@/components/ui/DriverChip';
import { PositionDelta } from '@/components/ui/Racing';

interface Props {
  rows: ResultRow[];
  drivers: Map<string, Driver>;
  kind: SessionRef['kind'];
  selected: string | null;
  onSelect: (d: string) => void;
  className?: string;
}

/** Session classification as published (or ranked by best lap for practice; see source note). */
export function ResultsTable({ rows, drivers, kind, selected, onSelect, className }: Props) {
  const leaderBest = rows.find((r) => r.best_lap != null)?.best_lap ?? null;
  const cols: Column<ResultRow>[] = [
    { key: 'pos', header: 'Pos', align: 'right', sortValue: (r) => r.position, render: (r) => <span className="num font-semibold">{r.classified_position && !/^\d+$/.test(r.classified_position) ? r.classified_position : (r.position ?? '—')}</span> },
    { key: 'driver', header: 'Driver', sortValue: (r) => drivers.get(r.driver_number)?.last_name ?? r.driver_number, render: (r) => <DriverChip driver={drivers.get(r.driver_number)} number={r.driver_number} variant="name" /> },
    { key: 'team', header: 'Team', hideBelow: 'lg', sortValue: (r) => drivers.get(r.driver_number)?.team_name ?? '', render: (r) => <span className="text-fg-2">{drivers.get(r.driver_number)?.team_name ?? '—'}</span> },
  ];
  if (kind === 'race') {
    cols.push(
      { key: 'grid', header: 'Grid', align: 'right', sortValue: (r) => r.grid, render: (r) => <span className="num text-fg-2">{r.grid ?? 'PL'}</span> },
      {
        key: 'chg',
        header: '±',
        title: 'Places gained from the grid (calculated)',
        align: 'right',
        sortValue: (r) => (r.grid != null && r.position != null ? r.grid - r.position : null),
        render: (r) => (r.grid != null && r.position != null && /^\d+$/.test(r.classified_position ?? '') ? <PositionDelta change={r.grid - r.position} /> : null),
      },
      {
        key: 'time',
        header: 'Time / status',
        align: 'right',
        render: (r) =>
          r.position === 1 && r.time != null ? (
            <span className="num">{formatRaceTime(r.time)}</span>
          ) : r.status === 'Finished' && r.time != null ? (
            <span className="num text-fg-2">+{r.time.toFixed(3)}</span>
          ) : (
            <span className="text-fg-3">{r.status ?? '—'}</span>
          ),
      },
      { key: 'best', header: 'Best lap', align: 'right', hideBelow: 'md', sortValue: (r) => r.best_lap, render: (r) => <span className="num text-fg-2">{formatLapTime(r.best_lap)}</span> },
      { key: 'laps', header: 'Laps', align: 'right', hideBelow: 'xl', sortValue: (r) => r.laps, render: (r) => <span className="num text-fg-2">{r.laps ?? '—'}</span> },
      { key: 'pts', header: 'Pts', align: 'right', sortValue: (r) => (r.points != null ? -r.points : null), render: (r) => <span className="num font-medium">{r.points ? r.points : ''}</span> },
    );
  } else if (kind === 'qualifying') {
    for (const q of ['q1', 'q2', 'q3'] as const)
      cols.push({ key: q, header: q.toUpperCase(), align: 'right', sortValue: (r) => r[q], render: (r) => <span className="num text-fg-2">{formatLapTime(r[q])}</span> });
  } else {
    cols.push(
      { key: 'best', header: 'Best lap', align: 'right', sortValue: (r) => r.best_lap, render: (r) => <span className="num">{formatLapTime(r.best_lap)}</span> },
      {
        key: 'gap',
        header: 'Gap',
        title: 'Difference to the fastest lap (calculated)',
        align: 'right',
        sortValue: (r) => r.best_lap,
        render: (r) => <span className="num text-fg-2">{r.best_lap != null && leaderBest != null && r.best_lap !== leaderBest ? `+${(r.best_lap - leaderBest).toFixed(3)}` : r.best_lap != null ? '—' : 'No time'}</span>,
      },
    );
  }
  return (
    <DataTable label="Session results" rows={rows} columns={cols} rowKey={(r) => r.driver_number} selectedKey={selected} onRowClick={(r) => onSelect(r.driver_number)} defaultSort={{ key: 'pos', dir: 'asc' }} className={className} />
  );
}
