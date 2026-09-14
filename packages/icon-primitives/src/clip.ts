import { arcParameters, arcPoint, type Point } from "./geometry.js";
import { segmentStart, type Skeleton, type SkeletonSegment, type SkeletonSubpath } from "./skeleton.js";

/**
 * Cutting a drawing against a band.
 *
 * This is what the slashed `-off` variant needs, and it is the one place where
 * knowing what the geometry *is* pays for the whole skeleton. Lucide has to send
 * the icon to Inkscape for a real boolean path cut, gated behind an admin role,
 * because it receives opaque path data. A band is a strip between two parallel
 * lines, and cutting stroked geometry against it is not boolean algebra at all —
 * it is finding where each segment crosses two lines and keeping the pieces on
 * the outside. That runs in a browser, offline, for everyone.
 *
 * Every piece is classified by a point along it rather than by its ends, because
 * a segment that enters and leaves the band has ends on the same side and a
 * middle that is nowhere near them.
 */

export interface Band {
  /** Unit normal. Distance from the centreline is `p · normal - offset`. */
  normal: Point;
  offset: number;
  /** Half the band's width: inside is within this of the centreline. */
  halfWidth: number;
}

/** A band of the given width, through `centre`, running along `degrees`. */
export function bandThrough(centre: Point, degrees: number, width: number): Band {
  const radians = (degrees * Math.PI) / 180;
  // The normal is the direction turned a quarter turn, so distance along it is
  // distance from the line.
  const normal: Point = [-Math.sin(radians), Math.cos(radians)];
  return { normal, offset: centre[0] * normal[0] + centre[1] * normal[1], halfWidth: width / 2 };
}

export const distanceFromBand = (point: Point, band: Band): number =>
  point[0] * band.normal[0] + point[1] * band.normal[1] - band.offset;

export const isInsideBand = (point: Point, band: Band, epsilon = 0): boolean =>
  Math.abs(distanceFromBand(point, band)) <= band.halfWidth - epsilon;

/** The band as a rectangle big enough to cross a canvas of `extent`, for the
 *  filled style — where the cut is a hole in the fill rather than a clip. */
export function bandPolygon(band: Band, extent: number): Point[] {
  const along: Point = [band.normal[1], -band.normal[0]];
  const reach = extent * 2;
  const centre: Point = [band.normal[0] * band.offset, band.normal[1] * band.offset];
  const corner = (side: number, end: number): Point => [
    centre[0] + band.normal[0] * band.halfWidth * side + along[0] * reach * end,
    centre[1] + band.normal[1] * band.halfWidth * side + along[1] * reach * end,
  ];
  return [corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)];
}

/* ------------------------------------------------------------------ */
/* Splitting one segment                                               */
/* ------------------------------------------------------------------ */

const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

