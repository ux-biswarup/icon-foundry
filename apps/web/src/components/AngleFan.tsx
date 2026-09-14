/**
 * An angle set, drawn as the directions it allows.
 *
 * The list it replaces read `Orthogonal + 30/45/60°` over a sentence of
 * explanation, which is a description of a picture. This is the picture: every
 * direction a segment may run, as a ray from the middle. Which set is stricter
 * than which is then a thing you see rather than a thing you parse, and "any
 * angle" is visibly the absence of a rule rather than a fourth option with the
 * same shape as the other three.
 *
 * Drawn at the same weight the ramp beside it uses, so the two controls read as
 * one panel making one argument.
 */
const BOX = 46;

export function AngleFan({ angles, label }: { angles: readonly number[]; label: string }) {
  const half = BOX / 2;
  const reach = BOX * 0.4;

  // Every allowed direction and its opposite: a segment at 45° and one at 225°
  // run along the same line, and drawing only half of each would read as a set
  // that permits one way round and not the other.
  const rays = angles.flatMap((angle) => [angle, angle + 180]);

  return (
    <svg className="angle-fan" viewBox={`0 0 ${BOX} ${BOX}`} width={BOX} height={BOX} aria-label={label}>
      <circle className="af-field" cx={half} cy={half} r={reach} />
      {angles.length === 0 ? (
        // Nothing is checked, so the whole field is available. Shown filled
        // rather than as a hundred rays, because the rule is "there is no rule".
        <circle className="af-any" cx={half} cy={half} r={reach} />
      ) : (
        rays.map((angle) => {
          const radians = (angle * Math.PI) / 180;
          return (
            <path
              key={angle}
              className="af-ray"
              d={`M${half} ${half}L${half + Math.cos(radians) * reach} ${half + Math.sin(radians) * reach}`}
            />
          );
        })
      )}
      <circle className="af-hub" cx={half} cy={half} r={1.6} />
    </svg>
  );
}
