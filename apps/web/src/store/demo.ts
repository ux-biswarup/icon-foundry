import { intentToSpec } from "@icon-foundry/icon-ai";
import { getBuiltInLanguage, DEFAULT_LANGUAGE_ID } from "@icon-foundry/icon-language";
import { Library, type FileStore } from "@icon-foundry/icon-library";

/**
 * Icons seeded into the browser library on first run so the app is useful
 * immediately. They are laid out by the same deterministic recipes the studio
 * uses, so the demo always matches the current language.
 */
const seeds = [
  {
    subject: "warehouse", modifiers: ["snowflake"], text: "temperature controlled warehouse",
    tags: ["logistics", "cold-chain"],
    concept: { id: "cold-storage", name: "Cold storage", description: "A warehouse held below ambient temperature", aliases: ["refrigerated", "chilled", "temperature controlled", "cold chain"] },
  },
  {
    subject: "package", modifiers: ["warning"], text: "shipment exception", tags: ["logistics"],
    concept: { id: "shipment-exception", name: "Shipment exception", description: "A shipment that needs attention", aliases: ["delivery problem", "exception", "failed delivery"] },
  },
  {
    subject: "vehicle", modifiers: ["clock"], text: "delivery schedule", tags: ["logistics"],
    concept: { id: "scheduled-delivery", name: "Scheduled delivery", description: "A delivery with a planned time", aliases: ["eta", "delivery window", "schedule"] },
  },
  {
    subject: "document", modifiers: ["plus"], text: "new document", tags: ["editing"],
    concept: { id: "create-document", name: "Create document", aliases: ["new file", "add document"] },
  },
  {
    subject: "person", modifiers: [], text: "person", tags: ["people"],
    concept: { id: "account", name: "Account", description: "A person using the product", aliases: ["user", "profile", "customer"] },
  },
];

/** Recorded but not yet drawn, so the Gaps view has something to show. */
const openRequests = [
  { id: "cold-chain-breach", name: "Cold chain breach", description: "A refrigerated shipment that went out of range", aliases: ["temperature excursion"] },
  { id: "server", name: "Server", description: "A machine that serves requests", aliases: ["host", "node", "backend"] },
];

export async function seedDemo(store: FileStore): Promise<Library> {
  const language = getBuiltInLanguage(DEFAULT_LANGUAGE_ID);
  const library = await Library.create(store, {
    id: "demo",
    name: "Demo library",
    language: language.id,
    description: "Browser-only demo. Open a folder to work on a real library.",
  });
  for (const seed of seeds) {
    // The decomposition is the durable part: recorded once, it renders in any
    // language and needs no model the next time someone asks.
    await library.saveConcept({
      ...seed.concept,
      composition: {
        arrangement: seed.modifiers.length > 0 ? "badge" : "single",
        parts: [
          { element: seed.subject, priority: "essential" as const },
          ...seed.modifiers.map((element) => ({ element, priority: "optional" as const })),
        ],
      },
    });
    const spec = intentToSpec({ subject: seed.subject, modifiers: seed.modifiers, text: seed.text }, language);
    await library.save(spec, { tags: seed.tags, concept: seed.concept.id, status: "published" });
  }
  for (const request of openRequests) await library.saveConcept(request);
  return library;
}
