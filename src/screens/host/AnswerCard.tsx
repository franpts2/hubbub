import type { Answer } from "../../../shared/protocol";
import { Eyebrow } from "../../components/ui";

/**
 * Cycled by position so the wall looks hand-pinned rather than gridded. Index
 * rather than random, so a card does not jump when the list re-renders.
 */
const TILTS = ["-2deg", "1.5deg", "-1deg", "2.5deg", "0.5deg", "-2.5deg"];

export function AnswerCard({ answer, index }: { answer: Answer; index: number }) {
  return (
    <figure
      className="animate-pop max-w-xs rounded-3xl border-2 border-ink-line bg-ink-soft px-6 py-5 shadow-xl"
      style={{ transform: `rotate(${TILTS[index % TILTS.length]})` }}
    >
      <blockquote className="text-2xl font-black text-balance text-cream sm:text-3xl">
        {answer.text}
      </blockquote>
      <Eyebrow as="figcaption" tone="punch" className="mt-3">
        {answer.name}
      </Eyebrow>
    </figure>
  );
}
