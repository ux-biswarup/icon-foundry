import { describe, expect, it } from "vitest";
import { importSvg, SvgImportError } from "./svg-import.js";
import { shapeToPathData } from "@icon-foundry/icon-renderer";
import { skeletonFromPathData } from "./skeleton.js";

const read = (source: string) => importSvg(source, shapeToPathData);

/** The example a designer actually pastes: Lucide's own output. */
const lucide = `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M22 22V2" />
  <rect x="2" y="4" width="16" height="6" rx="2" />
  <rect x="9" y="14" width="9" height="6" rx="2" />
</svg>`;

describe("importSvg", () => {
  it("takes the geometry out of an icon somebody pasted", () => {
    const { paths, viewBox } = read(lucide);
    expect(paths).toHaveLength(3);
    expect(viewBox).toEqual({ x: 0, y: 0, width: 24, height: 24 });
    // And it is geometry this project can hold, not just a string it kept.
    const skeleton = skeletonFromPathData(paths);
    expect(skeleton.subpaths).toHaveLength(3);
  });

  it("reports the attributes the language owns instead of taking them", () => {
    // The failure this prevents: a 2px stroke quietly entering a 1.5px language
    // because it came along with the drawing.
    const names = read(lucide).ignored.map((i) => i.name);
    expect(names).toContain("stroke-width");
    expect(names).toContain("stroke-linecap");
    expect(names).toContain("stroke");
    expect(read(lucide).ignored.find((i) => i.name === "stroke-width")?.value).toBe("2");
    // Nothing about them survives into the geometry.
    expect(read(lucide).paths.join(" ")).not.toContain("stroke");
  });

  it("turns every element it understands into path data", () => {
    const { paths } = read(
      `<svg viewBox="0 0 24 24">
         <circle cx="12" cy="12" r="6"/>
         <line x1="0" y1="0" x2="10" y2="10"/>
         <polyline points="1,2 3,4 5,6"/>
         <polygon points="1,1 5,1 5,5"/>
         <ellipse cx="12" cy="12" rx="8" ry="4"/>
       </svg>`,
    );
    expect(paths).toHaveLength(5);
    expect(paths[1]).toBe("M0 0L10 10");
    expect(paths[3]?.endsWith("Z")).toBe(true);
  });

  it("places geometry a group moved", () => {
    // Ignoring a transform does not produce a slightly-off drawing; it produces
    // geometry in the wrong place with nothing to say why.
    const { paths } = read(`<svg viewBox="0 0 24 24"><g transform="translate(5 5)"><line x1="0" y1="0" x2="2" y2="0"/></g></svg>`);
    expect(paths[0]).toBe("M5 5L7 5");
  });

  it("composes nested transforms, innermost first", () => {
    const { paths } = read(
      `<svg viewBox="0 0 24 24"><g transform="translate(10 0)"><g transform="scale(2)"><line x1="1" y1="0" x2="2" y2="0"/></g></g></svg>`,
    );
    expect(paths[0]).toBe("M12 0L14 0");
  });

  it("skips what is only there to define something else", () => {
    const { paths } = read(
      `<svg viewBox="0 0 24 24"><defs><path d="M0 0L1 1"/></defs><clipPath id="c"><rect x="0" y="0" width="4" height="4"/></clipPath><line x1="0" y1="0" x2="2" y2="0"/></svg>`,
    );
    expect(paths).toEqual(["M0 0L2 0"]);
  });

  it("refuses rather than redrawing, when it cannot hold what it was given", () => {
    // An unequal corner radius would have to be rounded to one number, and a
    // parser that quietly redraws somebody's rectangle has earned no trust.
    expect(() => read(`<svg viewBox="0 0 24 24"><rect x="0" y="0" width="8" height="8" rx="2" ry="4"/></svg>`)).toThrow(
      SvgImportError,
    );
    expect(() => read(`<svg viewBox="0 0 24 24"><path d="M0 0" transform="skewX(20)"/></svg>`)).toThrow(SvgImportError);
  });

  it("says so when there is nothing to take", () => {
    expect(() => read("<p>not an svg</p>")).toThrow(SvgImportError);
    expect(() => read(`<svg viewBox="0 0 24 24"></svg>`)).toThrow(/no geometry/);
  });
});
