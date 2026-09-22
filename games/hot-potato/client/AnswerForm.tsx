import { useState, type FormEvent } from "react";

import {
  Button,
  CountdownChip,
  TextField,
  eyebrowClass,
} from "../../../src/components/ui";
import { useCountdown } from "../../../src/hooks/useCountdown";
import { MAX_ANSWER_LENGTH, normalizeAnswer } from "../shared";

/**
 * Your turn, on a phone.
 *
 * The box is cleared on send rather than kept, unlike Crowd Favourite's. There
 * a resend overwrites your one answer; here every send is a separate attempt,
 * and if the server refuses it as a repeat the player needs an empty box to
 * try something else, fast.
 */
export function AnswerForm({
  category,
  deadline,
  onAnswer,
}: {
  category: string;
  deadline: number | null;
  onAnswer: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const remaining = useCountdown(deadline);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = normalizeAnswer(draft);
    if (clean === null) return;
    onAnswer(clean);
    setDraft("");
  };

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className={eyebrowClass({ tracking: "widest" }, "text-zap")}>Your turn</p>
          <h1 className="mt-2 text-2xl font-black text-balance">{category}</h1>
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
          placeholder="Name one"
          className="px-4 py-5 text-2xl font-bold"
        />

        <Button
          type="submit"
          disabled={draft.trim().length === 0}
          className="w-full py-6 text-2xl"
        >
          Say it
        </Button>
      </form>
    </div>
  );
}
