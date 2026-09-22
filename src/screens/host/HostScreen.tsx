import { useMemo } from "react";

import { LoadingScreen } from "../../components/feedback/LoadingScreen";
import { NoticeScreen } from "../../components/feedback/NoticeScreen";
import { Button, ConnectionBadge, Screen } from "../../components/ui";
import { useRoomSocket } from "../../hooks/useRoomSocket";
import { fatalError } from "../../lib/connection";
import { loadHostToken } from "../../lib/session";
import { HostHeader } from "./HostHeader";
import { HostLobby } from "./HostLobby";
import { HostRound } from "./HostRound";

/**
 * The shared screen: a TV, a laptop, whatever everyone is looking at.
 *
 * This component only decides *which* view the room is in. Everything it
 * renders is a dumb function of the snapshot the server sent.
 */
export function HostScreen({ code, onExit }: { code: string; onExit: () => void }) {
  const hostToken = useMemo(() => loadHostToken(code), [code]);

  const connection = useRoomSocket(
    hostToken === null ? null : { code, role: "host", hostToken },
  );
  const { state, status, send } = connection;
  const fatal = fatalError(connection);

  // Hosting is tied to the tab that created the room. Opening /host/CODE
  // anywhere else has no token, and the server would reject it anyway.
  if (hostToken === null) {
    return (
      <NoticeScreen
        message={`This device is not the host of room ${code}. Room codes are controlled by the screen that created them.`}
      >
        <Button onClick={onExit}>Back to start</Button>
      </NoticeScreen>
    );
  }

  if (fatal !== null) {
    return (
      <NoticeScreen message={fatal.message}>
        <Button onClick={onExit}>Back to start</Button>
      </NoticeScreen>
    );
  }

  if (state === null) {
    return <LoadingScreen status={status} label="Opening room…" size="xl" />;
  }

  return (
    <Screen className="gap-8">
      <ConnectionBadge status={status} />

      <HostHeader code={code} phase={state.phase} deadline={state.deadline} />

      {state.phase === "lobby" ? (
        <HostLobby
          code={code}
          players={state.players}
          onStart={() => send({ t: "start" })}
        />
      ) : (
        <HostRound
          prompt={state.prompt}
          answers={state.answers}
          players={state.players}
          finished={state.phase === "results"}
          onSkip={() => send({ t: "skip" })}
          onNext={() => send({ t: "start" })}
          onLobby={() => send({ t: "reset" })}
        />
      )}
    </Screen>
  );
}
