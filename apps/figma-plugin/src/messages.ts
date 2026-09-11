/** Messages exchanged between the plugin UI (iframe) and the sandbox (main). */

export interface CreateComponentMessage {
  type: "create-component";
  svg: string;
  name: string;
  canvas: number;
  style: string;
  language: { id: string; name: string; version: string };
  /** Serialised IconSpec, stored on the node so the icon can be regenerated. */
  spec: string;
}

export interface CancelMessage {
  type: "cancel";
}

export type UiToMainMessage = CreateComponentMessage | CancelMessage;

export interface ComponentCreatedMessage {
  type: "component-created";
  nodeName: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type MainToUiMessage = ComponentCreatedMessage | ErrorMessage;

export const PLUGIN_DATA_KEY = "icon-foundry.spec";
