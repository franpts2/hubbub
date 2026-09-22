import type { Phase } from "../../../shared/protocol";
import { CountdownChip, Logo } from "../../components/ui";
import { useCountdown } from "../../hooks/useCountdown";
import { RoomCodeChip } from "./RoomCodeChip";

/**
 * The persistent top bar once a round is under way.
 *
 * The lobby hides it: there the code is already the largest thing on screen,
 * so repeating it in a corner is just noise.
 */
export function HostHeader({
  code,
  phase,
  deadline,
}: {
  code: string;
  phase: Phase;
  deadline: number | null;
}) {
  const remaining = useCountdown(deadline);

  return (
    <header className="flex items-center justify-between">
      <Logo className="text-2xl" />
      {phase !== "lobby" ? (
        <div className="flex items-center gap-6">
          <RoomCodeChip code={code} />
          {remaining !== null ? <CountdownChip seconds={remaining} /> : null}
        </div>
      ) : null}
    </header>
  );
}
