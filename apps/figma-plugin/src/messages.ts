/** Messages exchanged between the plugin UI (iframe) and the sandbox (main). */

export interface PayloadIcon {
  name: string;
  svg: string;
  canvas: number;
  style: string;
  concept: string | null;
  codepoint: string | null;
  deprecated: boolean;
  replacedBy: string | null;
}

export interface Payload {
  library: string;
  name: string;
  language: { id: string; name: string; version: string };
  generatedAt: string;
  icons: PayloadIcon[];
}

export type ChangeKind = "new" | "changed" | "unchanged" | "deprecated";

export interface PlannedChange {
  name: string;
  kind: ChangeKind;
  /** Set when a component for this icon already exists in the file. */
  nodeId?: string;
}

/** Ask what a sync would do, before anything is written. */
export interface PlanMessage {
  type: "plan";
  payload: Payload;
}

/** Write the plan. Components are updated in place so instances stay attached. */
export interface SyncMessage {
  type: "sync";
  payload: Payload;
}

export interface InspectMessage {
  type: "inspect";
}

export interface CancelMessage {
  type: "cancel";
}

export type UiToMainMessage = PlanMessage | SyncMessage | InspectMessage | CancelMessage;

export interface PlannedMessage {
  type: "planned";
  changes: PlannedChange[];
  pageName: string;
}

export interface SyncedMessage {
  type: "synced";
  created: number;
  updated: number;
  deprecated: number;
}

/** What the selected component is, according to the library that made it. */
export interface InspectedMessage {
  type: "inspected";
  found: boolean;
  name?: string;
  library?: string;
  language?: string;
  concept?: string | null;
  codepoint?: string | null;
  syncedAt?: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type MainToUiMessage = PlannedMessage | SyncedMessage | InspectedMessage | ErrorMessage;

/** Plugin data keys. The library id is what makes a component ours. */
export const DATA_LIBRARY = "icon-foundry.library";
export const DATA_NAME = "icon-foundry.name";
export const DATA_CONCEPT = "icon-foundry.concept";
export const DATA_CODEPOINT = "icon-foundry.codepoint";
export const DATA_LANGUAGE = "icon-foundry.language";
export const DATA_SVG = "icon-foundry.svg";
export const DATA_SYNCED_AT = "icon-foundry.syncedAt";

export const ICONS_PAGE = "Icons";

export const componentName = (icon: { style: string; name: string }): string => `icon/${icon.style}/${icon.name}`;
