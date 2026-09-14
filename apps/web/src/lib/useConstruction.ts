import type { IconLanguage, SizeTokens } from "@icon-foundry/icon-language";
import type { Skeleton } from "@icon-foundry/icon-primitives";
import { useMemo } from "react";
import {
  filletViews,
  jointViews,
  inkCrossesTrim,
  leavesLiveArea,
  nearMisses,
  segmentViews,
  subpathGaps,
  type FilletView,
  type Gap,
  type JointView,
  type NearMiss,
  type SegmentView,
} from "./method-geometry.js";

/**
 * Everything measurable about a drawing, measured once.
 *
 * The stage draws these and the panel beside it counts them, and before this
 * existed both worked it out for themselves — which is how a canvas and its own
 * readout end up disagreeing about how many faults a drawing has. One hook, one
 * set of numbers, and the two surfaces cannot drift.
 */
export interface Construction {
  /** Segments of what is *shown*, which is the rounded drawing when rounding is on. */
  views: SegmentView[];
  /** Corners the language has not cut yet. Empty while showing the rounded form. */
  joints: JointView[];
  /** Corners something already cut, recovered from their arcs. */
  fillets: FilletView[];
  misses: NearMiss[];
  gaps: Gap[];
  /** Centrelines past the live edge — worth saying, not worth refusing. */
  pastLive: boolean;
  /** Ink past the trim, which is the fault. */
  pastTrim: boolean;
}

export function useConstruction(
  skeleton: Skeleton | undefined,
  shown: Skeleton | undefined,
  language: IconLanguage,
  tokens: SizeTokens,
  options: { freeAngles: boolean; showRounded: boolean; faults: boolean },
): Construction {
  const { freeAngles, showRounded, faults } = options;
  const canvas = tokens.canvas;

  const views = useMemo(
    () => (shown ? segmentViews(shown, language, freeAngles) : []),
    [shown, language, freeAngles],
  );

  /*
   * Corners are read off the skeleton, never off the rounded form. Rounding is
   * what the language does *to* a drawing, so its arcs are output — offering a
   * radius handle on one would let a drag write back through geometry the
   * author does not own.
   */
  const joints = useMemo(
    () => (skeleton && !showRounded ? jointViews(skeleton, language, tokens.cornerRadius) : []),
    [skeleton, language, tokens.cornerRadius, showRounded],
  );
  const fillets = useMemo(
    () => (skeleton && !showRounded ? filletViews(skeleton, views) : []),
    [skeleton, views, showRounded],
  );

  const misses = useMemo(
    () => (shown && faults ? nearMisses(shown, views, tokens.grid * 1.5) : []),
    [shown, views, tokens.grid, faults],
  );
  const gaps = useMemo(
    () => (faults ? subpathGaps(views, tokens.minNegativeSpace) : []),
    [views, tokens.minNegativeSpace, faults],
  );
  const pastLive = useMemo(
    () => faults && leavesLiveArea(views, canvas, tokens.safeArea),
    [views, canvas, tokens.safeArea, faults],
  );
  const pastTrim = useMemo(
    () => faults && inkCrossesTrim(views, canvas, tokens.trim, tokens.stroke.width),
    [views, canvas, tokens.trim, tokens.stroke.width, faults],
  );

  return { views, joints, fillets, misses, gaps, pastLive, pastTrim };
}
