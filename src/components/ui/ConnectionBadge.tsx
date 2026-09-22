import type { ConnectionStatus } from "../../lib/connection";

const LABELS: Record<Exclude<ConnectionStatus, "open">, string> = {
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  closed: "Disconnected",
};

/**
 * Always-visible connection state. On a phone at a party, silently dropping
 * offline is the worst possible failure mode — people just stare at a frozen
 * screen. This makes reconnection visible so they wait instead of refreshing.
 */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === "open") return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-punch px-4 py-2 text-center text-sm font-black uppercase tracking-widest text-cream"
    >
      <span className={status === "closed" ? "" : "animate-pulse-soft"}>
        {LABELS[status]}
      </span>
    </div>
  );
}
