import type { ReactNode } from "react";
import { useGround } from "../lib/theme.js";

/**
 * One drawing, on the ground the app is currently in.
 *
 * This used to show the pair — light and dark side by side, always — because a
 * light shape on a dark ground reads heavier than the same shape inverted at
 * the same stroke width. The effect is well enough established that Material
 * Symbols ships a whole variable axis for it, `GRAD`, whose documented use is
 * "to reduce glare for a light symbol on a dark background". See
 * docs/research/icon-properties.md §3.
 *
 * That is still true, and it is still the reason this component exists. What
 * changed is where the second half lives: the theme control in the nav. One
 * tile at a time, at full size, and switching the theme redraws every preview
 * on the page on the other ground. Judging both modes is now a click rather
 * than a permanent halving of the canvas.
 *
 * It takes a renderer rather than a rendered node because the two drawings are
 * not the same drawing: a language with a grade draws thinner on the dark side,
 * which is the whole point, and handing this one node would quietly hide it.
 *
 * Two tones, for two jobs:
 *
 * - `"paper"` is the ground an icon actually ships on, paper white or near
 *   black. It is what you judge a drawing against, and it is the default.
 * - `"surface"` is a browsing cell. A hundred paper-white tiles on a paper-white
 *   page is a hundred cells you cannot see, which is why every icon set's
 *   browser — Lucide, Phosphor, Material — backs its grid with a soft fill
 *   instead. The ground still follows the theme, so the grade still shows; only
 *   the last few percent of contrast is traded for a legible grid.
 */
export function Swatch({
  render,
  tone = "paper",
}: {
  render: (onDark: boolean) => ReactNode;
  tone?: "paper" | "surface";
}) {
  const ground = useGround();
  return <div className={`swatch ${ground} ${tone}`}>{render(ground === "dark")}</div>;
}
