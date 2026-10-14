/** Human labels for model feature keys (v2.2 feature set). */
export const FEATURE_META: Record<string, { label: string; hint: string; lowerIsBetter?: boolean }> = {
  roll3_avg_pos: { label: 'Form (3 races)', hint: 'Mean finishing position over last 3 races', lowerIsBetter: true },
  roll5_avg_pos: { label: 'Form (5 races)', hint: 'Mean finishing position over last 5 races', lowerIsBetter: true },
  roll3_avg_grid: { label: 'Grid (3 races)', hint: 'Mean grid over last 3 races', lowerIsBetter: true },
  roll5_avg_grid: { label: 'Grid (5 races)', hint: 'Mean grid over last 5 races', lowerIsBetter: true },
  roll5_quali_to_race: { label: 'Quali → race (5)', hint: 'Mean positions gained/lost vs grid', lowerIsBetter: false },
  season_points_norm: { label: 'Season points', hint: 'Championship points normalised by field', lowerIsBetter: false },
  constructor_roll5_avg_pos: { label: 'Team form (5)', hint: 'Constructor mean finish last 5 races', lowerIsBetter: true },
  constructor_tenure_norm: { label: 'Team tenure', hint: 'How long driver has been at constructor', lowerIsBetter: false },
  circuit_avg_pos: { label: 'Circuit history', hint: 'Mean finish at this circuit', lowerIsBetter: true },
  circuit_cluster: { label: 'Circuit cluster', hint: 'Similar-circuit performance bucket', lowerIsBetter: true },
  dnf_rate5: { label: 'DNF rate (5)', hint: 'Recent retirement rate', lowerIsBetter: true },
  grid_position: { label: 'Grid position', hint: 'Starting grid for this stage', lowerIsBetter: true },
  grid_gap_to_pole: { label: 'Grid gap to pole', hint: 'Places behind pole on the grid', lowerIsBetter: true },
  grid_field_norm: { label: 'Grid (field norm)', hint: 'Grid position scaled by field size', lowerIsBetter: true },
  quali_position: { label: 'Qualifying pos.', hint: 'Qualifying result when known', lowerIsBetter: true },
  quali_gap_to_pole_norm: { label: 'Quali gap (norm)', hint: 'Gap to pole in qualifying', lowerIsBetter: true },
  roll5_quali_gap_norm: { label: 'Quali pace trend', hint: 'Recent qualifying gap vs pole', lowerIsBetter: true },
  sector_pace_norm: { label: 'Sector pace', hint: 'Best sector pace vs field (FastF1)', lowerIsBetter: true },
  constructor_swap: { label: 'Constructor swap', hint: 'Flag if driver changed teams recently', lowerIsBetter: true },
  stint_deg_norm: { label: 'Tyre deg proxy', hint: 'Stint-length proxy from recent races', lowerIsBetter: true },
  sprint_avg_pos5: { label: 'Sprint form', hint: 'Recent sprint race finishes', lowerIsBetter: true },
  sprint_grid: { label: 'Sprint grid', hint: 'Sprint qualifying grid when applicable', lowerIsBetter: true },
  fp_pace_norm: { label: 'FP pace', hint: 'Practice pace vs best (FastF1)', lowerIsBetter: true },
  quali_pace_norm: { label: 'Quali pace (weekend)', hint: 'Qualifying session pace vs pole (FastF1)', lowerIsBetter: true },
  dry_avg_pos: { label: 'Dry races', hint: 'Mean finish in dry conditions', lowerIsBetter: true },
  wet_avg_pos: { label: 'Wet races', hint: 'Mean finish in wet conditions', lowerIsBetter: true },
  wet_skill: { label: 'Wet skill', hint: 'Wet vs dry performance delta', lowerIsBetter: false },
  race_wet_indicator: { label: 'Rain forecast', hint: 'Expected wetness at race start (0–1)', lowerIsBetter: true },
  avg_laps_norm: { label: 'Race distance', hint: 'Fraction of leader laps completed recently', lowerIsBetter: false },
};

export function featureLabel(key: string): string {
  return FEATURE_META[key]?.label ?? key.replace(/_/g, ' ');
}
