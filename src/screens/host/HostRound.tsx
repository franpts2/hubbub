import type { Answer, PublicPlayer } from "../../../shared/protocol";
import { Button, Eyebrow } from "../../components/ui";
import { countSubmitted } from "../../lib/roomState";
import { AnswerWall } from "./AnswerWall";

export function HostRound({
  prompt,
  answers,
  players,
  finished,
  onSkip,
  onNext,
  onLobby,
}: {
  prompt: string | null;
  answers: Answer[];
  players: PublicPlayer[];
  finished: boolean;
  onSkip: () => void;
  onNext: () => void;
  onLobby: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="text-center">
        <Eyebrow tracking="wider">
          {finished
            ? "The wall"
            : `${countSubmitted(players)} of ${players.length} answered`}
        </Eyebrow>
        <h1 className="mt-3 text-4xl font-black text-balance sm:text-6xl">{prompt}</h1>
      </div>

      <AnswerWall answers={answers} />

      <div className="flex justify-center gap-4">
        {finished ? (
          <>
            <Button onClick={onNext}>Next prompt</Button>
            <Button variant="ghost" onClick={onLobby}>
              Back to lobby
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onSkip}>
            End round early
          </Button>
        )}
      </div>
    </div>
  );
}
