import type { CSSProperties } from "react";

import { Eyebrow, PlayerBlob } from "../../../src/components/ui";
import type { Answer } from "../shared";

/**
 * Cycled by position so the wall looks hand-pinned rather than gridded. Index
 * rather than random, so a card does not jump when the list re-renders.
 */
const TILTS = ["-2deg", "1.5deg", "-1deg", "2.5deg", "0.5deg", "-2.5deg"];

export function AnswerCard({ answer, index }: { answer: Answer; index: number }) {
  return (
    <figure
      className="animate-pop max-w-xs rounded-3xl border-2 border-ink-line bg-ink-soft px-6 py-5 shadow-xl"
      /*
       * The tilt is handed to the keyframe rather than set on the element.
       * A transform declared here is simply overwritten for as long as an
       * animation is running, so the card used to land flat and then snap
       * two degrees sideways on the frame after it finished. Now the
       * keyframe rotates *to* this value and its fill mode holds it there.
       *
       * No stagger. Answers arrive one at a time as people press send, and
       * the pop is the acknowledgement that yours got through — delaying it
       * by a card's place in the list would mistime the one thing it is for.
       */
      style={{ "--tilt": TILTS[index % TILTS.length] } as CSSProperties}
    >
      <blockquote className="text-2xl font-black text-balance text-cream sm:text-3xl">
        {answer.text}
      </blockquote>
      <figcaption className="mt-3 flex items-center gap-2">
        <PlayerBlob seed={answer.playerId} />
        <Eyebrow tone="punch">{answer.name}</Eyebrow>
      </figcaption>
    </figure>
  );
}