const cubicAt = (a: Point, c1: Point, c2: Point, b: Point, t: number): Point => {
  const mt = 1 - t;
  return [
    mt ** 3 * a[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t ** 3 * b[0],
    mt ** 3 * a[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t ** 3 * b[1],
  ];
};

/**
 * Where a segment crosses either edge of the band, as parameters in (0,1).
 *
 * A line is solved. An arc and a cubic are sampled for sign changes and then
 * bisected, which is exact to within a ten-thousandth of a unit and cannot be
 * caught out by a curve that touches an edge and comes back — the failure mode
 * of solving the closed form and trusting it.
 */
function crossings(at: (t: number) => Point, band: Band, samples: number): number[] {
  const edges = [band.halfWidth, -band.halfWidth];
  const found: number[] = [];
  for (const edge of edges) {
    const f = (t: number) => distanceFromBand(at(t), band) - edge;
    let previous = f(0);
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const value = f(t);
      if (previous === 0) found.push((i - 1) / samples);
      else if (previous * value < 0) {
        let low = (i - 1) / samples;
        let high = t;
        for (let step = 0; step < 40; step++) {
          const middle = (low + high) / 2;
          if (f(low) * f(middle) <= 0) high = middle;
          else low = middle;
        }
        found.push((low + high) / 2);
      }
      previous = value;
    }
  }
  return found.filter((t) => t > 1e-9 && t < 1 - 1e-9).sort((a, b) => a - b);
}

interface Piece {
  /** Geometry of this piece, already shortened to its own span. */
  segment: SkeletonSegment;
  from: Point;
  to: Point;
  /** A point along it, which is what decides which side it is on. */
  middle: Point;
}

/** Break one segment at the parameters given, keeping each piece's own kind. */
function split(segment: SkeletonSegment, from: Point, to: Point, band: Band): Piece[] {
  if (segment.kind === "line") {
    const at = (t: number) => lerp(from, to, t);
    const ts = [0, ...crossings(at, band, 1), 1];
    return spans(ts).map(([a, b]) => ({
      segment: { kind: "line", to: segment.to },
      from: at(a),
      to: at(b),
      middle: at((a + b) / 2),
    }));
  }

  if (segment.kind === "cubic") {
    const at = (t: number) => cubicAt(from, segment.c1, segment.c2, to, t);
    const ts = [0, ...crossings(at, band, 64), 1];
    // Pieces of a cubic are emitted as lines between their ends when the curve
    // has been cut: a curve is rare here, a cut curve rarer still, and a wrong
    // control point is a worse answer than a straight chord.
    return spans(ts).map(([a, b]) => ({
      segment: b - a > 0.999 ? segment : { kind: "line", to: segment.to },
      from: at(a),
      to: at(b),
      middle: at((a + b) / 2),
    }));
  }

  // The same endpoint-to-centre conversion the renderer samples with. Writing a
  // second one here is writing a second set of sign conventions, and the first
  // attempt at that put half a circle on the wrong side of its own chord.
  const parameters = arcParameters(from[0], from[1], {
    c: "A",
    rx: segment.radius,
    ry: segment.radiusY ?? segment.radius,
    rotation: segment.rotation ?? 0,
    largeArc: segment.largeArc,
    sweep: segment.sweep,
    x: to[0],
    y: to[1],
  });
  if (!parameters) return [{ segment, from, to, middle: from }];
  const sweepAngle = parameters.sweep;
  const at = (t: number) => arcPoint(parameters, parameters.start + sweepAngle * t);
  const ts = [0, ...crossings(at, band, 64), 1];
  return spans(ts).map(([a, b]) => ({
    segment: {
      ...segment,
      // Each piece keeps the radius and the direction of turn; only the amount
      // of turn changes, and a piece is never the long way round.
      largeArc: Math.abs(sweepAngle * (b - a)) > Math.PI,
    },
    from: at(a),
    to: at(b),
    middle: at((a + b) / 2),
  }));
}

const spans = (ts: number[]): Array<[number, number]> =>
  ts.slice(0, -1).map((t, i) => [t, ts[i + 1]!] as [number, number]).filter(([a, b]) => b - a > 1e-9);

/* ------------------------------------------------------------------ */
/* Clipping a whole drawing                                            */
/* ------------------------------------------------------------------ */

/**
 * Everything outside the band, as open subpaths.
 *
 * A closed shape cut by a band is no longer closed, and pretending otherwise
 * would draw a line across the gap the cut just made.
 */
export function clipOutsideBand(skeleton: Skeleton, band: Band): Skeleton {
  const vertices: Point[] = [];
  const subpaths: SkeletonSubpath[] = [];

  const vertexAt = (point: Point): number => {
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i]!;
      if (Math.abs(v[0] - point[0]) < 1e-9 && Math.abs(v[1] - point[1]) < 1e-9) return i;
    }
    vertices.push(point);
    return vertices.length - 1;
  };

  for (const subpath of skeleton.subpaths) {
    let run: SkeletonSubpath | undefined;

    const keep = (piece: Piece) => {
      if (!run) run = { start: vertexAt(piece.from), segments: [], closed: false };
      run.segments.push({ ...piece.segment, to: vertexAt(piece.to) });
    };
    const breakRun = () => {
      if (run && run.segments.length > 0) subpaths.push(run);
      run = undefined;
    };

    subpath.segments.forEach((segment, i) => {
      const from = skeleton.vertices[segmentStart(subpath, i)];
      const to = skeleton.vertices[segment.to];
      if (!from || !to) return;
      for (const piece of split(segment, from, to, band)) {
        // The midpoint decides. A piece that lies along an edge of the band is
        // kept: the cut should take what the band covers, not what it grazes.
        if (isInsideBand(piece.middle, band, 1e-9)) breakRun();
        else keep(piece);
      }
    });
    breakRun();
  }

  return { vertices, subpaths, corners: {} };
}
