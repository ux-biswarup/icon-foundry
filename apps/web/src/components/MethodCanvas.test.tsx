// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { technical } from "@icon-foundry/icon-language";
import { Library, MemoryStore } from "@icon-foundry/icon-library";
import { MethodCanvas } from "./MethodCanvas.js";

/**
 * The one thing no other test in this project can reach: a press, a drag and a
 * release on a handle.
 *
 * Everything a drag *decides* is a pure function and tested as one — where a
 * point lands is `snapToConstruction`, what a corner gets is the radius ramp,
 * what a delete leaves behind is `deleteSegments`. What broke in front of a
 * real person was none of that. It was the plumbing between a pointer and
 * those functions: capture on the wrong element, and a leave handler that
 * cancelled the drag as soon as it started. That is what this file is for, and
 * it is why the shims below are kept honest.
 */

/*
 * jsdom has no pointer events and no pointer capture, so both are supplied — and
 * nothing else is. `getBoundingClientRect` returns zeros in jsdom, which would
 * make every screen-to-canvas conversion NaN and let the component "pass" while
 * computing nothing, so the stage is given a real rectangle.
 *
 * The rule these follow: stand in for a browser, never for the component. If a
 * shim ever has to know what the component does, the test has stopped being a
 * test.
 */
beforeAll(() => {
  if (!("PointerEvent" in globalThis)) {
    class Pointer extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    (globalThis as { PointerEvent?: unknown }).PointerEvent = Pointer;
  }
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
});

afterEach(cleanup);

const STAGE = 520;

/** Canvas units to CSS pixels, read off the stage rather than assumed. */
const scaleOf = (stage: SVGSVGElement) => {
  const extent = Number(stage.getAttribute("viewBox")?.split(" ")[2] ?? 0);
  return (units: number) => (units / extent) * STAGE;
};

/**
 * A square that lands on whole canvas numbers once it is placed.
 *
 * The editor draws on the icon canvas, so a part is shown where the composer
 * would actually put it: scaled into the keyline box its optical shape names.
 * At size 16 the square box is 13 units at (1.5, 1.5), so a 13-unit part
 * declared here arrives at scale 1 with a 1.5 shift — which keeps every number
 * in this file a number a person would see on screen.
 */
async function studio(selected = "panel") {
  const library = await Library.create(new MemoryStore(), { id: "acme", name: "Acme" });
  await library.saveElement({
    name: "panel",
    category: "object",
    keywords: ["panel"],
    box: { width: 13, height: 13 },
    opticalShape: "square",
    outline: ["M0.5 0.5 L12.5 0.5 L12.5 12.5 L0.5 12.5 Z"],
  });

  const view = render(
    <MethodCanvas
      library={library}
      language={technical}
      registry={library.registry()}
      size={16}
      selected={selected}
      onSelect={() => {}}
      onAction={async (fn) => fn(library)}
    />,
  );

  const stage = view.container.querySelector("svg.method-svg") as SVGSVGElement;
  stage.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: STAGE, height: STAGE, right: STAGE, bottom: STAGE, x: 0, y: 0 }) as DOMRect;
  return { view, library, stage };
}

const at = (el: Element) => [Number(el.getAttribute("cx")), Number(el.getAttribute("cy"))];
const vertices = (stage: SVGSVGElement) => [...stage.querySelectorAll("circle.ms-vertex")].map(at);
const hits = (stage: SVGSVGElement, kind: string) => [...stage.querySelectorAll(`circle.mth-hit-${kind}`)];

/**
 * Press on a handle, at a point in canvas units.
 *
 * Where the press lands is not incidental: a drag moves geometry by the
 * distance the pointer travelled, so a press recorded at the wrong place moves
 * everything by the difference. Circles are pressed at their own centre, which
 * is what a person does; a segment has to be told where along it to grab.
 */
async function press(stage: SVGSVGElement, handle: Element, from?: [number, number], init: PointerEventInit = {}) {
  const pixels = scaleOf(stage);
  const at: [number, number] = from ?? [Number(handle.getAttribute("cx")), Number(handle.getAttribute("cy"))];
  await act(async () => {
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        clientX: pixels(at[0]),
        clientY: pixels(at[1]),
        ...init,
      }),
    );
  });
}

async function moveTo(stage: SVGSVGElement, to: [number, number], init: PointerEventInit = {}) {
  const pixels = scaleOf(stage);
  await act(async () => {
    stage.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientX: pixels(to[0]),
        clientY: pixels(to[1]),
        ...init,
      }),
    );
  });
}

