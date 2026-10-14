import { Archive, BrainCircuit, LayoutDashboard, MonitorPlay, ScanSearch, Settings, UserRound, Users, type LucideIcon } from 'lucide-react';
import type { Route } from '@/state/router';

export interface NavItem {
  route: Route;
  label: string;
  icon: LucideIcon;
  /** Keyboard shortcut digit. */
  key: string;
}

export const NAV: NavItem[] = [
  { route: 'overview', label: 'Overview', icon: LayoutDashboard, key: '1' },
  { route: 'live', label: 'Race Replay', icon: MonitorPlay, key: '2' },
  { route: 'predictions', label: 'Race Predictions', icon: BrainCircuit, key: '3' },
  { route: 'drivers', label: 'Driver Analytics', icon: UserRound, key: '4' },
  { route: 'teams', label: 'Team Analytics', icon: Users, key: '5' },
  { route: 'intel', label: 'Technical Intelligence', icon: ScanSearch, key: '6' },
  { route: 'history', label: 'Race History', icon: Archive, key: '7' },
  { route: 'settings', label: 'Settings', icon: Settings, key: '8' },
];
