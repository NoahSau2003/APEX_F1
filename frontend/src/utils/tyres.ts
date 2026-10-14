/** Broadcast sidewall colours for each compound name FastF1 reports. */
const COMPOUNDS: Record<string, { name: string; letter: string; color: string }> = {
  HYPERSOFT: { name: 'Hypersoft', letter: 'HS', color: '#f0a3c4' },
  ULTRASOFT: { name: 'Ultrasoft', letter: 'US', color: '#a66cf2' },
  SUPERSOFT: { name: 'Supersoft', letter: 'SS', color: '#e5484d' },
  SOFT: { name: 'Soft', letter: 'S', color: '#e5484d' },
  MEDIUM: { name: 'Medium', letter: 'M', color: '#e0b62e' },
  HARD: { name: 'Hard', letter: 'H', color: '#e6e6e8' },
  SUPERHARD: { name: 'Superhard', letter: 'SH', color: '#e0761e' },
  INTERMEDIATE: { name: 'Intermediate', letter: 'I', color: '#3fb37f' },
  WET: { name: 'Wet', letter: 'W', color: '#4c8dff' },
};

export function compoundInfo(compound: string | null | undefined) {
  return (compound && COMPOUNDS[compound.toUpperCase()]) || { name: compound ? `${compound} (unrecognised)` : 'Unknown compound', letter: '?', color: '#6d707a' };
}
