import type { Primitive } from "./primitive.js";
import { objects } from "./objects/index.js";
import { shapes } from "./shapes/index.js";
import { symbols } from "./symbols/index.js";

export class PrimitiveRegistry {
  private readonly byName = new Map<string, Primitive>();

  constructor(primitives: readonly Primitive[] = []) {
    for (const primitive of primitives) this.register(primitive);
  }

  register(primitive: Primitive): this {
    if (this.byName.has(primitive.name)) {
      throw new Error(`Primitive "${primitive.name}" is already registered`);
    }
    this.byName.set(primitive.name, primitive);
    return this;
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  get(name: string): Primitive {
    const primitive = this.byName.get(name);
    if (!primitive) {
      throw new Error(`Unknown primitive "${name}". Known: ${this.names().join(", ")}`);
    }
    return primitive;
  }

  /**
   * Every primitive that declares it reads this value, in registry order.
   *
   * The studio needs this to answer "what does this control reach", which is
   * the question that keeps a panel of shared controls legible: you should
   * never wonder what a slider does, because the things it changes are the
   * things it can name.
   */
  consumersOf(trait: string): string[] {
    return this.names().filter((name) => this.get(name).traits?.includes(trait) === true);
  }

  names(): string[] {
    return [...this.byName.keys()];
  }

  list(): Primitive[] {
    return [...this.byName.values()];
  }

  /** New registry containing this registry's primitives plus `extra`. */
  extend(extra: readonly Primitive[]): PrimitiveRegistry {
    return new PrimitiveRegistry([...this.list(), ...extra]);
  }

  /** New registry with one primitive removed, for previewing a replacement. */
  without(name: string): PrimitiveRegistry {
    return new PrimitiveRegistry(this.list().filter((p) => p.name !== name));
  }
}

/** All primitives shipped with Icon Foundry. */
export const builtInPrimitives: readonly Primitive[] = [...shapes, ...objects, ...symbols].map((p) => ({
  ...p,
  origin: "builtin" as const,
}));

export const defaultRegistry = new PrimitiveRegistry(builtInPrimitives);
