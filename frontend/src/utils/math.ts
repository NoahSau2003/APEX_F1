export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Binary search: largest index i with arr[i] <= v (arr ascending). Returns -1 if none. */
export function lowerIndex(arr: ArrayLike<number>, v: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  if (hi < 0 || v < arr[0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Spearman rank correlation between two equal-length rankings. */
export function spearman(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const d2 = a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}
