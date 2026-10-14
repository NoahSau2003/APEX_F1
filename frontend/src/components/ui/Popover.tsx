import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/utils/cn';

/** Close on outside pointer-down and Escape; return focus to the trigger. */
export function useDismiss(open: boolean, onClose: () => void, refs: RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        (refs[0].current as HTMLElement | null)?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, refs]);
}

interface PopoverProps {
  trigger: (props: { open: boolean; toggle: () => void; ref: RefObject<HTMLButtonElement | null>; id: string }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  className?: string;
  label: string;
}

export function Popover({ trigger, children, align = 'end', className, label }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const refs = useRef([triggerRef, panelRef]).current;
  const close = useRef(() => setOpen(false)).current;
  useDismiss(open, close, refs);

  return (
    <div className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: triggerRef, id })}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className={cn(
              'absolute top-full z-50 mt-1.5 rounded-lg border border-line-strong bg-surface-2 shadow-[0_12px_32px_rgb(0_0_0/0.5)]',
              align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
              className,
            )}
          >
            {children(close)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  disabled,
  hint,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12.5px] text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-45 disabled:hover:bg-transparent [&_svg]:size-3.5 [&_svg]:shrink-0"
    >
      {icon}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-[10.5px] text-fg-3">{hint}</span>}
    </button>
  );
}
