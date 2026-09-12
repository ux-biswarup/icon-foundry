import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHARACTER,
  DEFAULT_GRAMMAR,
  IconLanguageError,
  defaultOpticalBoxes,
  deriveTokens,
  hasSize,
  lucideInspired,
  nearestTokens,
  constructionFor,
  parseIconLanguage,
  resolveTokens,
  scaleDerived,
  serializeIconLanguage,
  technical,
} from "./index.js";

const minimal = {
  id: "minimal",
  name: "Minimal",
  version: "0.0.1",
  canvas: 16,
  grid: 0.5,
  safeArea: 1,
  stroke: { width: 1.5, cap: "butt", join: "miter" },
  cornerRadius: 0,
  style: { default: "filled" },
};

describe("parseIconLanguage", () => {
  it("loads the bundled starter language with two optical sizes", () => {
    expect(lucideInspired.id).toBe("lucide-inspired");
    expect(lucideInspired.canvas).toBe(24);
    expect(lucideInspired.defaultCanvas).toBe(24);
    expect(lucideInspired.stroke).toEqual({ width: 2, cap: "round", join: "round" });
    expect(lucideInspired.style.allowed).toEqual(["outline", "filled"]);
    expect(Object.keys(lucideInspired.sizes).map(Number).sort()).toEqual([16, 24]);
  });

  it("applies defaults for optional fields", () => {
    const lang = parseIconLanguage(minimal);
    expect(lang.style.allowed).toEqual(["filled"]);
    expect(lang.colors.allowed).toEqual(["currentColor"]);
    expect(lang.detail).toBe("low");
    // Budgets now come from the axes; at neutral they match what they always were.
    expect(lang.limits).toEqual({ maxElements: 4, maxShapes: 12 });
    expect(lang.minNegativeSpace).toBe(0);
    expect(lang.optical).toEqual(defaultOpticalBoxes(16, 1));
  });

  it("derives Material-style keyline boxes for a 24 canvas with a 2 safe area", () => {
    expect(defaultOpticalBoxes(24, 2)).toEqual({
      square: { x: 3, y: 3, width: 18, height: 18 },
      circle: { x: 2, y: 2, width: 20, height: 20 },
      horizontal: { x: 2, y: 4, width: 20, height: 16 },
      vertical: { x: 4, y: 2, width: 16, height: 20 },
    });
  });

  it("lets a language override individual optical boxes", () => {
    const lang = parseIconLanguage({ ...minimal, optical: { circle: { x: 0, y: 0, width: 16, height: 16 } } });
    expect(lang.optical.circle).toEqual({ x: 0, y: 0, width: 16, height: 16 });
    expect(lang.optical.square).toEqual(defaultOpticalBoxes(16, 1).square);
    expect(() =>
      parseIconLanguage({ ...minimal, optical: { circle: { x: 4, y: 0, width: 16, height: 16 } } }),
    ).toThrow(/fit inside/);
  });

  it("additional sizes inherit from the default and derive their own optical boxes", () => {
    const t16 = resolveTokens(lucideInspired, 16);
    expect(t16.stroke).toEqual({ width: 1.5, cap: "round", join: "round" });
    expect(t16.grid).toBe(1);
    expect(t16.safeArea).toBe(1);
    expect(t16.optical.circle).toEqual({ x: 1, y: 1, width: 14, height: 14 });
    expect(t16.limits).toEqual({ maxElements: 3, maxShapes: 8 });
  });

  it("resolves, tests and approximates sizes", () => {
    expect(resolveTokens(lucideInspired).canvas).toBe(24);
    expect(hasSize(lucideInspired, 16)).toBe(true);
    expect(hasSize(lucideInspired, 20)).toBe(false);
    expect(() => resolveTokens(lucideInspired, 20)).toThrow(IconLanguageError);
    expect(nearestTokens(lucideInspired, 18).canvas).toBe(16);
    expect(nearestTokens(lucideInspired, 21).canvas).toBe(24);
  });

  it("rejects duplicate sizes and impossible safe areas", () => {
    expect(() => parseIconLanguage({ ...minimal, sizes: [{ canvas: 16 }] })).toThrow(/defined twice/);
    expect(() => parseIconLanguage({ ...minimal, safeArea: 8 })).toThrow(/no room/);
  });

  it("rejects a default style that is not in the allowed list", () => {
    expect(() =>
      parseIconLanguage({ ...minimal, style: { default: "filled", allowed: ["outline"] } }),
    ).toThrow(IconLanguageError);
  });

  it("rejects invalid stroke settings", () => {
    expect(() => parseIconLanguage({ ...minimal, stroke: { width: 0, cap: "round", join: "round" } })).toThrow(
      /stroke\.width/,
    );
    expect(() => parseIconLanguage({ ...minimal, stroke: { width: 2, cap: "flat", join: "round" } })).toThrow(
      /stroke\.cap/,
    );
  });
});

