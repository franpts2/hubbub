import { useState, type FormEvent } from "react";

import { CODE_LENGTH, normalizeCode } from "../../shared/protocol";
import { Button, ErrorNote, Logo, Panel, Screen } from "../components/ui";
import { createRoom, roomExists } from "../lib/api";
import type { Route } from "../lib/router";
import { saveHostToken } from "../lib/session";

export function Home({ navigate }: { navigate: (route: Route) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"host" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onHost = async () => {
    setError(null);
    setBusy("host");
    try {
      const room = await createRoom();
      saveHostToken(room.code, room.hostToken);
      navigate({ name: "host", code: room.code });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setBusy(null);
    }
  };

  const onJoin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const parsed = normalizeCode(code);
    if (parsed === null) {
      setError(`Room codes are ${CODE_LENGTH} letters and numbers.`);
      return;
    }

    setBusy("join");
    // Check before navigating so a typo gives a clear message here rather
    // than a dead-end on the next screen.
    if (await roomExists(parsed)) {
      navigate({ name: "join", code: parsed });
    } else {
      setError(`No room called ${parsed}. Check the screen and try again.`);
      setBusy(null);
    }
  };

  return (
    <Screen className="items-center justify-center gap-10">
      <div className="text-center">
        <Logo className="text-6xl sm:text-7xl" />
        <p className="mt-3 text-sm font-bold uppercase tracking-[0.3em] text-muted">
          Party games for one screen
        </p>
      </div>

      <div className="w-full max-w-sm space-y-6">
        <Panel>
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted">
            On a TV or laptop
          </h2>
          <p className="mt-2 mb-4 text-sm text-muted">
            Open the shared screen everyone can see.
          </p>
          <Button onClick={onHost} disabled={busy !== null} className="w-full">
            {busy === "host" ? "Creating…" : "Start a room"}
          </Button>
        </Panel>

        <Panel>
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted">
            On your phone
          </h2>
          <form onSubmit={onJoin} className="mt-4 space-y-4">
            <input
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
              className="w-full rounded-2xl border-2 border-ink-line bg-ink px-4 py-4 text-center text-4xl font-black tracking-[0.4em] uppercase text-cream placeholder:text-ink-line focus:border-cool focus:outline-none"
            />
            <Button
              type="submit"
              variant="ghost"
              disabled={busy !== null}
              className="w-full"
            >
              {busy === "join" ? "Looking…" : "Join room"}
            </Button>
          </form>
        </Panel>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Screen>
  );
}
