import { useCallback, useEffect, useState } from "react";

/**
 * Which theme the app is drawn in.
 *
 * A view preference, and deliberately not part of the Icon Language: it says
 * nothing about the icons, so it must never reach the folder a team commits.
 * It lives in this browser and nowhere else.
 *
 * "system" is a real third state rather than the absence of a choice, because
 * following the machine and choosing light are different intentions and only
 * one of them survives the machine changing its mind at sunset.
 */
export type Theme = "light" | "dark" | "system";

export const THEMES: readonly Theme[] = ["light", "dark", "system"];

const KEY = "icon-foundry.theme";

function readStored(): Theme {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Private browsing, or storage denied. Falling back is the whole handler.
  }
  return "system";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/**
 * Apply the stored theme before React renders, so the first paint is not a
 * flash of the wrong one.
 */
export function initTheme(): Theme {
  const theme = readStored();
  applyTheme(theme);
  return theme;
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, set] = useState<Theme>(() => readStored());

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
  }, [theme]);

  return [theme, useCallback((next: Theme) => set(next), [])];
}
