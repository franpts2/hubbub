import { useState, type FormEvent } from "react";

import { Button, Countdown, TextField, eyebrowClass } from "../../../src/components/ui";
import {
  MAX_ANSWER_LENGTH,
  hasSubmitted,
  normalizeAnswer,
  type WordWallView,
} from "../shared";

export function AnswerForm({
  view,
  youId,
  deadline,
  onSubmit,
}: {
  view: WordWallView;
  youId: string | null;
  deadline: number | null;
  onSubmit: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  // The server is the source of truth for whether our answer landed, so a
  // submission lost to a dropped socket does not look like a success.
  const submitted = hasSubmitted(view, youId);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = normalizeAnswer(draft);
    if (clean === null) return;
    onSubmit(clean);
    // Keep the text in the box: re-submitting overwrites, so players can
    // tweak what they wrote until the round ends.
  };

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <h1 className="flex-1 text-2xl font-black text-balance">{view.prompt}</h1>
        <Countdown deadline={deadline} size="sm" />
      </div>

      <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
        <TextField
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_ANSWER_LENGTH}
          autoFocus
          autoComplete="off"
          enterKeyHint="send"
          placeholder="Type your answer"
          className="px-4 py-5 text-2xl font-bold"
        />

        <div
          className={eyebrowClass(
            { tracking: "widest", weight: "bold" },
            "flex items-center justify-between",
          )}
        >
          <span>
            {submitted ? "Sent — you can change it" : "Everyone sees this on the screen"}
          </span>
          <span className="tabular-nums">
            {draft.length}/{MAX_ANSWER_LENGTH}
          </span>
        </div>

        <Button
          type="submit"
          disabled={draft.trim().length === 0}
          className="w-full py-6 text-2xl"
        >
          {submitted ? "Change it" : "Send it"}
        </Button>
      </form>
    </div>
  );
}
