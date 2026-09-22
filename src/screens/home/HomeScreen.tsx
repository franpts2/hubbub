import { ErrorNote, Eyebrow, Logo, Screen } from "../../components/ui";
import { useHomeActions } from "../../hooks/useHomeActions";
import type { Navigate } from "../../lib/routes";
import { HostRoomPanel } from "./HostRoomPanel";
import { JoinRoomPanel } from "./JoinRoomPanel";

/** The first screen: pick whether this device is the big screen or a player. */
export function HomeScreen({ navigate }: { navigate: Navigate }) {
  const { pending, error, hostRoom, joinRoom } = useHomeActions(navigate);
  const busy = pending !== null;

  return (
    <Screen className="items-center justify-center gap-10">
      <div className="text-center">
        <Logo className="text-6xl sm:text-7xl" />
        <Eyebrow size="md" tracking="wider" weight="bold" className="mt-3">
          Party games for one screen
        </Eyebrow>
      </div>

      <div className="w-full max-w-sm space-y-6">
        <HostRoomPanel onHost={hostRoom} pending={pending === "host"} disabled={busy} />
        <JoinRoomPanel onJoin={joinRoom} pending={pending === "join"} disabled={busy} />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Screen>
  );
}