describe("character and grammar", () => {
  it("reads the Technical language's character and grammar", () => {
    expect(technical.id).toBe("technical");
    expect(technical.defaultCanvas).toBe(16);
    expect(resolveTokens(technical, 16).stroke.width).toBe(1.25);
    expect(resolveTokens(technical, 24).stroke.width).toBe(1.5);
    // Cursor's rule: a gap never smaller than 3 grid units.
    const t16 = resolveTokens(technical, 16);
    expect(t16.minNegativeSpace).toBe(3 * t16.grid);
    expect(technical.grammar.angles).toEqual([0, 45, 90, 135]);
    expect(technical.grammar.closedShapes).toBe(true);
    expect(technical.grammar.diagonal).toBe("up-right");
    expect(technical.grammar.badge).toEqual({ ratio: 0.35, corner: "top-right" });
    expect(technical.character.axes.geometric).toBeGreaterThan(50);
    expect(technical.character.principles.length).toBeGreaterThan(4);
    expect(technical.character.metaphors.avoid).toContain("faces");
  });

  it("defaults to a permissive character and grammar when a language states neither", () => {
    const lang = parseIconLanguage(minimal);
    // Badge size is derived, and neutral axes propose exactly the old default.
    expect(lang.grammar).toEqual(DEFAULT_GRAMMAR);
    expect(lang.character).toEqual(DEFAULT_CHARACTER);
    expect(lang.grammar.angles).toEqual([]);
    expect(lucideInspired.grammar.angles).toEqual([]);
  });

  it("validates grammar values", () => {
    const g = (grammar: unknown) => () => parseIconLanguage({ ...minimal, grammar });
    expect(g({ angles: [0, 180] })).toThrow(/measured 0–180/);
    expect(g({ angles: 45 })).toThrow(/array of degrees/);
    expect(g({ diagonal: "sideways" })).toThrow(/one of up-right/);
    expect(g({ badge: { corner: "middle" } })).toThrow(/one of top-right/);
    expect(g({ badge: { ratio: 1 } })).toThrow(/smaller than 1/);
    expect(() => parseIconLanguage({ ...minimal, character: { axes: { geometric: 140 } } })).toThrow(/between 0 and 100/);
  });

  it("keeps partial grammar and character on top of the defaults", () => {
    const lang = parseIconLanguage({ ...minimal, grammar: { angles: [0, 90] }, character: { purpose: "Tiny set." } });
    expect(lang.grammar.angles).toEqual([0, 90]);
    expect(lang.grammar.badge).toEqual(DEFAULT_GRAMMAR.badge);
    expect(lang.character.purpose).toBe("Tiny set.");
    expect(lang.character.principles).toEqual([]);
  });
});

describe("serializeIconLanguage", () => {
  it("round-trips every bundled language exactly", () => {
    for (const lang of [technical, lucideInspired]) {
      expect(parseIconLanguage(serializeIconLanguage(lang))).toEqual(lang);
    }
  });

  it("round-trips a language with several sizes and overridden keyline boxes", () => {
    const custom = parseIconLanguage({
      ...serializeIconLanguage(technical),
      id: "acme",
      name: "Acme",
      version: "1.2.3",
      optical: { circle: { x: 0, y: 0, width: 16, height: 16 } },
    });
    const again = parseIconLanguage(serializeIconLanguage(custom));
    expect(again).toEqual(custom);
    expect(again.optical.circle).toEqual({ x: 0, y: 0, width: 16, height: 16 });
    expect(Object.keys(again.sizes).map(Number).sort()).toEqual([16, 24]);
  });

  it("omits what a reader would derive, so authored files stay small", () => {
    const out = serializeIconLanguage(technical);
    // Keyline boxes are derived from canvas and safe area, so they are not written.
    expect(out.optical).toBeUndefined();
    // A language that states no character or grammar writes neither.
    const plain = serializeIconLanguage(lucideInspired);
    expect(plain.character).toBeUndefined();
    expect(plain.grammar).toBeUndefined();
    // Technical states both, so both are written.
    expect(out.character?.principles?.length).toBeGreaterThan(0);
    expect(out.grammar?.angles).toEqual([0, 45, 90, 135]);
  });
});

