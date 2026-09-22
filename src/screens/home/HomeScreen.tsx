import { ErrorNote, Eyebrow, Logo, Screen, stagger } from "../../components/ui";
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

      <div className="w-full max-w-sm lg:max-w-3xl">
        {/*
          Side by side once there is room for it. Stacked, the two panels
          came to 945px and a laptop at 900px cut the join button in half —
          on the one screen in the app where both options have to be visible
          at once, because the whole screen is the question "which of these
          two devices is this?".
      
          They are also dealt out in reading order rather than appearing as
          one block. Seen once per session, which is the only frequency at
          which an entrance like this is worth its cost.
        */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <HostRoomPanel
            onHost={hostRoom}
            pending={pending === "host"}
            disabled={busy}
            className="lg:flex-1"
            style={stagger(0)}
          />
          <JoinRoomPanel
            onJoin={joinRoom}
            pending={pending === "join"}
            disabled={busy}
            className="lg:flex-1"
            style={stagger(1)}
          />
        </div>
        {error ? (
          <div className="mt-6">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}
      </div>
    </Screen>
  );
}
