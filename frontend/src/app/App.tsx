import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { togglePlay } from '@/replay/clock';
import { navigate, useRoute, type Route } from '@/state/router';
import { prefersReducedMotion, updateSettings, useSettings } from '@/state/settings';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { NAV } from '@/components/layout/nav';
import { LoadingBlock } from '@/components/ui/States';

const PAGES: Record<Route, ComponentType> = {
  overview: lazy(() => import('@/pages/Overview/OverviewPage')),
  live: lazy(() => import('@/pages/LiveTrack/LiveTrackPage')),
  predictions: lazy(() => import('@/pages/Predictions/PredictionsPage')),
  drivers: lazy(() => import('@/pages/DriverAnalytics/DriverAnalyticsPage')),
  teams: lazy(() => import('@/pages/TeamAnalytics/TeamAnalyticsPage')),
  intel: lazy(() => import('@/pages/TechnicalIntelligence/TechnicalIntelligencePage')),
  history: lazy(() => import('@/pages/RaceHistory/RaceHistoryPage')),
  settings: lazy(() => import('@/pages/Settings/SettingsPage')),
};

/** Mirror appearance settings onto <html> so the CSS tokens switch. */
function useDocumentSettings() {
  const theme = useSettings((s) => s.theme);
  const density = useSettings((s) => s.density);
  const motion = useSettings((s) => s.motion);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.density = density;
    root.dataset.motion = prefersReducedMotion(motion) ? 'reduced' : 'full';
  }, [theme, density, motion]);
}

function useShortcuts(toggleSidebar: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], [role="dialog"]')) return;
      const nav = NAV.find((n) => n.key === e.key);
      if (nav) navigate(nav.route);
      else if (e.key === 'k' || e.key === 'K') togglePlay();
      else if (e.key === '[') toggleSidebar();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);
}

export function App() {
  const route = useRoute();
  const sidebar = useSettings((s) => s.sidebar);
  const motionPref = useSettings((s) => s.motion);
  const wide = useMediaQuery('(min-width: 1280px)');
  const [mobileNav, setMobileNav] = useState(false);
  const collapsed = sidebar === 'collapsed' || (sidebar === 'auto' && !wide);
  const toggleSidebar = () => updateSettings({ sidebar: collapsed ? 'expanded' : 'collapsed' });
  const reduced = prefersReducedMotion(motionPref);

  useDocumentSettings();
  useShortcuts(toggleSidebar);
  useEffect(() => {
    const label = NAV.find((n) => n.route === route)?.label;
    document.title = `${label} · Apex`;
  }, [route]);

  const Page = PAGES[route];

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div className="flex h-full overflow-hidden">
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} mobileOpen={mobileNav} onMobileClose={() => setMobileNav(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenNav={() => setMobileNav(true)} />
          <main id="main" className="relative min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={<LoadingBlock rows={8} className="p-6" />}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={route}
                  className="min-h-full"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.14, ease: 'easeOut' }}
                >
                  <Page />
                </motion.div>
              </AnimatePresence>
            </Suspense>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