describe("deriving tokens from the personality axes", () => {
  const axes = (over: Partial<Record<"geometric" | "minimal" | "technical" | "literal", number>> = {}) => ({
    ...serializeIconLanguage(technical),
    character: { ...technical.character, axes: { geometric: 50, minimal: 50, technical: 50, literal: 50, ...over } },
    cornerRadius: undefined,
    limits: undefined,
    grammar: { ...technical.grammar, badge: { corner: "top-right" as const } },
  });

  it("neutral axes reproduce what a language that states nothing always got", () => {
    const lang = parseIconLanguage(axes());
    expect(lang.limits).toEqual({ maxElements: 4, maxShapes: 12 });
    expect(lang.grammar.badge.ratio).toBe(0.35);
  });

  it("moving an axis moves the proposal", () => {
    const expressive = parseIconLanguage(axes({ minimal: 0 }));
    const spare = parseIconLanguage(axes({ minimal: 100 }));
    expect(expressive.limits.maxShapes).toBeGreaterThan(spare.limits.maxShapes);
    expect(expressive.grammar.badge.ratio).toBeGreaterThan(spare.grammar.badge.ratio);

    const organic = parseIconLanguage(axes({ geometric: 0, technical: 0 }));
    const geometric = parseIconLanguage(axes({ geometric: 100, technical: 100 }));
    expect(organic.cornerRadius).toBeGreaterThan(geometric.cornerRadius);
  });

  it("averages the axes that move the same token, and reports each contribution", () => {
    const derived = deriveTokens(technical.character, technical.derivation, 16);
    const radius = derived.cornerRadius!;
    expect(radius.contributions.map((c) => c.axis)).toEqual(["geometric", "technical"]);
    const mean = radius.contributions.reduce((s, c) => s + (c.value as number), 0) / 2;
    expect(radius.value).toBeCloseTo(Math.round(mean * 4) / 4, 6);
    // The number the bundled language was drawn with, before it stopped stating
    // it and let the axes drive instead. Written out rather than read back off
    // `technical` because the two are now the same value by construction, and an
    // assertion that cannot fail is not one: if a change to the endpoints moved
    // Technical's radius off the 1.5 it was designed at, this should say so.
    expect(radius.value).toBe(1.5);
  });

  it("absent means derived and present means override", () => {
    const derivedOnly = parseIconLanguage(axes());
    expect(derivedOnly.cornerRadius).toBe(2); // neutral axes at a 16 canvas
    const overridden = parseIconLanguage({ ...axes(), cornerRadius: 0 });
    expect(overridden.cornerRadius).toBe(0);
    // And an override survives a round trip while a derived value stays absent.
    expect(serializeIconLanguage(overridden).cornerRadius).toBe(0);
    expect(serializeIconLanguage(derivedOnly).cornerRadius).toBeUndefined();
  });

  it("lets a team say what its own axes mean", () => {
    const ours = parseIconLanguage({
      ...axes({ geometric: 100 }),
      derivation: { geometric: { cornerRadius: [0, 0.5] } },
    });
    expect(ours.cornerRadius).toBe(8); // 0.5 of a 16 canvas
    expect(serializeIconLanguage(ours).derivation).toEqual({ geometric: { cornerRadius: [0, 0.5] } });
  });

  it("snaps enum endpoints to the nearer pole", () => {
    const derivation = { technical: { strokeCap: ["round", "butt"] as [string, string] } };
    const friendly = parseIconLanguage({ ...axes({ technical: 20 }), derivation });
    const strict = parseIconLanguage({ ...axes({ technical: 90 }), derivation });
    expect(friendly.stroke.cap).toBe("round");
    expect(strict.stroke.cap).toBe("butt");
  });

  it("scales lengths and counts to other optical sizes but not ratios", () => {
    const derived = deriveTokens(technical.character, technical.derivation, 16);
    const at24 = scaleDerived(derived, 16, 24);
    expect(at24.cornerRadius!.value).toBeGreaterThan(derived.cornerRadius!.value as number);
    expect(at24.maxShapes!.value).toBeGreaterThan(derived.maxShapes!.value as number);
    expect(at24.badgeRatio!.value).toBe(derived.badgeRatio!.value);
  });

  it("still round-trips both bundled languages exactly", () => {
    for (const lang of [technical, lucideInspired]) {
      expect(parseIconLanguage(serializeIconLanguage(lang))).toEqual(lang);
    }
  });
});

