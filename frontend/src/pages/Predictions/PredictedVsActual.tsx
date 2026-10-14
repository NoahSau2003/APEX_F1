import { useQuery } from '@/hooks/useQuery';
import { catalog, raceData } from '@/demo/services';
import type { PredictionSet } from '@/demo/services/contracts';
import { selectDriver, useSelection } from '@/demo/selection';
import type { EventId } from '@/types/domain';
import { formatPercent } from '@/utils/format';
import { spearman } from '@/utils/math';
import { cn } from '@/utils/cn';
import { PositionDelta } from '@/components/ui/Racing';
import { DriverLabel } from '@/demo/DemoLabels';
import { QueryView } from '@/components/ui/States';
import { RangeBar } from '@/components/charts/RangeBar';

/** Top-ten predicted order beside the simulated result (or the probabilities, for upcoming events). */
export function PredictedVsActual({ prediction, eventId, completed }: { prediction: PredictionSet; eventId: EventId; completed: boolean }) {
  const race = useQuery(completed ? `race:${eventId}` : null, () => raceData.getRace(eventId));
  const selected = useSelection((s) => s.driverId);
  const top = prediction.drivers.slice(0, 10);

  const body = (actual: Map<string, number> | null) => {
    const ids = catalog.drivers.map((d) => d.id);
    const predPos = new Map(prediction.drivers.map((d) => [d.driverId, d.predictedPosition]));
    const rho = actual ? spearman(ids.map((id) => predPos.get(id)!), ids.map((id) => actual.get(id)!)) : null;
    const podium = actual ? top.slice(0, 3).filter((d) => actual.get(d.driverId)! <= 3).length : null;
    return (
      <div className="flex flex-col gap-3">
        {actual && (
          <div className="grid grid-cols-3 gap-2 text-[11.5px]">
            <Summary label="Winner" value={actual.get(top[0].driverId) === 1 ? 'Matched' : 'Missed'} tone={actual.get(top[0].driverId) === 1 ? 'good' : 'bad'} />
            <Summary label="Podium overlap" value={`${podium}/3`} />
            <Summary label="Rank correlation" value={rho!.toFixed(2)} title="Spearman correlation between predicted and simulated finishing order" />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" aria-label="Predicted versus actual order">
            <thead>
              <tr className="text-[11px] tracking-wide text-fg-3 uppercase">
                <th className="h-7 pr-2 text-right font-medium">Pred</th>
                <th className="px-2 text-left font-medium">Driver</th>
                <th className="px-2 text-right font-medium">Win</th>
                <th className="px-2 text-right font-medium">Podium</th>
                <th className="px-2 text-left font-medium max-sm:hidden">P10–P90 range</th>
                {actual && <th className="px-2 text-right font-medium">Actual</th>}
                {actual && <th className="pl-2 text-right font-medium">Δ</th>}
              </tr>
            </thead>
            <tbody>
              {top.map((d) => {
                const a = actual?.get(d.driverId);
                return (
                  <tr
                    key={d.driverId}
                    onClick={() => selectDriver(d.driverId)}
                    className={cn('h-7 cursor-pointer border-t border-line/70 hover:bg-surface-2', selected === d.driverId && 'bg-surface-2')}
                  >
                    <td className="num pr-2 text-right font-semibold">{d.predictedPosition}</td>
                    <td className="px-2">
                      <DriverLabel driverId={d.driverId} variant="name" />
                    </td>
                    <td className="num px-2 text-right">{formatPercent(d.win)}</td>
                    <td className="num px-2 text-right text-fg-2">{formatPercent(d.podium)}</td>
                    <td className="px-2 max-sm:hidden">
                      <RangeBar range={d.range} expected={d.expectedPosition} />
                    </td>
                    {actual && <td className="num px-2 text-right">{a ? `P${a}` : '—'}</td>}
                    {actual && <td className="pl-2 text-right">{a ? <PositionDelta change={d.predictedPosition - a} /> : null}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10.5px] text-fg-3">
          Illustrative prototype calculation, not a trained model. {actual ? 'Δ compares the predicted position with the simulated demo result.' : 'Actual results appear once the event is completed in the demo calendar.'}
        </p>
      </div>
    );
  };

  if (!completed) return body(null);
  return <QueryView query={race}>{(r) => body(new Map(r.race.map((c) => [c.driverId, c.position])))}</QueryView>;
}

function Summary({ label, value, tone, title }: { label: string; value: string; tone?: 'good' | 'bad'; title?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 px-2 py-1.5" title={title}>
      <div className="label">{label}</div>
      <div className={cn('num text-[13px] font-semibold', tone === 'good' && 'text-good', tone === 'bad' && 'text-[#ff7a7c]')}>{value}</div>
    </div>
  );
}
