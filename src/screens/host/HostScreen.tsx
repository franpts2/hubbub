import { useMemo } from "react";

import { clientGame } from "../../../games/client";
import { LoadingScreen } from "../../components/feedback/LoadingScreen";
import { NoticeScreen } from "../../components/feedback/NoticeScreen";
import { Button, ConnectionBadge, Screen } from "../../components/ui";
import { useRoomSocket } from "../../hooks/useRoomSocket";
import { fatalError } from "../../lib/connection";
import { loadHostToken } from "../../lib/session";
import { HostHeader } from "./HostHeader";
import { HostLobby } from "./HostLobby";

/**
 * The shared screen: a TV, a laptop, whatever everyone is looking at.
 *
 * It owns the room, not the game: the connection, the header, the lobby, and
 * the decision to hand over. Once a game is running the middle of the screen
 * belongs to that game's own component, looked up by id, and this file has no
 * idea what it draws.
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

  const game = clientGame(state.gameId);

  return (
    <Screen className="gap-8">
      <ConnectionBadge status={status} />

      <HostHeader code={code} status={state.status} deadline={state.deadline} />

      {state.status === "lobby" ? (
        <HostLobby
          code={code}
          gameName={game.name}
          minPlayers={game.minPlayers}
          players={state.players}
          onStart={() => send({ t: "start_game" })}
        />
      ) : (
        <game.HostView
          view={state.game}
          players={state.players}
          deadline={state.deadline}
          send={(command) => send({ t: "game", c: command })}
          onEndGame={() => send({ t: "end_game" })}
        />
      )}
    </Screen>
  );
}