describe("construction traits", () => {
  const base = {
    id: "t",
    name: "T",
    version: "1.0.0",
    canvas: 16,
    grid: 1,
    safeArea: 2,
    stroke: { width: 1.5 },
    style: { default: "outline" as const },
  };

  it("defaults to what every shipped language already draws", () => {
    // Every default is the identity. Square interiors and no grade are what the
    // vendors specify; the multipliers are 1; and the two enums default to
    // "mixed", which is not a style but an admission that our own vocabulary
    // answers the question more than one way and nobody has decided yet.
    //
    // A trait that defaulted to anything else would have silently redrawn every
    // icon in every library the moment they upgraded.
    const identity = {
      interiorRadius: 0,
      grade: 0,
      aperture: "mixed",
      inset: 1,
      accentSize: 1,
      slope: "mixed",
      exceptions: {},
    };
    expect(parseIconLanguage(base).construction).toEqual(identity);
    expect(technical.construction).toEqual(identity);
    expect(lucideInspired.construction).toEqual(identity);
  });

  it("survives a write-then-read round trip, writing only real decisions", () => {
    const language = parseIconLanguage({ ...base, construction: { interiorRadius: 1 } });
    const written = serializeIconLanguage(language);
    expect(written.construction).toEqual({ interiorRadius: 1 });
    expect(parseIconLanguage(written).construction).toEqual(language.construction);
  });

  it("derives a trait the axes move, and an override still wins", () => {
    const derived = parseIconLanguage({
      ...base,
      character: { axes: { geometric: 0, minimal: 50, technical: 0, literal: 50 } },
      derivation: { technical: { interiorRadius: [1, 0] } },
    });
    expect(derived.construction.interiorRadius).toBeCloseTo(1, 6);

    const override = parseIconLanguage({
      ...base,
      character: { axes: { geometric: 0, minimal: 50, technical: 0, literal: 50 } },
      derivation: { technical: { interiorRadius: [1, 0] } },
      construction: { interiorRadius: 0 },
    });
    expect(override.construction.interiorRadius).toBe(0);
    // Absent means derived, so the override is what gets written down.
    expect(serializeIconLanguage(override).construction).toEqual({ interiorRadius: 0 });
  });

  it("refuses a share outside the range it means anything in", () => {
    expect(() => parseIconLanguage({ ...base, construction: { interiorRadius: 1.5 } })).toThrow(/interiorRadius/);
    expect(() => parseIconLanguage({ ...base, construction: { grade: -2 } })).toThrow(/grade/);
  });
});

describe("construction exceptions", () => {
  const base = {
    id: "t",
    name: "T",
    version: "1.0.0",
    canvas: 16,
    grid: 1,
    safeArea: 2,
    stroke: { width: 1.5 },
    style: { default: "outline" as const },
  };
  const withException = (exception: unknown) =>
    parseIconLanguage({ ...base, construction: { exceptions: { vehicle: exception } } });

  it("lets one part depart, and gives it only to that part", () => {
    const language = withException({ set: { accentSize: 1.4 }, why: "the wheels vanished at 16px" });
    expect(constructionFor(language.construction, "vehicle").accentSize).toBe(1.4);
    expect(constructionFor(language.construction, "person").accentSize).toBe(1);
  });

  it("refuses an exception with no reason anybody could read later", () => {
    // An exception without a reason is drift with a nicer name.
    expect(() => withException({ set: { accentSize: 1.4 } })).toThrow(/why/);
    expect(() => withException({ set: { accentSize: 1.4 }, why: "  " })).toThrow(/reason/);
  });

  it("refuses an exception that changes nothing", () => {
    expect(() => withException({ set: {}, why: "looks off somehow" })).toThrow(/not an exception/);
  });

  it("survives a write-then-read round trip with its reason intact", () => {
    const language = withException({ set: { slope: "45" }, why: "the roof read as a shed" });
    const written = serializeIconLanguage(language);
    const back = parseIconLanguage(written);
    expect(back.construction.exceptions.vehicle).toEqual({ set: { slope: "45" }, why: "the roof read as a shed" });
  });

  it("leaves a language with no exceptions saying nothing about them", () => {
    expect(serializeIconLanguage(parseIconLanguage(base)).construction).toBeUndefined();
  });
});
