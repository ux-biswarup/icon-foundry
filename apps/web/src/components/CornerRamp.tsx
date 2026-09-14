import { cornerRadiusFor, type CornerBand, type SizeTokens } from "@icon-foundry/icon-language";

/**
 * How hard a corner rounds, by how sharp it is — drawn, not typed.
 *
 * This is the one rule in the language nobody can see. A number field would
 * state it and show nothing; the set's whole claim is that its parts are built
 * one way, and the way is *this*. So the control is a row of real corners at
 * real angles, drawn at the language's own stroke, redrawing as the bands move.
 *
 * The radii are multiples of the size's `cornerRadius`, which is what makes the
 * default defensible: a right angle rounds exactly the way this language's
 * rectangles already round, so there is one roundness to reason about rather
 * than two that can disagree.
 */

const SAMPLES = [30, 60, 90, 120, 150];
const BOX = 44;

/** One corner at a given angle, drawn with the radius the ramp gives it. */
function Corner({ angle, radius, stroke }: { angle: number; radius: number; stroke: number }) {
  // Two legs meeting at the middle of the box, opening symmetrically about
  // vertical so the shape reads as a corner rather than as a rotated one.
  const half = (angle / 2) * (Math.PI / 180);
  const length = BOX * 0.42;
  const apex = { x: BOX / 2, y: BOX * 0.74 };
  const left = { x: apex.x - Math.sin(half) * length, y: apex.y - Math.cos(half) * length };
  const right = { x: apex.x + Math.sin(half) * length, y: apex.y - Math.cos(half) * length };

  const tangent = radius > 0 ? radius / Math.tan(half) : 0;
  const capped = Math.min(tangent, length * 0.95);
  const actual = capped * Math.tan(half);

  const d =
    actual > 0.01
      ? `M${left.x} ${left.y}L${apex.x - Math.sin(half) * capped} ${apex.y - Math.cos(half) * capped}` +
        `A${actual} ${actual} 0 0 0 ${apex.x + Math.sin(half) * capped} ${apex.y - Math.cos(half) * capped}` +
        `L${right.x} ${right.y}`
      : `M${left.x} ${left.y}L${apex.x} ${apex.y}L${right.x} ${right.y}`;

  return (
    <figure className="ramp-sample">
      <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`}>
        <path d={d} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <figcaption>
        {angle}°<span className="muted"> · {+radius.toFixed(2)}</span>
      </figcaption>
    </figure>
  );
}

export function CornerRamp({
  corners,
  tokens,
  snap,
  onChange,
  onSnap,
}: {
  corners: CornerBand[];
  tokens: SizeTokens;
  snap: boolean;
  onChange: (corners: CornerBand[]) => void;
  onSnap: (snap: boolean) => void;
}) {
  // Drawn at the language's own stroke, scaled into the sample box, so a heavy
  // language shows heavy corners.
  const stroke = (tokens.stroke.width / tokens.canvas) * BOX;
  const set = (index: number, patch: Partial<CornerBand>) =>
    onChange(corners.map((band, i) => (i === index ? { ...band, ...patch } : band)));

  return (
    <div className="corner-ramp">
      <div className="ramp-samples">
        {SAMPLES.map((angle) => (
          <Corner
            key={angle}
            angle={angle}
            radius={(cornerRadiusFor(angle, corners, tokens.cornerRadius) / tokens.canvas) * BOX}
            stroke={stroke}
          />
        ))}
      </div>

      <ul className="ramp-bands">
        {corners.map((band, i) => (
          <li key={i}>
            <span className="field-label">
              {band.upTo === undefined ? `above ${corners[i - 1]?.upTo ?? 0}°` : `up to ${band.upTo}°`}
            </span>
            {band.upTo !== undefined && (
              <input
                type="number"
                value={band.upTo}
                min={1}
                max={180}
                step={5}
                onChange={(e) => set(i, { upTo: Number(e.target.value) })}
              />
            )}
            <input
              type="number"
              value={band.radius}
              min={0}
              step={0.25}
              onChange={(e) => set(i, { radius: Number(e.target.value) })}
            />
            <span className="muted small-text">
              ×{band.radius} = {+(band.radius * tokens.cornerRadius).toFixed(2)} units
            </span>
          </li>
        ))}
      </ul>

      <label className="ramp-snap">
        <input type="checkbox" checked={snap} onChange={(e) => onSnap(e.target.checked)} />
        Pull each corner onto the grid
      </label>
    </div>
  );
}
