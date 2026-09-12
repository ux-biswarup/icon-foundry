import type { ReactNode } from "react";

/**
 * One drawing, on both grounds, at the same moment.
 *
 * Not a convenience. A light shape on a dark ground reads heavier than the same
 * shape inverted at the same stroke width — the effect is well enough
 * established that Material Symbols ships a whole variable axis for it, `GRAD`,
 * whose documented use is "to reduce glare for a light symbol on a dark
 * background". See docs/research/icon-properties.md §3.
 *
 * So a weight chosen on white alone is wrong at night, and judging an icon in
 * one mode is judging half of it. The pair is shown regardless of which theme
 * the app is currently in.
 *
 * It takes a renderer rather than a rendered node because the two drawings are
 * not the same drawing: a language with a grade draws thinner on the dark side,
 * which is the whole point, and handing this one node would quietly hide it.
 */
export function Duo({ render, both = true }: { render: (onDark: boolean) => ReactNode; both?: boolean }) {
  if (!both) return <div className="swatch light">{render(false)}</div>;
  return (
    <div className="duo">
      <div className="swatch light">{render(false)}</div>
      <div className="swatch dark">{render(true)}</div>
    </div>
  );
}
