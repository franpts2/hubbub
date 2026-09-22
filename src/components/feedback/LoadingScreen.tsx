import type { ConnectionStatus } from "../../lib/connection";
import { ConnectionBadge } from "../ui/ConnectionBadge";
import { Eyebrow, type EyebrowSize } from "../ui/Eyebrow";
import { Screen } from "../ui/Screen";

/**
 * Shown while the first room snapshot is still on its way.
 *
 * Both the host screen and the phone reach this state, so the connection
 * badge is wired in here — without it a socket that never opens looks
 * identical to one that is merely slow.
 */
export function LoadingScreen({
  status,
  label,
  size = "lg",
}: {
  status: ConnectionStatus;
  label: string;
  size?: EyebrowSize;
}) {
  return (
    <Screen className="items-center justify-center">
      <ConnectionBadge status={status} />
      <Eyebrow size={size} tracking="widest" className="animate-pulse-soft">
        {label}
      </Eyebrow>
    </Screen>
  );
}
