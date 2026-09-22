import { useState, type CSSProperties, type FormEvent } from "react";

import { CODE_LENGTH } from "../../../shared/protocol";
import { Button, Eyebrow, Panel, TextField } from "../../components/ui";

export function JoinRoomPanel({
  pending,
  disabled,
  onJoin,
  className,
  style,
}: {
  pending: boolean;
  disabled: boolean;
  onJoin: (code: string) => void;
  /** Layout only — how the home screen sizes this against its sibling. */
  className?: string;
  /** Entrance offset from `stagger()`. Passed straight to the panel. */
  style?: CSSProperties;
}) {
  const [code, setCode] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onJoin(code);
  };

  return (
    <Panel className={className} style={style}>
      <Eyebrow as="h2">On your phone</Eyebrow>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <TextField
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="CODE"
          // Turn off every helpful iOS feature that mangles a room code.
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          maxLength={CODE_LENGTH}
          aria-label="Room code"
          className="px-4 py-4 text-center text-4xl font-black uppercase tracking-[0.4em]"
        />
        <Button type="submit" variant="ghost" disabled={disabled} className="w-full">
          {pending ? "Looking…" : "Join room"}
        </Button>
      </form>
    </Panel>
  );
}
