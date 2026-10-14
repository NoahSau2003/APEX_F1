import { RotateCcw } from 'lucide-react';
import { catalog } from '@/demo/services';
import type { PredictionScenario, PredictionStage } from '@/demo/services/contracts';
import { DEFAULT_SCENARIO } from '@/demo/services/demoPredictions';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { DriverLabel, TeamLabel } from '@/demo/DemoLabels';

interface Props {
  scenario: PredictionScenario;
  onChange: (s: PredictionScenario) => void;
  stage: PredictionStage;
  /** Driver used when enabling a grid override. */
  driverId: string;
  teamId: string;
}

function Field({ label, control, children }: { label: string; control?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-fg">{label}</span>
        {control}
      </div>
      {children}
    </div>
  );
}

const scLabel = (v: number) => (v < 0.2 ? 'Unlikely' : v < 0.45 ? 'Possible' : v < 0.75 ? 'Likely' : 'Expected');

/** What-if inputs. Every change re-runs the illustrative calculation. */
export function ScenarioControls({ scenario, onChange, stage, driverId, teamId }: Props) {
  const set = (patch: Partial<PredictionScenario>) => onChange({ ...scenario, ...patch });
  const gridDisabled = stage === 'pre-qualifying';
  const changed = JSON.stringify(scenario) !== JSON.stringify(DEFAULT_SCENARIO);

  return (
    <Panel
      title="Scenario"
      subtitle="What-if inputs"
      actions={
        <Button size="xs" variant="ghost" icon={<RotateCcw />} disabled={!changed} onClick={() => onChange(DEFAULT_SCENARIO)}>
          Reset
        </Button>
      }
      bodyClassName="flex flex-col gap-3"
    >
      <Field
        label="Qualifying position"
        control={
          <Switch
            label="Override qualifying position"
            checked={!!scenario.gridOverride}
            disabled={gridDisabled}
            onChange={(on) => set({ gridOverride: on ? { driverId, position: 1 } : null })}
          />
        }
      >
        {gridDisabled ? (
          <p className="text-[11.5px] text-fg-3">No grid exists before qualifying. Switch to post-qualifying or pre-race to move a driver.</p>
        ) : scenario.gridOverride ? (
          <>
            <Select
              label="Driver"
              value={scenario.gridOverride.driverId}
              onChange={(id) => set({ gridOverride: { ...scenario.gridOverride!, driverId: id } })}
              options={catalog.drivers.map((d) => ({ value: d.id, text: `${d.code} ${d.lastName}`, label: <DriverLabel driverId={d.id} variant="name" /> }))}
            />
            <Slider
              label="Starts from"
              min={1}
              max={20}
              step={1}
              value={scenario.gridOverride.position}
              display={`P${scenario.gridOverride.position}`}
              onChange={(position) => set({ gridOverride: { ...scenario.gridOverride!, position } })}
            />
          </>
        ) : (
          <p className="text-[11.5px] text-fg-3">Using the qualifying grid (projected for upcoming events). Enable to move one driver.</p>
        )}
      </Field>

      <Field label="Conditions">
        <Segmented
          label="Conditions"
          value={scenario.conditions}
          onChange={(conditions) => set({ conditions })}
          options={[
            { value: 'forecast', label: 'Forecast', title: 'Use the demo event forecast' },
            { value: 'dry', label: 'Dry' },
            { value: 'wet', label: 'Wet' },
          ]}
        />
      </Field>

      <Field label="Reliability risk">
        <Slider
          label="Retirement risk multiplier"
          min={0.5}
          max={3}
          step={0.1}
          value={scenario.reliabilityRisk}
          display={`${scenario.reliabilityRisk.toFixed(1)}×`}
          onChange={(reliabilityRisk) => set({ reliabilityRisk })}
          hint="Scales each team's baseline mechanical retirement rate."
        />
      </Field>

      <Field
        label="Team performance"
        control={
          <Switch
            label="Adjust a team's pace"
            checked={!!scenario.teamAdjustment}
            onChange={(on) => set({ teamAdjustment: on ? { teamId, percent: -0.2 } : null })}
          />
        }
      >
        {scenario.teamAdjustment ? (
          <>
            <Select
              label="Team"
              value={scenario.teamAdjustment.teamId}
              onChange={(id) => set({ teamAdjustment: { ...scenario.teamAdjustment!, teamId: id } })}
              options={catalog.teams.map((t) => ({ value: t.id, text: t.name, label: <TeamLabel teamId={t.id} /> }))}
            />
            <Slider
              label="Lap-time change"
              min={-0.6}
              max={0.6}
              step={0.05}
              value={scenario.teamAdjustment.percent}
              display={`${scenario.teamAdjustment.percent > 0 ? '+' : scenario.teamAdjustment.percent < 0 ? '−' : ''}${Math.abs(scenario.teamAdjustment.percent).toFixed(2)}%`}
              onChange={(percent) => set({ teamAdjustment: { ...scenario.teamAdjustment!, percent } })}
              hint="Negative is faster. A hypothetical input, not an upgrade estimate."
            />
          </>
        ) : (
          <p className="text-[11.5px] text-fg-3">Enable to test a hypothetical pace change for one team.</p>
        )}
      </Field>

      <Field label="Safety car">
        <Slider
          label="Likelihood"
          min={0}
          max={1}
          step={0.05}
          value={scenario.safetyCar}
          display={`${scLabel(scenario.safetyCar)} · ${Math.round(scenario.safetyCar * 100)}%`}
          onChange={(safetyCar) => set({ safetyCar })}
          hint="More interruptions compress gaps and weaken the grid advantage."
        />
      </Field>
    </Panel>
  );
}
