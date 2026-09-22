import { Eyebrow } from "../../../src/components/ui";
import type { Said } from "../shared";

/**
 * Everything the table has accepted so far.
 *
 * Not decoration: repeating something already said is the one thing the
 * server refuses outright, so this list is the rulebook for the current turn
 * and has to be readable from across a room. Newest last, because people
 * scan for "has this gone yet" from the end.
 *
 * Each entry pops as it is accepted, and deliberately without a stagger.
 * The pop is the table's confirmation that an answer counted — it lands one
 * at a time, in time with someone saying it out loud.
 */
export function SaidList({ said, compact = false }: { said: Said[]; compact?: boolean }) {
  if (said.length === 0) {
    return (
      <Eyebrow className="text-center" tracking="wider">
        Nothing said yet
      </Eyebrow>
    );
  }

  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {said.map((entry, index) => (
        <li
          key={`${entry.playerId}-${index}`}
          className={`animate-pop rounded-xl border-2 border-ink-line bg-ink-soft font-bold ${
            compact ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-xl"
          }`}
        >
          {entry.text}
        </li>
      ))}
    </ul>
  );
}
