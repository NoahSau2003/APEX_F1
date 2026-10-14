import { AnimatePresence, motion } from 'motion/react';
import { ChevronsLeft, ChevronsRight, Database, X } from 'lucide-react';
import { navigate, useRoute } from '@/state/router';
import { cn } from '@/utils/cn';
import { IconButton } from '@/components/ui/Button';
import { NAV } from './nav';

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex h-12 shrink-0 items-center gap-2.5 border-b border-line', collapsed ? 'justify-center px-0' : 'px-4')}>
      <img src="/apex.svg" alt="" className="size-6" />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="text-[13.5px] font-semibold tracking-tight">Apex</div>
          <div className="text-[10.5px] text-fg-3">Race intelligence</div>
        </div>
      )}
    </div>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const route = useRoute();
  const main = NAV.filter((n) => n.route !== 'settings');
  const settings = NAV.find((n) => n.route === 'settings')!;
  const item = (n: (typeof NAV)[number]) => {
    const on = route === n.route;
    const Icon = n.icon;
    return (
      <li key={n.route}>
        <a
          href={`#/${n.route}`}
          aria-current={on ? 'page' : undefined}
          title={collapsed ? `${n.label} (${n.key})` : undefined}
          onClick={(e) => {
            e.preventDefault();
            navigate(n.route);
            onNavigate?.();
          }}
          className={cn(
            'group relative flex h-8 items-center gap-2.5 rounded-md text-[12.5px] font-medium transition-colors',
            collapsed ? 'justify-center px-0' : 'px-2.5',
            on ? 'bg-surface-3 text-fg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
          )}
        >
          {on && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-accent" />}
          <Icon className={cn('size-4 shrink-0', on ? 'text-fg' : 'text-fg-3 group-hover:text-fg-2')} />
          {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
          {!collapsed && <kbd className="font-mono text-[10px] text-fg-3 opacity-0 transition-opacity group-hover:opacity-100">{n.key}</kbd>}
        </a>
      </li>
    );
  };
  return (
    <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col justify-between p-2">
      <ul className="flex flex-col gap-0.5">{main.map(item)}</ul>
      <ul className="flex flex-col gap-0.5">{item(settings)}</ul>
    </nav>
  );
}

function DemoNote({ collapsed }: { collapsed: boolean }) {
  if (collapsed)
    return (
      <div className="flex justify-center border-t border-line py-3 text-info" title="Historical data from FastF1, OpenF1 and Jolpica-F1, cached locally. Predictions use a local model on Jolpica results.">
        <Database className="size-4" />
      </div>
    );
  return (
    <div className="border-t border-line p-3">
      <div className="rounded-md border border-[rgb(91_147_245/0.25)] bg-[rgb(91_147_245/0.06)] px-2.5 py-2">
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-info">
          <Database className="size-3.5" />
          Historical data · local
        </div>
        <p className="mt-1 text-[11px] leading-snug text-fg-3">FastF1, OpenF1 and Jolpica-F1, cached on this machine. Unofficial; not live.</p>
      </div>
    </div>
  );
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      <aside
        className={cn(
          'relative hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 md:flex',
          collapsed ? 'w-[56px]' : 'w-[220px]',
        )}
      >
        <Logo collapsed={collapsed} />
        <NavList collapsed={collapsed} />
        <DemoNote collapsed={collapsed} />
        <div className={cn('flex border-t border-line p-2', collapsed ? 'justify-center' : 'justify-end')}>
          <IconButton size="sm" label={collapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'} onClick={onToggle}>
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          </IconButton>
        </div>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-[90] md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={onMobileClose} />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-y-0 left-0 flex w-[240px] flex-col border-r border-line bg-surface"
              aria-label="Navigation"
            >
              <div className="flex items-center justify-between pr-2">
                <Logo collapsed={false} />
                <IconButton size="sm" label="Close navigation" onClick={onMobileClose}>
                  <X />
                </IconButton>
              </div>
              <NavList collapsed={false} onNavigate={onMobileClose} />
              <DemoNote collapsed={false} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
