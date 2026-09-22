import { useEffect, useState, type FormEvent } from "react";

import {
  Button,
  CountdownChip,
  TextField,
  eyebrowClass,
} from "../../../src/components/ui";
import { useCountdown } from "../../../src/hooks/useCountdown";
import {
  MAX_ANSWER_LENGTH,
  hasSubmitted,
  normalizeAnswer,
  type WritingView,
} from "../shared";

export function WriteForm({
  view,
  youId,
  deadline,
  onSubmit,
}: {
  view: WritingView;
  youId: string | null;
  deadline: number | null;
  onSubmit: (text: string) => void;
}) {
  const [draft, setDraft] = useState(view.yourAnswer ?? "");
  const remaining = useCountdown(deadline);
  // The server decides whether our answer landed, so a submission lost to a
  // dropped socket cannot look like a success.
  const submitted = hasSubmitted(view, youId);

  // A phone that reconnects mid-round gets its own answer back in the view;
  // put it in the box so the player can keep editing rather than retype it.
  // Only when the box is untouched, so this cannot overwrite live typing.
  useEffect(() => {
    if (view.yourAnswer !== null && draft === "") setDraft(view.yourAnswer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnect only
  }, [view.yourAnswer]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = normalizeAnswer(draft);
    if (clean === null) return;
    onSubmit(clean);
    // Text stays in the box: re-submitting overwrites, so it can be tweaked
    // until the phase ends.
  };

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className={eyebrowClass({ tracking: "widest" })}>
            Round {view.round} of {view.totalRounds}
          </p>
          <h1 className="mt-2 text-2xl font-black text-balance">{view.prompt}</h1>
        </div>
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
          placeholder="Make them laugh"
          className="px-4 py-5 text-2xl font-bold"
        />

        <div
          className={eyebrowClass(
            { tracking: "widest", weight: "bold" },
            "flex items-center justify-between",
          )}
        >
          <span>{submitted ? "In — you can change it" : "Nobody sees who wrote it"}</span>
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
