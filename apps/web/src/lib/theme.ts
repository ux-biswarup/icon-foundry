import { useSyncExternalStore } from "react";

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

/**
 * The ground an icon is actually drawn on right now: "system" resolved against
 * the machine. Previews need this rather than the preference, because a
 * language with a grade draws a different shape on each ground and the app can
 * only show one of them at a time.
 */
export type Ground = "light" | "dark";

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

/*
 * One store, not one hook per component.
 *
 * The theme used to be state inside App, which was enough while it only drove
 * a CSS attribute. It now also decides which drawing every preview renders, so
 * a swatch three levels down has to re-render the moment it changes — and the
 * OS flipping at sunset under "system" has to do the same. Both are pushes
 * from outside React, so both go through one subscription.
 */
let current: Theme = readStored();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const prefersDark = typeof window !== "undefined" && typeof window.matchMedia === "function"
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : undefined;
prefersDark?.addEventListener("change", emit);

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(next: Theme): void {
  if (next === current) return;
  current = next;
  applyTheme(next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
  emit();
}

/** The ground "system" currently resolves to. Light when the machine is silent. */
export function groundOf(theme: Theme): Ground {
  if (theme !== "system") return theme;
  return prefersDark?.matches ? "dark" : "light";
}

/**
 * Apply the stored theme before React renders, so the first paint is not a
 * flash of the wrong one.
 */
export function initTheme(): Theme {
  applyTheme(current);
  return current;
}

/*
 * Both hooks pass the same getter twice.
 *
 * The second argument is the snapshot to use where there is no browser — no
 * `window`, no `localStorage`, no media query. The app only ever runs in one,
 * but a component that cannot be rendered outside a browser cannot be rendered
 * in a test either, and `current` is a plain module value that answers the
 * question perfectly well without one.
 */
export function useTheme(): [Theme, (next: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, () => current, () => current);
  return [theme, setTheme];
}

/** The ground to draw previews on, following the theme and the machine. */
export function useGround(): Ground {
  return useSyncExternalStore(subscribe, () => groundOf(current), () => groundOf(current));
}
