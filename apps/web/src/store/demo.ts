import { intentToSpec } from "@icon-foundry/icon-ai";
import { getBuiltInLanguage, DEFAULT_LANGUAGE_ID } from "@icon-foundry/icon-language";
import { Library, type FileStore } from "@icon-foundry/icon-library";

/**
 * Icons seeded into the browser library on first run so the app is useful
 * immediately. They are laid out by the same deterministic recipes the studio
 * uses, so the demo always matches the current language.
 */
const seeds = [
  { subject: "warehouse", modifiers: ["snowflake"], text: "temperature controlled warehouse", tags: ["logistics", "cold-chain"], concepts: ["cold storage", "refrigerated warehouse"] },
  { subject: "package", modifiers: ["warning"], text: "shipment exception", tags: ["logistics"], concepts: ["shipment exception", "delivery problem"] },
  { subject: "vehicle", modifiers: ["clock"], text: "delivery schedule", tags: ["logistics"], concepts: ["scheduled delivery", "ETA"] },
  { subject: "document", modifiers: ["plus"], text: "new document", tags: ["editing"], concepts: ["create document"] },
  { subject: "person", modifiers: [], text: "person", tags: ["people"], concepts: ["account", "profile"] },
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
    const spec = intentToSpec({ subject: seed.subject, modifiers: seed.modifiers, text: seed.text }, language);
    await library.save(spec, { tags: seed.tags, concepts: seed.concepts, status: "published" });
  }
  return library;
}
