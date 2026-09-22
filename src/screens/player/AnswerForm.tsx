import { useState, type FormEvent } from "react";

import { MAX_ANSWER_LENGTH, type RoomState } from "../../../shared/protocol";
import { normalizeAnswer } from "../../../shared/validation";
import { Button, CountdownChip, TextField, eyebrowClass } from "../../components/ui";
import { useCountdown } from "../../hooks/useCountdown";
import { hasSubmitted } from "../../lib/roomState";

export function AnswerForm({
  state,
  youId,
  onSubmit,
}: {
  state: RoomState;
  youId: string | null;
  onSubmit: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const remaining = useCountdown(state.deadline);
  const submitted = hasSubmitted(state.players, youId);

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
        <h1 className="flex-1 text-2xl font-black text-balance">{state.prompt}</h1>
        {remaining !== null ? <CountdownChip seconds={remaining} size="sm" /> : null}
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