async function release(stage: SVGSVGElement) {
  await act(async () => {
    stage.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
  });
}

/** Press on a handle, move to a point in canvas units, release. */
async function drag(
  stage: SVGSVGElement,
  handle: Element,
  to: [number, number],
  init: PointerEventInit = {},
  from?: [number, number],
) {
  await press(stage, handle, from, init);
  await moveTo(stage, to, init);
  await release(stage);
}

const button = (view: { container: HTMLElement }, label: string) =>
  [...view.container.querySelectorAll("button")].find((b) => b.textContent === label);

describe("the drawing on the canvas", () => {
  it("is placed where the composer would place it, not in its own box", async () => {
    const { stage } = await studio();
    expect(stage.getAttribute("viewBox")).toBe("0 0 16 16");
    // 0.5 → 2 and 12.5 → 14: the keyline box's own 1.5 offset, which is what
    // makes the safe area and optical boxes underneath mean anything.
    expect(vertices(stage)).toEqual([
      [2, 2],
      [14, 2],
      [14, 14],
      [2, 14],
    ]);
  });

  it("draws the rules the drawing is judged against underneath it", async () => {
    const { view, stage } = await studio();
    expect(stage.querySelector(".mth-safe-area")).not.toBeNull();
    expect(stage.querySelector(".mth-canvas-edge")).not.toBeNull();
    // Off by default, because a box behind every drawing is furniture.
    expect(stage.querySelector(".mth-keyline")).toBeNull();
    await act(async () => {
      button(view, "Keylines")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // One keyline, and the part's own. Showing all four was the old behaviour
    // and it put a circle behind every square icon — three rules the drawing is
    // not being judged by, drawn as if it were.
    const boxes = stage.querySelectorAll(".mth-keyline");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.tagName).toBe("rect");
    expect(boxes[0]?.getAttribute("width")).toBe("13");
  });

  it("uses the circle keyline for a part whose shape is round", async () => {
    const { stage } = await studio("circle");
    await act(async () => {
      [...stage.ownerDocument.querySelectorAll("button")]
        .find((b) => b.textContent === "Keylines")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const boxes = stage.querySelectorAll(".mth-keyline");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.tagName).toBe("circle");
    // The circle box is larger than the square one, which is the entire reason
    // the four exist: a circle presents less ink at equal width.
    expect(boxes[0]?.getAttribute("r")).toBe("7");
  });
});

describe("dragging a vertex", () => {
  it("moves the vertex the pointer pressed on, and only that one", async () => {
    const { stage } = await studio();
    await drag(stage, hits(stage, "vertex")[1]!, [14, 7]);

    const moved = vertices(stage);
    expect(moved[1]).toEqual([14, 7]);
    // The other three are where they were. This is the half that a pure snapping
    // test cannot check: that the press landed on the vertex under the pointer.
    expect([moved[0], moved[2], moved[3]]).toEqual([
      [2, 2],
      [14, 14],
      [2, 14],
    ]);
  });

  it("snaps to the language's angles, so a near-miss lands square", async () => {
    const { stage } = await studio();
    await drag(stage, hits(stage, "vertex")[1]!, [14.4, 7.3]);
    const moved = vertices(stage)[1]!;
    expect(moved[0]).toBe(14);
    expect(moved[1]! % 0.5).toBe(0);
  });

  it("lets go of the angle set when ⌥ is held", async () => {
    const { stage } = await studio();
    await drag(stage, hits(stage, "vertex")[1]!, [15.4, 7.3], { altKey: true });
    // Neither pulled back onto the vertical nor rounded to the grid.
    const moved = vertices(stage)[1]!;
    expect(moved[0]).toBeCloseTo(15.4, 5);
    expect(moved[1]).toBeCloseTo(7.3, 5);
  });

  it("keeps following the pointer past the edge of the stage", async () => {
    // The bug a real person hit: capture was on the vertex while the handler was
    // on the stage, and the stage cancelled the drag on pointerleave.
    const { stage } = await studio();
    await press(stage, hits(stage, "vertex")[1]!);
    await act(async () => {
      stage.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1 }));
    });
    await moveTo(stage, [14, 9]);
    expect(vertices(stage)[1]).toEqual([14, 9]);
  });

  it("does nothing until a handle is pressed", async () => {
    const { stage } = await studio();
    await moveTo(stage, [8, 8]);
    expect(vertices(stage)[1]).toEqual([14, 2]);
  });
});

