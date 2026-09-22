import { useMemo } from "react";

import { LoadingScreen } from "../../components/feedback/LoadingScreen";
import { NoticeScreen } from "../../components/feedback/NoticeScreen";
import { Button, ConnectionBadge, ErrorNote, Eyebrow, Screen } from "../../components/ui";
import { useRoomSocket } from "../../hooks/useRoomSocket";
import { fatalError } from "../../lib/connection";
import { playerIdFor } from "../../lib/session";
import { PlayerPhase } from "./PlayerPhase";

/** A named player, connected (or trying to connect) to a room. */
export function PlayerRoom({
  code,
  name,
  onLeave,
  onRename,
}: {
  code: string;
  name: string;
  onLeave: () => void;
  onRename: () => void;
}) {
  const playerId = useMemo(() => playerIdFor(code), [code]);
  const connection = useRoomSocket({ code, role: "player", name, playerId });
  const { state, status, you, error, send } = connection;
  const fatal = fatalError(connection);

  if (fatal !== null) {
    return (
      <NoticeScreen message={fatal.message}>
        {fatal.code === "name_taken" ? (
          <Button onClick={onRename}>Pick another name</Button>
        ) : null}
        <Button variant="ghost" onClick={onLeave}>
          Back to start
        </Button>
      </NoticeScreen>
    );
  }

  if (state === null) {
    return <LoadingScreen status={status} label={`Joining ${code}…`} />;
  }

  return (
    <Screen className="gap-6">
      <ConnectionBadge status={status} />

      <header className="flex items-center justify-between">
        <Eyebrow as="span">Room {code}</Eyebrow>
        <Eyebrow as="span" tone="cool">
          {name}
        </Eyebrow>
      </header>

      <PlayerPhase
        state={state}
        youId={you?.id ?? null}
        onSubmit={(text) => send({ t: "submit", text })}
      />

      {/* Anything fatal returned above, so this is a recoverable complaint. */}
      {error ? <ErrorNote>{error.message}</ErrorNote> : null}
    </Screen>
  );
}
