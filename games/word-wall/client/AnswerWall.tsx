import type { Answer } from "../shared";
import { AnswerCard } from "./AnswerCard";

/**
 * Where answers land, live, as people send them.
 *
 * `content-center` rather than `content-start`: this fills the whole middle
 * of a television, and with three answers in a six-player room the wall was
 * a thin strip of cards pinned under the prompt with two thirds of the
 * screen empty below it. Centring the block means the wall grows outward
 * from the middle instead of hanging from the top.
 */
export function AnswerWall({ answers }: { answers: Answer[] }) {
  return (
    <div className="flex flex-1 flex-wrap content-center items-start justify-center gap-4">
      {answers.length === 0 ? (
        <p className="animate-pulse-soft self-center text-2xl font-bold text-muted">
          Answers will land here…
        </p>
      ) : (
        answers.map((answer, index) => (
          <AnswerCard key={answer.playerId} answer={answer} index={index} />
        ))
      )}
    </div>
  );
}
