import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemeMode } from '../hooks/useTheme';

const LABEL: Record<ThemeMode, string> = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'System theme',
};

const NEXT_LABEL: Record<ThemeMode, string> = {
  light: 'Switch to dark theme',
  dark: 'Switch to system theme',
  system: 'Switch to light theme',
};

/**
 * Compact navbar control that cycles Light -> Dark -> System.
 * The icon reflects the current mode; the tooltip explains the next action.
 */
export const ThemeToggle: React.FC = () => {
  const { mode, cycleMode } = useTheme();

  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;

  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={cycleMode}
      title={`${LABEL[mode]} — ${NEXT_LABEL[mode]}`}
      aria-label={NEXT_LABEL[mode]}
    >
      <Icon size={18} />
    </button>
  );
};
