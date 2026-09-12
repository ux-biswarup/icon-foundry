/// <reference types="@figma/plugin-typings" />
import {
  componentName,
  DATA_CODEPOINT,
  DATA_CONCEPT,
  DATA_LANGUAGE,
  DATA_LIBRARY,
  DATA_NAME,
  DATA_SVG,
  DATA_SYNCED_AT,
  ICONS_PAGE,
  type MainToUiMessage,
  type Payload,
  type PayloadIcon,
  type PlannedChange,
  type UiToMainMessage,
} from "./messages.js";

/**
 * Figma is a render target, the same way SVG is.
 *
 * This plugin does not author icons. It connects to a library, syncs what that
 * library published, and tells you what a component is. Authoring lives in the
 * studio, because two ways to make an icon that share no data is how a set
 * ends up with two of everything.
 *
 * The rule that makes syncing safe: a component is found by its recorded name,
 * not by its position or its label, and it is updated in place. Replacing the
 * node would detach every instance of it in every file.
 */

figma.showUI(__html__, { width: 420, height: 620, themeColors: true });

function post(message: MainToUiMessage): void {
  figma.ui.postMessage(message);
}

/** The page icons live on, created on first sync. */
async function iconsPage(create: boolean): Promise<PageNode | undefined> {
  const existing = figma.root.children.find((p) => p.name === ICONS_PAGE);
  if (existing) {
    await existing.loadAsync();
    return existing;
  }
  if (!create) return undefined;
  const page = figma.createPage();
  page.name = ICONS_PAGE;
  return page;
}

/** Every component this library has already put in the file, by icon name. */
function existingComponents(page: PageNode, library: string): Map<string, ComponentNode> {
  const found = new Map<string, ComponentNode>();
  for (const node of page.findAllWithCriteria({ types: ["COMPONENT"] })) {
    if (node.getPluginData(DATA_LIBRARY) !== library) continue;
    const name = node.getPluginData(DATA_NAME);
    if (name) found.set(name, node);
  }
  return found;
}

function planChanges(payload: Payload, existing: Map<string, ComponentNode>): PlannedChange[] {
  return payload.icons.map((icon) => {
    const node = existing.get(icon.name);
    if (!node) {
      return { name: icon.name, kind: icon.deprecated ? ("deprecated" as const) : ("new" as const) };
    }
    if (icon.deprecated) return { name: icon.name, kind: "deprecated" as const, nodeId: node.id };
    const same = node.getPluginData(DATA_SVG) === icon.svg && node.name === componentName(icon);
    return { name: icon.name, kind: same ? ("unchanged" as const) : ("changed" as const), nodeId: node.id };
  });
}

/** Replace a component's contents with freshly rendered geometry. */
function fill(component: ComponentNode, icon: PayloadIcon, payload: Payload): void {
  for (const child of [...component.children]) child.remove();
  const frame = figma.createNodeFromSvg(icon.svg);
  for (const child of [...frame.children]) component.appendChild(child);
  frame.remove();

  component.name = componentName(icon);
  component.resizeWithoutConstraints(icon.canvas, icon.canvas);
  component.description = [
    `${payload.name} · ${payload.language.name} v${payload.language.version}`,
    icon.concept ? `Concept: ${icon.concept}` : "",
    icon.codepoint ? `Codepoint: ${icon.codepoint}` : "",
    icon.deprecated ? `Deprecated${icon.replacedBy ? `, replaced by ${icon.replacedBy}` : ""}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  component.setPluginData(DATA_LIBRARY, payload.library);
  component.setPluginData(DATA_NAME, icon.name);
  component.setPluginData(DATA_LANGUAGE, payload.language.id);
  component.setPluginData(DATA_CONCEPT, icon.concept ?? "");
  component.setPluginData(DATA_CODEPOINT, icon.codepoint ?? "");
  component.setPluginData(DATA_SVG, icon.svg);
  component.setPluginData(DATA_SYNCED_AT, new Date().toISOString());
}

async function sync(payload: Payload): Promise<{ created: number; updated: number; deprecated: number }> {
  const page = (await iconsPage(true))!;
  const existing = existingComponents(page, payload.library);
  let created = 0;
  let updated = 0;
  let deprecated = 0;

  // A simple grid, only for components we create. An existing component keeps
  // wherever the designer put it.
  const columns = 10;
  const step = 64;
  let placed = existing.size;

  for (const icon of payload.icons) {
    const node = existing.get(icon.name);
    if (node) {
      const unchanged = node.getPluginData(DATA_SVG) === icon.svg && node.name === componentName(icon);
      if (!unchanged) {
        fill(node, icon, payload);
        updated += 1;
      }
      if (icon.deprecated) deprecated += 1;
      continue;
    }
    if (icon.deprecated) continue; // never create something already retired

    const component = figma.createComponent();
    page.appendChild(component);
    component.x = (placed % columns) * step;
    component.y = Math.floor(placed / columns) * step;
    placed += 1;
    fill(component, icon, payload);
    created += 1;
  }

  return { created, updated, deprecated };
}

function inspect(): void {
  const [node] = figma.currentPage.selection;
  if (!node) {
    post({ type: "inspected", found: false });
    return;
  }
  // An instance is asked about through the component it came from.
  const source = node.type === "INSTANCE" ? node.mainComponent : node;
  if (!source || source.getPluginData(DATA_LIBRARY) === "") {
    post({ type: "inspected", found: false });
    return;
  }
  post({
    type: "inspected",
    found: true,
    name: source.getPluginData(DATA_NAME),
    library: source.getPluginData(DATA_LIBRARY),
    language: source.getPluginData(DATA_LANGUAGE),
    concept: source.getPluginData(DATA_CONCEPT) || null,
    codepoint: source.getPluginData(DATA_CODEPOINT) || null,
    syncedAt: source.getPluginData(DATA_SYNCED_AT),
  });
}

figma.ui.onmessage = async (msg: UiToMainMessage) => {
  try {
    switch (msg.type) {
      case "cancel":
        figma.closePlugin();
        return;
      case "inspect":
        inspect();
        return;
      case "plan": {
        const page = await iconsPage(false);
        const existing = page ? existingComponents(page, msg.payload.library) : new Map<string, ComponentNode>();
        post({ type: "planned", changes: planChanges(msg.payload, existing), pageName: ICONS_PAGE });
        return;
      }
      case "sync": {
        const result = await sync(msg.payload);
        figma.notify(`Synced: ${result.created} new, ${result.updated} updated`);
        post({ type: "synced", ...result });
        return;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    figma.notify(`Icon Foundry: ${message}`, { error: true });
    post({ type: "error", message });
  }
};

figma.on("selectionchange", inspect);
