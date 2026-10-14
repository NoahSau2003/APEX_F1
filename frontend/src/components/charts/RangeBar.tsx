/** Horizontal P1–P20 scale with the 10th–90th percentile band and expected position. */
export function RangeBar({ range, expected, n = 20 }: { range: [number, number]; expected: number; n?: number }) {
  const x = (p: number) => ((p - 1) / (n - 1)) * 100;
  return (
    <div className="relative h-3 w-full min-w-24" role="img" aria-label={`Likely finishing range P${range[0]} to P${range[1]}, expected P${expected.toFixed(1)}`}>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
      <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[rgb(91_147_245/0.45)]" style={{ left: `${x(range[0])}%`, width: `${Math.max(2, x(range[1]) - x(range[0]))}%` }} />
      <div className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-fg" style={{ left: `${x(expected)}%` }} />
    </div>
  );
}
