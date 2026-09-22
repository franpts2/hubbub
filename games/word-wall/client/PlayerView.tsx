import type { GamePlayerProps } from "../../../engine/client";
import type { WordWallView } from "../shared";
import { AnswerForm } from "./AnswerForm";
import { Results } from "./Results";

/** Word Wall on a phone. One job per phase — nobody reads UI at a party. */
export function PlayerView({ view, you, deadline, send }: GamePlayerProps<WordWallView>) {
  switch (view.phase) {
    case "prompt":
      return (
        <AnswerForm
          view={view}
          youId={you.id}
          deadline={deadline}
          onSubmit={(text) => send({ t: "submit", text })}
        />
      );
    case "results":
      return <Results view={view} />;
  }
}
