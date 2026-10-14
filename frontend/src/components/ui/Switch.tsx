import { cn } from '@/utils/cn';

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors disabled:opacity-40',
        checked ? 'border-accent bg-accent' : 'border-line-strong bg-surface-3',
      )}
    >
      <span className={cn('inline-block size-3 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[15px]' : 'translate-x-[2px]')} />
    </button>
  );
}
