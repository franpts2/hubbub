import type { RoomState } from "../../../shared/protocol";
import { AnswerForm } from "./AnswerForm";
import { PlayerResults } from "./PlayerResults";
import { WaitingRoom } from "./WaitingRoom";

/** Maps the room's phase to the single thing the phone should be showing. */
export function PlayerPhase({
  state,
  youId,
  onSubmit,
}: {
  state: RoomState;
  youId: string | null;
  onSubmit: (text: string) => void;
}) {
  switch (state.phase) {
    case "lobby":
      return <WaitingRoom count={state.players.length} />;
    case "prompt":
      return <AnswerForm state={state} youId={youId} onSubmit={onSubmit} />;
    case "results":
      return <PlayerResults state={state} />;
  }
}
