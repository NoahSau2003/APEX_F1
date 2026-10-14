import type { ReactNode } from 'react';
import { Check, RotateCcw, Server, ServerOff } from 'lucide-react';
import { useQuery } from '@/hooks/useQuery';
import { API_BASE_URL, api } from '@/services/api/client';
import type { PredictionStage } from '@/services/api/types';
import { CAMERA_LABELS, DEFAULT_SETTINGS, resetSettings, updateSettings, useSettings, type CameraView, type Settings } from '@/state/settings';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Switch } from '@/components/ui/Switch';
import { Page, PageHeader } from '@/components/layout/Page';
import { STAGE_LABELS, STAGES } from '@/pages/Predictions/stages';

function Row({ label, description, children }: { label: string; description: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-fg">{label}</div>
        <div className="text-[11.5px] text-fg-3">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Choice<K extends keyof Settings>({ k, label, options }: { k: K; label: string; options: { value: Settings[K] & (string | number); label: string }[] }) {
  const value = useSettings((s) => s[k]) as Settings[K] & (string | number);
  return <Segmented label={label} value={value} onChange={(v) => updateSettings({ [k]: v } as Partial<Settings>)} options={options} />;
}

function Toggle({ k, label }: { k: 'driverLabels' | 'debugTrack'; label: string }) {
  const v = useSettings((s) => s[k]);
  return <Switch label={label} checked={v} onChange={(x) => updateSettings({ [k]: x })} />;
}

export default function SettingsPage() {
  const settings = useSettings((s) => s);
  const health = useQuery('api:health', () => api.health());
  const isDefault = JSON.stringify(settings) === JSON.stringify(DEFAULT_SETTINGS);

  return (
    <Page className="max-w-[920px]">
      <PageHeader
        title="Settings"
        description={
          <span className="inline-flex items-center gap-1">
            <Check className="size-3 text-good" />
            Changes apply immediately and are saved in this browser.
          </span>
        }
        actions={
          <Button size="sm" icon={<RotateCcw />} disabled={isDefault} onClick={resetSettings}>
            Restore defaults
          </Button>
        }
      />

      <Panel title="Appearance">
        <Row label="Theme" description="Dark charcoal, or a true-black variant for OLED displays and dim rooms.">
          <Choice k="theme" label="Theme" options={[{ value: 'dark', label: 'Dark' }, { value: 'midnight', label: 'Midnight' }]} />
        </Row>
        <Row label="Data density" description="Row height and panel spacing across tables and dashboards.">
          <Choice k="density" label="Data density" options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }]} />
        </Row>
        <Row label="Animation" description="Interface transitions. “System” follows your operating system's reduced-motion setting.">
          <Choice k="motion" label="Animation" options={[{ value: 'system', label: 'System' }, { value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }]} />
        </Row>
        <Row label="Sidebar" description="Auto collapses the sidebar on screens narrower than 1280px. Shortcut: [">
          <Choice k="sidebar" label="Sidebar behaviour" options={[{ value: 'auto', label: 'Auto' }, { value: 'expanded', label: 'Expanded' }, { value: 'collapsed', label: 'Collapsed' }]} />
        </Row>
      </Panel>

      <Panel title="Replay">
        <Row label="Default camera" description="Camera used when a replay opens. Follow needs a selected driver.">
          <Choice k="cameraView" label="Default camera" options={(Object.keys(CAMERA_LABELS) as CameraView[]).map((v) => ({ value: v, label: CAMERA_LABELS[v] }))} />
        </Row>
        <Row label="Show all abbreviations" description="Label every driver dot, not only the hovered and selected driver.">
          <Toggle k="driverLabels" label="Show all abbreviations" />
        </Row>
        <Row label="Mapping debug overlay" description="Draw recorded position samples and the derived circuit centreline over the replay.">
          <Toggle k="debugTrack" label="Mapping debug overlay" />
        </Row>
        <Row label="Telemetry units" description="Speed units in telemetry readouts and lap traces.">
          <Choice k="units" label="Telemetry units" options={[{ value: 'metric', label: 'km/h' }, { value: 'imperial', label: 'mph' }]} />
        </Row>
      </Panel>

      <Panel title="Predictions">
        <Row label="Default prediction stage" description="Stage selected first on Race Predictions when it is available for the upcoming event.">
          <Choice k="predictionStage" label="Default prediction stage" options={STAGES.map((s: PredictionStage) => ({ value: s, label: STAGE_LABELS[s] }))} />
        </Row>
      </Panel>

      <Panel title="Data">
        <Row label="Backend" description={`Historical API at ${API_BASE_URL} (set VITE_API_BASE_URL to change).`}>
          <span className="inline-flex items-center gap-1.5 text-[12px]">
            {health.status === 'success' ? <Server className="size-3.5 text-good" /> : <ServerOff className="size-3.5 text-bad" />}
            {health.status === 'success' ? `Connected · v${health.data!.version}` : health.status === 'loading' ? 'Checking…' : 'Not reachable'}
          </span>
        </Row>
        <Row label="Local cache" description="FastF1 downloads and processed sessions are stored by the backend; delete the folder to free disk space.">
          <span className="font-mono text-[11px] text-fg-2">{health.data?.cache_dir ?? 'backend/data'}</span>
        </Row>
      </Panel>
    </Page>
  );
}
