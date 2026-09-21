import { useMemo, useState, type FormEvent } from "react";

import {
  MAX_ANSWER_LENGTH,
  MAX_NAME_LENGTH,
  normalizeAnswer,
  normalizeName,
  type RoomState,
} from "../../shared/protocol";
import { Button, ConnectionBadge, ErrorNote, Logo, Panel, Screen } from "../components/ui";
import type { Route } from "../lib/router";
import { loadLastName, loadName, playerIdFor, saveName } from "../lib/session";
import { useCountdown } from "../lib/useCountdown";
import { useRoomSocket } from "../lib/useRoomSocket";

interface PlayerScreenProps {
  code: string;
  navigate: (route: Route) => void;
}

/** The phone. Deliberately one job per screen — nobody reads UI at a party. */
export function PlayerScreen({ code, navigate }: PlayerScreenProps) {
  const playerId = useMemo(() => playerIdFor(code), [code]);
  const [name, setName] = useState<string | null>(() => loadName(code));

  if (name === null) {
    return (
      <NameForm code={code} onPick={setName} onBack={() => navigate({ name: "home" })} />
    );
  }

  return (
    <PlayerGame
      code={code}
      name={name}
      playerId={playerId}
      onLeave={() => navigate({ name: "home" })}
      onRename={() => setName(null)}
    />
  );
}

function NameForm({
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

  const onSubmit = (event: FormEvent) => {
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
        <p className="mt-2 text-sm font-black uppercase tracking-[0.3em] text-muted">
          Room {code}
        </p>
      </div>

      <Panel className="w-full max-w-sm">
        <form onSubmit={onSubmit} className="space-y-4">
          <label
            htmlFor="player-name"
            className="block text-xs font-black uppercase tracking-[0.2em] text-muted"
          >
            What should we call you?
          </label>
          <input
            id="player-name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            autoComplete="nickname"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-2xl border-2 border-ink-line bg-ink px-4 py-4 text-center text-3xl font-black text-cream placeholder:text-ink-line focus:border-cool focus:outline-none"
            placeholder="Name"
          />
          <Button type="submit" className="w-full">
            Join
          </Button>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </form>
      </Panel>

      <button
        onClick={onBack}
        className="text-xs font-black uppercase tracking-[0.2em] text-muted underline"
      >
        Use a different room
      </button>
    </Screen>
  );
}

function PlayerGame({
  code,
  name,
  playerId,
  onLeave,
  onRename,
}: {
  code: string;
  name: string;
  playerId: string;
  onLeave: () => void;
  onRename: () => void;
}) {
  const options = useMemo(
    () => ({ code, role: "player" as const, name, playerId }),
    [code, name, playerId],
  );
  const { state, status, you, error, send } = useRoomSocket(options);

  if (error && status === "closed") {
    return (
      <Screen className="items-center justify-center gap-6 text-center">
        <Logo className="text-4xl" />
        <ErrorNote>{error.message}</ErrorNote>
        <div className="flex gap-3">
          {error.code === "name_taken" ? (
            <Button onClick={onRename}>Pick another name</Button>
          ) : null}
          <Button variant="ghost" onClick={onLeave}>
            Back to start
          </Button>
        </div>
      </Screen>
    );
  }

  if (!state) {
    return (
      <Screen className="items-center justify-center">
        <ConnectionBadge status={status} />
        <p className="animate-pulse-soft text-xl font-black uppercase tracking-widest text-muted">
          Joining {code}…
        </p>
      </Screen>
    );
  }

  return (
    <Screen className="gap-6">
      <ConnectionBadge status={status} />

      <header className="flex items-center justify-between text-xs font-black uppercase tracking-[0.2em] text-muted">
        <span>Room {code}</span>
        <span className="text-cool">{name}</span>
      </header>

      <PhaseView
        state={state}
        youId={you?.id ?? null}
        onSubmit={(text) => send({ t: "submit", text })}
      />

      {error && status !== "closed" ? <ErrorNote>{error.message}</ErrorNote> : null}
    </Screen>
  );
}

function PhaseView({
  state,
  youId,
  onSubmit,
}: {
  state: RoomState;
  youId: string | null;
  onSubmit: (text: string) => void;
}) {
  switch (state.phase) {
    case "lobby":
      return <WaitingRoom count={state.players.length} />;
    case "prompt":
      return <AnswerForm state={state} youId={youId} onSubmit={onSubmit} />;
    case "results":
      return <Results state={state} />;
  }
}

function WaitingRoom({ count }: { count: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <Logo className="text-5xl" />
      <p className="text-2xl font-black">You are in.</p>
      <p className="animate-pulse-soft text-sm font-bold uppercase tracking-[0.2em] text-muted">
        Waiting for the host to start
      </p>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
        {count} {count === 1 ? "player" : "players"} here
      </p>
    </div>
  );
}

function AnswerForm({
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

  // The server is the source of truth for whether our answer landed, so a
  // submission lost to a dropped socket does not look like a success.
  const submitted = state.players.some(
    (player) => player.id === youId && player.submitted,
  );

  const send = (event: FormEvent) => {
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
        {remaining !== null ? (
          <span
            className={`rounded-xl px-3 py-1 text-2xl font-black tabular-nums ${
              remaining <= 10 ? "bg-punch text-cream" : "bg-ink-soft text-muted"
            }`}
          >
            {remaining}
          </span>
        ) : null}
      </div>

      <form onSubmit={send} className="flex flex-1 flex-col gap-4">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_ANSWER_LENGTH}
          autoFocus
          autoComplete="off"
          enterKeyHint="send"
          placeholder="Type your answer"
          className="w-full rounded-2xl border-2 border-ink-line bg-ink px-4 py-5 text-2xl font-bold text-cream placeholder:text-ink-line focus:border-cool focus:outline-none"
        />
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted">
          <span>
            {submitted ? "Sent — you can change it" : "Everyone sees this on the screen"}
          </span>
          <span className="tabular-nums">
            {draft.length}/{MAX_ANSWER_LENGTH}
          </span>
        </div>
        <Button type="submit" disabled={draft.trim().length === 0} className="w-full py-6 text-2xl">
          {submitted ? "Change it" : "Send it"}
        </Button>
      </form>
    </div>
  );
}

function Results({ state }: { state: RoomState }) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-xl font-black text-balance text-muted">{state.prompt}</h1>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-muted">
        Look at the big screen
      </p>
      <ul className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {state.answers.map((answer) => (
          <li
            key={answer.playerId}
            className="animate-rise rounded-2xl border-2 border-ink-line bg-ink-soft px-4 py-3"
          >
            <p className="text-lg font-black">{answer.text}</p>
            <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-punch">
              {answer.name}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
