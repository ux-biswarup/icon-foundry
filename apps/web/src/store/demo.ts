import { Library, type FileStore } from "@icon-foundry/icon-library";
import type { IconSpec } from "@icon-foundry/icon-spec";

/** Icons seeded into the browser library on first run so the app is useful immediately. */
const specs: Array<{ spec: IconSpec; tags: string[]; concepts: string[] }> = [
  {
    spec: {
      name: "temperature-warehouse",
      language: "lucide-inspired",
      canvas: 24,
      meta: { description: "Temperature-controlled warehouse" },
      elements: [
        { primitive: "warehouse", x: 2, y: 9, width: 15, height: 11, align: { x: "start", y: "end" } },
        { primitive: "snowflake", x: 15, y: 2, width: 7, height: 7 },
      ],
    },
    tags: ["logistics", "cold-chain"],
    concepts: ["cold storage", "refrigerated warehouse"],
  },
  {
    spec: {
      name: "shipment-exception",
      language: "lucide-inspired",
      canvas: 24,
      meta: { description: "A shipment with a problem" },
      elements: [
        { primitive: "package", x: 3, y: 10, width: 11, height: 11, align: { x: "start", y: "end" } },
        { primitive: "warning", x: 15, y: 2, width: 7, height: 7 },
      ],
    },
    tags: ["logistics"],
    concepts: ["shipment exception", "delivery problem"],
  },
  {
    spec: {
      name: "delivery-schedule",
      language: "lucide-inspired",
      canvas: 24,
      elements: [
        { primitive: "vehicle", x: 2, y: 10, width: 14, height: 10, align: { x: "start", y: "end" } },
        { primitive: "clock", x: 15, y: 2, width: 7, height: 7 },
      ],
    },
    tags: ["logistics"],
    concepts: ["scheduled delivery", "ETA"],
  },
  {
    spec: {
      name: "arrow-down",
      language: "lucide-inspired",
      canvas: 24,
      elements: [{ primitive: "arrow", x: 2, y: 2, width: 20, height: 20, rotate: 90 }],
    },
    tags: ["navigation"],
    concepts: ["download", "expand"],
  },
];

export async function seedDemo(store: FileStore): Promise<Library> {
  const library = await Library.create(store, {
    id: "demo",
    name: "Demo library",
    language: "lucide-inspired",
    description: "Browser-only demo. Open a folder to work on a real library.",
  });
  for (const { spec, tags, concepts } of specs) await library.save(spec, { tags, concepts, status: "published" });
  return library;
}
