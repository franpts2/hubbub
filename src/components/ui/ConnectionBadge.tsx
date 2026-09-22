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
 *
 * It drops in from above the viewport rather than fading in over the game.
 * The bar is pinned to the top edge, so arriving from past that edge is where
 * it already looks like it came from; a crossfade would instead read as part
 * of the screen changing, which is the one thing it must not be confused with.
 *
 * There is no exit animation, and that is deliberate. The bar disappears at
 * the instant the socket comes back, which is good news nobody wants to watch
 * leave — holding it on screen for another 200ms to animate it out would be
 * 200ms of a player believing they are still offline.
 */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === "open") return null;

  return (
    <div
      role="status"
      className="animate-drop fixed inset-x-0 top-0 z-50 bg-punch px-4 py-2 text-center text-sm font-black tracking-widest text-cream uppercase"
    >
      <span className={status === "closed" ? "" : "animate-pulse-soft"}>
        {LABELS[status]}
      </span>
    </div>
  );
}
