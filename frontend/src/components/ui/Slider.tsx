import type { ReactNode } from 'react';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
  display?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}

/** Labelled range input using the app-wide range styles. */
export function Slider({ value, min, max, step, onChange, label, display, hint, disabled }: SliderProps) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-fg-2">{label}</span>
        <span className="num text-[12px] font-medium text-fg">{display ?? value}</span>
      </span>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill' as string]: `${fill}%` }}
      />
      {hint && <span className="mt-0.5 block text-[11px] text-fg-3">{hint}</span>}
    </label>
  );
}
