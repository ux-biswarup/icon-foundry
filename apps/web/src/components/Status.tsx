import type { ElementStatus, IconStatus } from "@icon-foundry/icon-library";

export function StatusPill({ status }: { status: IconStatus | ElementStatus }) {
  return <span className={`pill pill-${status}`}>{status}</span>;
}
