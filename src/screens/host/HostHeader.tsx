import type { RoomStatus } from "../../../shared/protocol";
import { CountdownChip, Logo } from "../../components/ui";
import { useCountdown } from "../../hooks/useCountdown";
import { RoomCodeChip } from "./RoomCodeChip";

/**
 * The persistent top bar once a game is under way.
 *
 * The lobby hides it: there the code is already the largest thing on screen,
 * so repeating it in a corner is just noise.
 *
 * The countdown is drawn here, for every game, because "the room has a
 * deadline" is a platform fact — a game supplies the timestamp and gets the
 * chrome for free.
 */
export function HostHeader({
  code,
  status,
  deadline,
}: {
  code: string;
  status: RoomStatus;
  deadline: number | null;
}) {
  const remaining = useCountdown(deadline);

  return (
    <header className="flex items-center justify-between">
      <Logo className="text-2xl" />
      {status === "playing" ? (
        <div className="flex items-center gap-6">
          <RoomCodeChip code={code} />
          {remaining !== null ? <CountdownChip seconds={remaining} /> : null}
        </div>
      ) : null}
    </header>
  );
}
