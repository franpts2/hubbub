import type { GameHostProps } from "../../../engine/client";
import { Button, Eyebrow } from "../../../src/components/ui";
import type { WordWallView } from "../shared";
import { AnswerWall } from "./AnswerWall";

/**
 * Word Wall on the shared screen.
 *
 * The room code, the countdown and the connection badge are the platform's
 * chrome and are rendered around this. All this owns is the prompt, the wall
 * and the host's controls over the round.
 */
export function HostView({
  view,
  players,
  send,
  onEndGame,
}: GameHostProps<WordWallView>) {
  const finished = view.phase === "results";

  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="text-center">
        {/*
          Sized up from the app's default eyebrow. While a round is open this
          line is the only thing on the wall that changes, so it is what the
          room watches — and at twelve pixels from a sofa it was the smallest
          text on a television. It is still an order of magnitude below the
          prompt, which stays the loudest thing on the screen.
        */}
        <Eyebrow size="lg" tracking="wider">
          {finished
            ? "The wall"
            : `${view.submitted.length} of ${players.length} answered`}
        </Eyebrow>
        <h1 className="mt-3 text-4xl font-black text-balance sm:text-6xl lg:text-7xl">
          {view.prompt}
        </h1>
      </div>

      <AnswerWall answers={view.answers} />

      <div className="flex justify-center gap-4">
        {finished ? (
          <>
            <Button onClick={() => send({ t: "next" })}>Next prompt</Button>
            <Button variant="ghost" onClick={onEndGame}>
              Back to lobby
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => send({ t: "skip" })}>
            End round early
          </Button>
        )}
      </div>
    </div>
  );
}
