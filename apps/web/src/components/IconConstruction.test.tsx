// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { technical } from "@icon-foundry/icon-language";
import { Library, MemoryStore } from "@icon-foundry/icon-library";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { IconConstruction } from "./IconConstruction.js";

/**
 * A draft on its way into the library.
 *
 * The behaviour worth pinning is not that the canvas draws — the Method tab's
 * tests cover the canvas — it is what editing *means* here. A composition is a
 * recipe and a drawing is not, so the moment somebody drags a vertex the icon
 * changes category, and the spec has to say so rather than quietly keeping a
 * `primitive` reference that no longer describes what is on screen.
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

const SIZE = 420;

async function draft() {
  const library = await Library.create(new MemoryStore(), { id: "acme", name: "Acme" });
  const spec = parseIconSpec({
    name: "crate",
    language: technical.id,
    canvas: 24,
    elements: [{ primitive: "square", x: 4, y: 4, width: 16, height: 16 }],
  });
  let latest: IconSpec = spec;
  const view = render(
    <IconConstruction
      spec={spec}
      library={library}
      onChange={(next) => {
        latest = next;
      }}
    />,
  );
  const stage = view.container.querySelector("svg.method-svg") as SVGSVGElement;
  stage.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: SIZE, height: SIZE, right: SIZE, bottom: SIZE, x: 0, y: 0 }) as DOMRect;
  return { view, stage, spec, read: () => latest };
}

const px = (units: number) => (units / 24) * SIZE;

describe("editing a draft", () => {
  it("draws the composed geometry on the canvas it will ship on", async () => {
    const { stage, view } = await draft();
    expect(stage.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(stage.querySelectorAll("circle.ms-vertex").length).toBeGreaterThan(0);
    // Composed, so it still follows the language, and the panel says so.
    expect(view.container.textContent).toContain("Built from the vocabulary");
  });

  it("shows the keyline this icon is actually sized against", async () => {
    const { view, stage } = await draft();
    await act(async () => {
      [...view.container.querySelectorAll("button")]
        .find((b) => b.textContent === "Keylines")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // One box, not four — a square part against the square keyline.
    const boxes = stage.querySelectorAll(".mth-keyline");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.tagName).toBe("rect");
  });

  it("becomes a drawing the moment it is dragged, and says so", async () => {
    const { view, stage, spec, read } = await draft();
    expect(spec.elements?.[0]).toHaveProperty("primitive", "square");

    const handle = stage.querySelector("circle.mth-hit-vertex") as SVGCircleElement;
    await act(async () => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 1,
          clientX: px(Number(handle.getAttribute("cx"))),
          clientY: px(Number(handle.getAttribute("cy"))),
        }),
      );
    });
    await act(async () => {
      stage.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: px(6), clientY: px(6) }),
      );
    });
    await act(async () => {
      stage.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
    });

    // The spec handed back is geometry, not a recipe — because after a drag it
    // no longer is one, and keeping the primitive reference would be a lie that
    // the next keyline change would expose.
    const next = read();
    expect(next.elements).toHaveLength(1);
    expect(next.elements?.[0]).not.toHaveProperty("primitive");
    expect(next.elements?.[0]).toHaveProperty("path");
    expect(parseIconSpec(next).name).toBe("crate");

    // And the trade is named on screen rather than left to be discovered.
    expect(view.container.textContent).toContain("Now drawn, not composed");
    expect([...view.container.querySelectorAll("button")].some((b) => b.textContent === "Back to the composition")).toBe(
      true,
    );
  });

  it("takes an SVG pasted over the top of a draft", async () => {
    const { view, read } = await draft();
    const code = view.container.querySelector("textarea.mth-code-input") as HTMLTextAreaElement;
    const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      nativeValue?.call(
        code,
        `<svg viewBox="0 0 24 24" stroke-width="2"><rect x="6" y="6" width="12" height="12"/></svg>`,
      );
      code.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.container.querySelector(".error-text")).toBeNull();
    expect(view.container.textContent).toContain("Geometry taken");
    expect(String(read().elements?.[0] && (read().elements?.[0] as { path?: string[] }).path)).toContain("6 6");
  });
});

describe("undo on a draft", () => {
  const byText = (view: { container: HTMLElement }, text: string) =>
    [...view.container.querySelectorAll("button")].find((b) => b.textContent?.startsWith(text));

  it("goes back to the composition, which is a recipe again", async () => {
    /*
     * The trap: editing hands a *drawing* back to the page, which becomes the
     * spec prop. Composing that prop would compose the edit, so "back to the
     * composition" would have nothing left to go back to. The original is held
     * apart for exactly this.
     */
    const { view, stage, read } = await draft();
    const handle = stage.querySelector("circle.mth-hit-vertex") as SVGCircleElement;
    await act(async () => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 1,
          clientX: px(Number(handle.getAttribute("cx"))),
          clientY: px(Number(handle.getAttribute("cy"))),
        }),
      );
    });
    await act(async () => {
      stage.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: px(6), clientY: px(6) }),
      );
    });
    await act(async () => {
      stage.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
    });
    expect(read().elements?.[0]).toHaveProperty("path");

    await act(async () => {
      byText(view, "Undo")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Undo went through state rather than through a gesture, and the page was
    // told — so the icon is a composition again, not a drawing of one.
    expect(read().elements?.[0]).toHaveProperty("primitive", "square");
    expect(view.container.textContent).toContain("Built from the vocabulary");
  });
});
