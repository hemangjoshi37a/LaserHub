import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'laserhub-theme';

/** Read the persisted mode from localStorage, falling back to 'system'. */
export function getStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

/** What the OS currently prefers. */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Resolve a mode (which may be 'system') to a concrete light/dark value. */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

/** Apply the resolved theme to the <html> element so CSS variables flip. */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
}

/** Apply the persisted/system theme before first paint (used in main.tsx). */
export function initTheme(): void {
  applyTheme(resolveTheme(getStoredMode()));
}

/**
 * Theme controller. Manages 'light' | 'dark' | 'system', persists the choice,
 * applies the resolved theme to <html>, and live-updates when the OS theme
 * changes while in 'system' mode.
 */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(getStoredMode);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(getStoredMode()));

  // Apply + persist whenever the mode changes.
  useEffect(() => {
    const next = resolveTheme(mode);
    setResolved(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  // Live-follow the OS preference while in 'system' mode.
  useEffect(() => {
    if (mode !== 'system' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = getSystemTheme();
      setResolved(next);
      applyTheme(next);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);

  // Cycle order: light -> dark -> system -> light
  const cycleMode = useCallback(() => {
    setModeState((prev) => (prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light'));
  }, []);

  return { mode, resolved, setMode, cycleMode };
}
