import { useState, type FormEvent } from "react";

import { MAX_NAME_LENGTH } from "../../../shared/protocol";
import { normalizeName } from "../../../shared/validation";
import {
  Button,
  ErrorNote,
  Eyebrow,
  Logo,
  Panel,
  Screen,
  TextField,
  eyebrowClass,
} from "../../components/ui";
import { loadLastName, saveName } from "../../lib/session";

export function NameForm({
  code,
  onPick,
  onBack,
}: {
  code: string;
  onPick: (name: string) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(loadLastName);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = normalizeName(draft);
    if (clean === null) {
      setError("Type a name first.");
      return;
    }
    saveName(code, clean);
    onPick(clean);
  };

  return (
    <Screen className="items-center justify-center gap-8">
      <div className="text-center">
        <Logo className="text-4xl" />
        <Eyebrow size="md" tracking="wider" className="mt-2">
          Room {code}
        </Eyebrow>
      </div>

      <Panel className="w-full max-w-sm">
        <form onSubmit={submit} className="space-y-4">
          <label htmlFor="player-name" className={eyebrowClass({}, "block")}>
            What should we call you?
          </label>
          <TextField
            id="player-name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            autoComplete="nickname"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Name"
            className="px-4 py-4 text-center text-3xl font-black"
          />
          <Button type="submit" className="w-full">
            Join
          </Button>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </form>
      </Panel>

      <button onClick={onBack} className={eyebrowClass({}, "underline")}>
        Use a different room
      </button>
    </Screen>
  );
}
