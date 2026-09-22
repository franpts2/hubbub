import { clientGame } from "../../../games/client";
import type { Identity, RoomState } from "../../../shared/protocol";
import { WaitingRoom } from "./WaitingRoom";

/**
 * The one decision the phone shell makes: are we waiting, or is a game on?
 *
 * Beyond that it hands over to the active game's component. The platform has
 * no opinion on what a phone shows mid-game, which is why adding a game does
 * not touch this file.
 */
export function PlayerPhase({
  state,
  you,
  onCommand,
}: {
  state: RoomState;
  you: Identity;
  onCommand: (command: unknown) => void;
}) {
  if (state.status === "lobby") {
    return <WaitingRoom count={state.players.length} />;
  }

  const game = clientGame(state.gameId);
  return (
    <game.PlayerView
      view={state.game}
      you={you}
      players={state.players}
      deadline={state.deadline}
      send={onCommand}
    />
  );
}