describe("dragging a segment", () => {
  it("moves both of its ends, and everything sharing them", async () => {
    const { stage } = await studio();
    const top = stage.querySelectorAll("path.mth-hit-seg")[0]!;
    // Grabbed in the middle of the top edge and pulled down two units. Its ends
    // are shared with the two side edges, so those follow without anyone
    // keeping them attached.
    await drag(stage, top, [8, 4], {}, [8, 2]);

    const moved = vertices(stage);
    expect(moved[0]).toEqual([2, 4]);
    expect(moved[1]).toEqual([14, 4]);
    // The far corners did not move: a segment drag is not a whole-shape drag.
    expect([moved[2], moved[3]]).toEqual([
      [14, 14],
      [2, 14],
    ]);
  });

  it("carries the rest of a shift-selection with it", async () => {
    const { stage } = await studio();
    const segment = (i: number) => [...stage.querySelectorAll("path.mth-hit-seg")][i]!;
    await press(stage, segment(0), [8, 2]);
    await release(stage);
    await press(stage, segment(1), [14, 8], { shiftKey: true });
    await release(stage);

    // Top and right edges selected, which between them own three of the four
    // corners. Dragging either now moves all three.
    await drag(stage, segment(0), [8, 4], {}, [8, 2]);
    const moved = vertices(stage);
    expect(moved[0]).toEqual([2, 4]);
    expect(moved[1]).toEqual([14, 4]);
    expect(moved[2]).toEqual([14, 16]);
    // The one corner neither edge touches stayed put.
    expect(moved[3]).toEqual([2, 14]);
  });
});

