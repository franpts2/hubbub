import { Eyebrow } from "../../../src/components/ui";
import type { WordWallView } from "../shared";

/**
 * The phone's version of the wall. The host screen is the main event, so this
 * is a scrollable fallback for anyone who cannot see it from where they sit.
 */
export function Results({ view }: { view: WordWallView }) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-xl font-black text-balance text-muted">{view.prompt}</h1>
      <Eyebrow tracking="wider">Look at the big screen</Eyebrow>

      <ul className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {view.answers.map((answer) => (
          <li
            key={answer.playerId}
            className="animate-rise rounded-2xl border-2 border-ink-line bg-ink-soft px-4 py-3"
          >
            <p className="text-lg font-black">{answer.text}</p>
            <Eyebrow size="xs" tone="punch">
              {answer.name}
            </Eyebrow>
          </li>
        ))}
      </ul>
    </div>
  );
}
