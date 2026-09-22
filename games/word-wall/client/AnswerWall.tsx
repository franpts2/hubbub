import type { Answer } from "../shared";
import { AnswerCard } from "./AnswerCard";

/** Where answers land, live, as people send them. */
export function AnswerWall({ answers }: { answers: Answer[] }) {
  return (
    <div className="flex flex-1 flex-wrap content-start items-start justify-center gap-4">
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
