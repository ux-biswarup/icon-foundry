// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { technical } from "@icon-foundry/icon-language";
import { Library, MemoryStore } from "@icon-foundry/icon-library";
import { MethodCanvas } from "./MethodCanvas.js";

/**
 * The one thing no other test in this project can reach: a press, a drag and a
 * release on a vertex.
 *
 * Everything the drag *decides* is a pure function and tested as one — where a
 * point lands is `snapToConstruction`, what a corner gets is the radius ramp.
 * What broke in front of a real person was none of that. It was the plumbing
 * between a pointer and those functions: capture on the wrong element, and a
 * leave handler that cancelled the drag as soon as it started. That is what
 * this file is for, and it is why the shims below are kept honest.
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

const STAGE = 460;

/**
 * Canvas units to CSS pixels, read off the stage rather than assumed.
 *
 * A part is drawn in its own natural box, which is whatever its geometry
 * reaches — not the canvas size. Hard-coding the conversion here made the first
 * version of this test drag to the wrong place and then assert about it.
 */
const scaleOf = (stage: SVGSVGElement) => {
  const extent = Number(stage.getAttribute("viewBox")?.split(" ")[2] ?? 0);
  return (units: number) => (units / extent) * STAGE;
};

async function studio() {
  const library = await Library.create(new MemoryStore(), { id: "acme", name: "Acme" });
  // A square whose box is 16 units, the same as the optical size being drawn at,
  // so the layout grid on screen is the language's own 0.5 and the numbers in
  // this file are the numbers a person would see.
  await library.saveElement({
    name: "panel",
    category: "object",
    keywords: ["panel"],
    outline: ["M2 2 L16 2 L16 16 L2 16 Z"],
  });

  const view = render(
    <MethodCanvas
      library={library}
      language={technical}
      registry={library.registry()}
      size={16}
      selected="panel"
      onSelect={() => {}}
      onAction={async (fn) => fn(library)}
    />,
  );

  const stage = view.container.querySelector("svg.method-svg") as SVGSVGElement;
  stage.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: STAGE, height: STAGE, right: STAGE, bottom: STAGE, x: 0, y: 0 }) as DOMRect;
  return { view, library, stage };
}

const vertices = (stage: SVGSVGElement) =>
  [...stage.querySelectorAll("circle.ms-vertex")].map((c) => [
    Number(c.getAttribute("cx")),
    Number(c.getAttribute("cy")),
  ]);

/** Press on a vertex, move to a point in canvas units, release. */
async function drag(stage: SVGSVGElement, index: number, to: [number, number], init: PointerEventInit = {}) {
  const pixels = scaleOf(stage);
  const handle = stage.querySelectorAll("circle.ms-vertex")[index]!;
  await act(async () => {
    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, ...init }));
  });
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
  await act(async () => {
    stage.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
  });
}

describe("dragging a vertex", () => {
  it("moves the vertex the pointer pressed on, and only that one", async () => {
    const { stage } = await studio();
    expect(vertices(stage)).toEqual([
      [2, 2],
      [16, 2],
      [16, 16],
      [2, 16],
    ]);

    await drag(stage, 1, [16, 7]);

    const moved = vertices(stage);
    expect(moved[1]).toEqual([16, 7]);
    // The other three are where they were. This is the half that a pure snapping
    // test cannot check: that the press landed on the vertex under the pointer.
    expect([moved[0], moved[2], moved[3]]).toEqual([
      [2, 2],
      [16, 16],
      [2, 16],
    ]);
  });

  it("snaps to the language's angles, so a near-miss lands square", async () => {
    const { stage } = await studio();
    // Dragged a little off vertical from the corner below it.
    await drag(stage, 1, [16.4, 7.3]);
    const moved = vertices(stage)[1]!;
    expect(moved[0]).toBe(16);
    expect(moved[1]! % 0.5).toBe(0);
  });

  it("lets go of the angle set when ⌥ is held", async () => {
    const { stage } = await studio();
    await drag(stage, 1, [17.4, 7.3], { altKey: true });
    // Grid only: half units, and not pulled back onto the vertical.
    expect(vertices(stage)[1]).toEqual([17.5, 7.5]);
  });

  it("keeps following the pointer past the edge of the stage", async () => {
    // The bug a real person hit: capture was on the vertex while the handler was
    // on the stage, and the stage cancelled the drag on pointerleave.
    const { stage } = await studio();
    const handle = stage.querySelectorAll("circle.ms-vertex")[1]!;
    await act(async () => {
      handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
      stage.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1 }));
    });
    const pixels = scaleOf(stage);
    await act(async () => {
      stage.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: pixels(16), clientY: pixels(9) }),
      );
    });
    expect(vertices(stage)[1]).toEqual([16, 9]);
  });

  it("does nothing until a vertex is pressed", async () => {
    const { stage } = await studio();
    const pixels = scaleOf(stage);
    await act(async () => {
      stage.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: pixels(8), clientY: pixels(8) }),
      );
    });
    expect(vertices(stage)[1]).toEqual([16, 2]);
  });

  it("offers to save only once something has moved", async () => {
    const { view, stage } = await studio();
    const saveButton = () => [...view.container.querySelectorAll("button")].find((b) => b.textContent === "Save");
    expect(saveButton()).toBeUndefined();
    await drag(stage, 1, [16, 7]);
    expect(saveButton()).toBeDefined();
  });

  it("writes the moved drawing back to the element", async () => {
    const { view, library, stage } = await studio();
    await drag(stage, 1, [16, 7]);
    const save = [...view.container.querySelectorAll("button")].find((b) => b.textContent === "Save")!;
    await act(async () => {
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // Saved, and saved as the drawing on screen rather than the one it started
    // as — the whole round trip from a pointer to a file.
    expect(library.elements()[0]?.outline.join("")).toContain("16 7");
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
    expect([...view.container.querySelectorAll("button")].some((b) => b.textContent === "Copy to edit")).toBe(true);
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
    const copy = [...view.container.querySelectorAll("button")].find((b) => b.textContent === "Copy to edit")!;
    await act(async () => {
      copy.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(selected).toBe("warehouse-custom");
    expect(library.elements().map((e) => e.name)).toEqual(["warehouse-custom"]);
    // And it is a copy of the built-in's geometry, not an empty shape.
    expect(library.elements()[0]?.outline.length).toBeGreaterThan(0);
  });
});
