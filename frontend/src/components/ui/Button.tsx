import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'subtle';
type Size = 'xs' | 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  active?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover border border-transparent',
  secondary: 'bg-surface-2 text-fg border border-line-strong hover:bg-surface-3',
  ghost: 'text-fg-2 hover:text-fg hover:bg-surface-2 border border-transparent',
  subtle: 'bg-surface-2 text-fg-2 hover:text-fg border border-line hover:border-line-strong',
};

const SIZES: Record<Size, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1 [&_svg]:size-3',
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 [&_svg]:size-3.5',
  md: 'h-8 px-3 text-[12.5px] gap-2 [&_svg]:size-4',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', icon, active, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors duration-150 select-none disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        active && 'bg-surface-3 text-fg border-line-strong',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
  active?: boolean;
  variant?: 'ghost' | 'subtle';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', active, variant = 'ghost', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' ? 'size-7 [&_svg]:size-3.5' : 'size-8 [&_svg]:size-4',
        variant === 'ghost'
          ? 'text-fg-2 hover:bg-surface-2 hover:text-fg'
          : 'border border-line bg-surface-2 text-fg-2 hover:border-line-strong hover:text-fg',
        active && 'bg-surface-3 text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