describe("the radius handle", () => {
  it("states a radius at a joint instead of the language's", async () => {
    const { view, stage } = await studio();
    const rings = hits(stage, "radius");
    // A closed square has a joint at every corner, each already showing the
    // radius the ramp gives a 90° turn.
    expect(rings.length).toBe(4);
    expect(view.container.textContent).toContain("90° · r1.5");

    await drag(stage, rings[0]!, [5, 5]);
    expect(view.container.textContent).toContain("90° · r3");
    // And it is recorded as a decision, not baked into the geometry.
    expect(vertices(stage)[0]).toEqual([2, 2]);
    expect(view.container.querySelector(".mth-radius-handle.stated")).not.toBeNull();
  });

  it("hands the radius back to the language on request", async () => {
    const { view, stage } = await studio();
    await drag(stage, hits(stage, "radius")[0]!, [5, 5]);
    expect(view.container.textContent).toContain("90° · r3");

    await press(stage, stage.querySelectorAll("path.mth-hit-seg")[0]!, [8, 2]);
    await release(stage);
    await act(async () => {
      stage.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    const give = button(view, "Give the radius back to the language");
    expect(give).toBeDefined();
    await act(async () => {
      give?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(view.container.textContent).toContain("90° · r1.5");
  });
});

describe("acting on a selection", () => {
  it("deletes the selected segment and leaves the rest joined up", async () => {
    const { view, stage } = await studio();
    expect(stage.querySelectorAll("path.mth-hit-seg").length).toBe(4);

    await press(stage, stage.querySelectorAll("path.mth-hit-seg")[0]!, [8, 2]);
    await release(stage);
    await act(async () => {
      stage.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      button(view, "Delete segment")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // A ring that loses an edge is one open run, not two.
    expect(stage.querySelectorAll("path.mth-hit-seg").length).toBe(3);
    expect(vertices(stage).length).toBe(4);
  });
});

describe("saving", () => {
  it("offers to save only once something has moved", async () => {
    const { view, stage } = await studio();
    expect(button(view, "Save")).toBeUndefined();
    await drag(stage, hits(stage, "vertex")[1]!, [14, 7]);
    expect(button(view, "Save")).toBeDefined();
  });

  it("writes the drawing back in the part's own box, not the canvas's", async () => {
    const { view, library, stage } = await studio();
    await drag(stage, hits(stage, "vertex")[1]!, [14, 7]);
    await act(async () => {
      button(view, "Save")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // Dragged to 7 on the canvas, stored as 5.5 in a box that starts at 1.5 —
    // the round trip through the placement, which is the thing that could
    // silently move every part in a set.
    const outline = library.elements()[0]?.outline.join("") ?? "";
    expect(outline).toContain("12.5 5.5");
  });
});

describe("the path data beside the canvas", () => {
  it("shows what is stored, and selects on the canvas from the caret", async () => {
    const { view, stage } = await studio();
    const code = view.container.querySelector("textarea.mth-code-input") as HTMLTextAreaElement;
    expect(code.value).toContain("M0.5 0.5");

    // The caret inside the second command's numbers picks that segment.
    const index = code.value.indexOf("12.5");
    code.setSelectionRange(index, index);
    await act(async () => {
      code.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }));
    });
    expect(stage.querySelectorAll("g.mth-picked path").length).toBe(1);
  });

  it("takes an edit and redraws from it", async () => {
    const { view, stage } = await studio();
    const code = view.container.querySelector("textarea.mth-code-input") as HTMLTextAreaElement;
    const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      nativeValue?.call(code, "M0.5 0.5 L12.5 0.5 L12.5 6.5 Z");
      code.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(vertices(stage)).toEqual([
      [2, 2],
      [14, 2],
      [14, 8],
    ]);
  });

  it("says what is wrong instead of redrawing, when the path will not parse", async () => {
    const { view, stage } = await studio();
    const code = view.container.querySelector("textarea.mth-code-input") as HTMLTextAreaElement;
    const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      nativeValue?.call(code, "M0.5 0.5 Q nonsense");
      code.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.container.querySelector(".error-text")).not.toBeNull();
    // The drawing is untouched: a half-typed path is not an instruction.
    expect(vertices(stage).length).toBe(4);
  });
});

describe("a built-in part", () => {
  it("is locked, and says how to get past that", async () => {
    const library = await Library.create(new MemoryStore(), { id: "acme", name: "Acme" });
    const view = render(
      <MethodCanvas
        library={library}
        language={technical}
        registry={library.registry()}
        size={16}
        selected="warehouse"
        onSelect={() => {}}
        onAction={async (fn) => fn(library)}
      />,
    );
    expect(view.container.querySelector(".locked-note")).not.toBeNull();
    const tools = [...view.container.querySelectorAll("button")].filter((b) =>
      ["Tidy", "Arcify", "Offify"].includes(b.textContent ?? ""),
    );
    expect(tools).toHaveLength(3);
    expect(tools.every((b) => b.disabled)).toBe(true);
    expect(button(view, "Copy to edit")).toBeDefined();
    // Nothing to grab, either: locked means locked on the canvas too.
    expect(view.container.querySelectorAll(".mth-hit-seg").length).toBe(0);
    expect((view.container.querySelector("textarea.mth-code-input") as HTMLTextAreaElement).readOnly).toBe(true);
  });

  it("copies into an element of your own, which is editable", async () => {
    const library = await Library.create(new MemoryStore(), { id: "acme", name: "Acme" });
    let selected = "warehouse";
    const view = render(
      <MethodCanvas
        library={library}
        language={technical}
        registry={library.registry()}
        size={16}
        selected={selected}
        onSelect={(name) => {
          selected = name ?? "";
        }}
        onAction={async (fn) => fn(library)}
      />,
    );
    await act(async () => {
      button(view, "Copy to edit")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(selected).toBe("warehouse-custom");
    expect(library.elements().map((e) => e.name)).toEqual(["warehouse-custom"]);
    // And it is a copy of the built-in's geometry, not an empty shape — in the
    // part's own box, not the canvas it was being shown on.
    expect(library.elements()[0]?.outline.length).toBeGreaterThan(0);
  });
});

describe("the rounded view", () => {
  it("is a preview, not a second editor", async () => {
    const { view, stage } = await studio();
    expect(stage.querySelectorAll("path.mth-hit-seg").length).toBe(4);

    await act(async () => {
      button(view, "rounded")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Rounding gives the drawing its own segments and its own joints, so a drag
    // there would write back through whichever piece of the skeleton happened
    // to share an index. Nothing to grab is the honest answer.
    expect(stage.querySelectorAll("path.mth-hit-seg").length).toBe(0);
    expect(stage.querySelectorAll("circle.mth-hit-vertex").length).toBe(0);
    expect(stage.querySelectorAll("circle.mth-hit-radius").length).toBe(0);
    // And it really is the rounded drawing: corners became arcs.
    expect([...stage.querySelectorAll("path.mth-seg")].some((p) => p.getAttribute("d")?.includes("A"))).toBe(true);
  });
});

describe("a corner that is already cut", () => {
  /** A rounded part, which is what any real drawing looks like. */
  async function rounded() {
    const library = await Library.create(new MemoryStore(), { id: "acme", name: "Acme" });
    await library.saveElement({
      name: "tray",
      category: "object",
      keywords: ["tray"],
      box: { width: 13, height: 13 },
      opticalShape: "square",
      outline: ["M0.5 0.5 L10.5 0.5 A2 2 0 0 1 12.5 2.5 L12.5 12.5 L0.5 12.5 Z"],
    });
    const view = render(
      <MethodCanvas
        library={library}
        language={technical}
        registry={library.registry()}
        size={16}
        selected="tray"
        onSelect={() => {}}
        onAction={async (fn) => fn(library)}
      />,
    );
    const stage = view.container.querySelector("svg.method-svg") as SVGSVGElement;
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: STAGE, height: STAGE, right: STAGE, bottom: STAGE, x: 0, y: 0 }) as DOMRect;
    return { view, library, stage };
  }

  it("still has a radius to drag", async () => {
    // The whole complaint: once geometry is rounded, its joints are tangent and
    // there is nothing left for the ramp to offer a handle on — so without
    // recovering the corner from the arc, a rounded drawing has no editable
    // radius anywhere, even though every corner in it visibly has one.
    const { view, stage } = await rounded();
    expect(hits(stage, "fillet")).toHaveLength(1);
    expect(stage.querySelectorAll(".mth-radius-handle.cut")).toHaveLength(1);
    expect(view.container.textContent).toContain("Corners already cut");
    // The three square corners still get the ramp's handle; the rounded one
    // gets the cut corner's. Every corner in the drawing is reachable.
    expect(hits(stage, "radius")).toHaveLength(3);
  });

  it("re-cuts the corner, carrying the lines that meet it", async () => {
    const { stage } = await rounded();
    const before = vertices(stage);
    // The arc runs from (12, 2) to (14, 4) on the canvas; its corner is (14, 2)
    // and a 2-unit fillet puts the centre at (12, 4).
    await drag(stage, hits(stage, "fillet")[0]!, [11, 5]);

    const after = vertices(stage);
    expect(after).not.toEqual(before);
    // Both tangent points moved, and they are still on their own legs — which
    // is the part the tool this comes from needs a repair pass for.
    expect(after[1]).toEqual([11, 2]);
    expect(after[2]).toEqual([14, 5]);
    // The far ends of the two lines did not move: a radius is a local decision.
    expect(after[0]).toEqual(before[0]);
    expect(after[3]).toEqual(before[3]);
  });
});

describe("pasting an SVG into the code pane", () => {
  const typeInto = async (code: HTMLTextAreaElement, text: string) => {
    const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      nativeValue?.call(code, text);
      code.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("reads a whole icon somebody copied out of another tool", async () => {
    const { view, stage } = await studio();
    const code = view.container.querySelector("textarea.mth-code-input") as HTMLTextAreaElement;

    // Verbatim Lucide output, the thing that is actually on a designer's
    // clipboard. Elements as well as paths, and its own stroke opinions on top.
    await typeInto(
      code,
      `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 13 13"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
         <path d="M1 1V11" />
         <rect x="3" y="2" width="8" height="3" />
       </svg>`,
    );

    expect(view.container.querySelector(".error-text")).toBeNull();
    // A line and a rectangle: two vertices and four, placed on the canvas.
    expect(vertices(stage)).toHaveLength(6);
    expect(vertices(stage)[0]).toEqual([2.5, 2.5]);
  });

  it("says which of its attributes it refused", async () => {
    const { view } = await studio();
    const code = view.container.querySelector("textarea.mth-code-input") as HTMLTextAreaElement;
    await typeInto(
      code,
      `<svg viewBox="0 0 13 13" stroke-width="2" stroke-linecap="butt"><path d="M1 1V11"/></svg>`,
    );
    const said = view.container.textContent ?? "";
    expect(said).toContain("Geometry taken");
    expect(said).toContain('stroke-width="2"');
    expect(said).toContain('stroke-linecap="butt"');
  });

  it("offers the geometry back wearing the language's own attributes", async () => {
    const { view } = await studio();
    await act(async () => {
      button(view, "SVG")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const code = view.container.querySelector("textarea.mth-code-input") as HTMLTextAreaElement;
    expect(code.value).toContain("<svg xmlns=");
    // The set's stroke, not whatever the drawing arrived with.
    expect(code.value).toContain(`stroke-width="${technical.sizes[16]?.stroke.width}"`);
    expect(code.value).toContain('viewBox="0 0 13 13"');
    expect(code.value).toContain("<path d=");
  });

  it("changes nothing when the markup will not parse", async () => {
    const { view, stage } = await studio();
    const code = view.container.querySelector("textarea.mth-code-input") as HTMLTextAreaElement;
    const before = vertices(stage);
    await typeInto(code, `<svg viewBox="0 0 13 13"><rect x="0" y="0" width="4" height="4" rx="1" ry="3"/></svg>`);
    expect(view.container.querySelector(".error-text")).not.toBeNull();
    expect(vertices(stage)).toEqual(before);
  });
});

describe("undo and redo", () => {
  const undo = (view: { container: HTMLElement }) =>
    [...view.container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Undo"));
  const redo = (view: { container: HTMLElement }) =>
    [...view.container.querySelectorAll("button")].find((b) => b.textContent === "Redo");
  const click = async (b: Element | undefined) => {
    await act(async () => {
      b?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  it("offers nothing to undo until something is done", async () => {
    const { view } = await studio();
    expect(undo(view)).toBeUndefined();
    expect(redo(view)).toBeUndefined();
  });

  it("records one step per drag, not one per frame", async () => {
    /*
     * The whole difficulty. A drag calls back on every pointer move, and a
     * history that recorded each call would bury one gesture under a hundred
     * entries — undo would walk the pointer backwards across the screen instead
     * of putting the drawing back where it was.
     */
    const { view, stage } = await studio();
    const handle = hits(stage, "vertex")[1]!;
    await press(stage, handle);
    await moveTo(stage, [14, 5]);
    await moveTo(stage, [14, 6]);
    await moveTo(stage, [14, 7]);
    await release(stage);

    expect(vertices(stage)[1]).toEqual([14, 7]);
    expect(undo(view)?.textContent).toBe("Undo 1");
  });

  it("puts the drawing back, and forward again", async () => {
    const { view, stage } = await studio();
    const before = vertices(stage);
    await drag(stage, hits(stage, "vertex")[1]!, [14, 7]);
    expect(vertices(stage)[1]).toEqual([14, 7]);

    await click(undo(view));
    expect(vertices(stage)).toEqual(before);
    // Back to as-saved, so there is nothing to save either.
    expect(button(view, "Save")).toBeUndefined();

    await click(redo(view));
    expect(vertices(stage)[1]).toEqual([14, 7]);
    expect(button(view, "Save")).toBeDefined();
  });

  it("counts a toolbar action as its own step", async () => {
    const { view, stage } = await studio();
    await drag(stage, hits(stage, "vertex")[1]!, [14, 7]);
    await click(button(view, "Arcify"));
    expect(undo(view)?.textContent).toBe("Undo 2");

    // Undoing the Arcify leaves the drag in place.
    await click(undo(view));
    expect(vertices(stage)[1]).toEqual([14, 7]);
  });

  it("drops the redo trail once a new step is taken", async () => {
    const { view, stage } = await studio();
    await drag(stage, hits(stage, "vertex")[1]!, [14, 7]);
    await click(undo(view));
    expect(redo(view)?.disabled).toBe(false);

    await drag(stage, hits(stage, "vertex")[1]!, [14, 9]);
    expect(redo(view)?.disabled).toBe(true);
    expect(vertices(stage)[1]).toEqual([14, 9]);
  });

  it("starts again when the part does", async () => {
    // A history that survived a change of subject would offer to undo an edit
    // into a drawing that never had it.
    const library = await Library.create(new MemoryStore(), { id: "acme", name: "Acme" });
    await library.saveElement({
      name: "panel",
      category: "object",
      keywords: ["panel"],
      box: { width: 13, height: 13 },
      opticalShape: "square",
      outline: ["M0.5 0.5 L12.5 0.5 L12.5 12.5 L0.5 12.5 Z"],
    });
    const props = (selected: string) => ({
      library,
      language: technical,
      registry: library.registry(),
      size: 16,
      selected,
      onSelect: () => {},
      onAction: async (fn: (lib: typeof library) => Promise<unknown>) => fn(library),
    });

    const view = render(<MethodCanvas {...props("panel")} />);
    const stage = view.container.querySelector("svg.method-svg") as SVGSVGElement;
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: STAGE, height: STAGE, right: STAGE, bottom: STAGE, x: 0, y: 0 }) as DOMRect;

    await drag(stage, hits(stage, "vertex")[1]!, [14, 7]);
    expect(undo(view)).toBeDefined();

    await act(async () => {
      view.rerender(<MethodCanvas {...props("circle")} />);
    });
    expect(undo(view)).toBeUndefined();
  });
});
