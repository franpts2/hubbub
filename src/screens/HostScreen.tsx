import { useMemo } from "react";

import type { Answer, PublicPlayer } from "../../shared/protocol";
import { QrCode } from "../components/QrCode";
import { Button, ConnectionBadge, ErrorNote, Logo, Screen } from "../components/ui";
import type { Route } from "../lib/router";
import { loadHostToken } from "../lib/session";
import { useCountdown } from "../lib/useCountdown";
import { useRoomSocket } from "../lib/useRoomSocket";

interface HostScreenProps {
  code: string;
  navigate: (route: Route) => void;
}

/** The shared screen: a TV, a laptop, whatever everyone is looking at. */
export function HostScreen({ code, navigate }: HostScreenProps) {
  const hostToken = useMemo(() => loadHostToken(code), [code]);

  const connection = useRoomSocket(
    hostToken === null ? null : { code, role: "host", hostToken },
  );
  const { state, status, error, send } = connection;
  const remaining = useCountdown(state?.deadline ?? null);

  // Hosting is tied to the tab that created the room. Opening /host/CODE
  // anywhere else has no token, and the server would reject it anyway.
  if (hostToken === null) {
    return (
      <Screen className="items-center justify-center gap-6 text-center">
        <Logo className="text-4xl" />
        <ErrorNote>
          This device is not the host of room {code}. Room codes are controlled by the
          screen that created them.
        </ErrorNote>
        <Button onClick={() => navigate({ name: "home" })}>Back to start</Button>
      </Screen>
    );
  }

  if (error && status === "closed") {
    return (
      <Screen className="items-center justify-center gap-6 text-center">
        <Logo className="text-4xl" />
        <ErrorNote>{error.message}</ErrorNote>
        <Button onClick={() => navigate({ name: "home" })}>Back to start</Button>
      </Screen>
    );
  }

  if (!state) {
    return (
      <Screen className="items-center justify-center">
        <ConnectionBadge status={status} />
        <p className="animate-pulse-soft text-2xl font-black uppercase tracking-widest text-muted">
          Opening room…
        </p>
      </Screen>
    );
  }

  const joinUrl = `${location.origin}/join/${code}`;
  const answered = state.players.filter((player) => player.submitted).length;

  return (
    <Screen className="gap-8">
      <ConnectionBadge status={status} />

      <header className="flex items-center justify-between">
        <Logo className="text-2xl" />
        {state.phase !== "lobby" ? (
          <div className="flex items-center gap-6">
            <RoomCodeChip code={code} />
            {remaining !== null ? <Timer seconds={remaining} /> : null}
          </div>
        ) : null}
      </header>

      {state.phase === "lobby" ? (
        <Lobby
          code={code}
          joinUrl={joinUrl}
          players={state.players}
          onStart={() => send({ t: "start" })}
        />
      ) : (
        <Round
          prompt={state.prompt}
          answers={state.answers}
          players={state.players}
          answered={answered}
          finished={state.phase === "results"}
          onSkip={() => send({ t: "skip" })}
          onNext={() => send({ t: "start" })}
          onLobby={() => send({ t: "reset" })}
        />
      )}
    </Screen>
  );
}

function RoomCodeChip({ code }: { code: string }) {
  return (
    <div className="text-right">
      <div className="text-[0.6rem] font-black uppercase tracking-[0.3em] text-muted">
        Room
      </div>
      <div className="text-2xl font-black tracking-[0.2em] text-cool">{code}</div>
    </div>
  );
}

function Timer({ seconds }: { seconds: number }) {
  const urgent = seconds <= 10;
  return (
    <div
      className={`min-w-20 rounded-2xl px-4 py-2 text-center text-4xl font-black tabular-nums ${
        urgent ? "bg-punch text-cream" : "bg-ink-soft text-cream"
      }`}
      aria-label={`${seconds} seconds remaining`}
    >
      {seconds}
    </div>
  );
}

function Lobby({
  code,
  joinUrl,
  players,
  onStart,
}: {
  code: string;
  joinUrl: string;
  players: PublicPlayer[];
  onStart: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 lg:flex-row lg:items-start lg:gap-16">
      <div className="flex flex-col items-center gap-5">
        <p className="text-sm font-black uppercase tracking-[0.3em] text-muted">
          Join at {joinUrl.replace(/^https?:\/\//, "")}
        </p>
        <div
          className="text-[6rem] leading-none font-black tracking-[0.15em] text-zap sm:text-[9rem]"
          aria-label={`Room code ${code.split("").join(" ")}`}
        >
          {code}
        </div>
        <QrCode value={joinUrl} size={200} />
        <p className="text-xs uppercase tracking-widest text-muted">
          or scan to join instantly
        </p>
      </div>

      <div className="w-full max-w-md">
        <h2 className="mb-4 text-sm font-black uppercase tracking-[0.3em] text-muted">
          Players ({players.length})
        </h2>
        {players.length === 0 ? (
          <p className="animate-pulse-soft text-xl font-bold text-muted">
            Waiting for the first phone…
          </p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {players.map((player) => (
              <li
                key={player.id}
                className="animate-pop rounded-2xl border-2 border-cool/40 bg-cool/10 px-4 py-2 text-xl font-black text-cream"
              >
                {player.name}
              </li>
            ))}
          </ul>
        )}

        <Button
          onClick={onStart}
          disabled={players.length === 0}
          className="mt-8 w-full text-2xl"
        >
          {players.length === 0 ? "Need a player" : "Start the round"}
        </Button>
      </div>
    </div>
  );
}

function Round({
  prompt,
  answers,
  players,
  answered,
  finished,
  onSkip,
  onNext,
  onLobby,
}: {
  prompt: string | null;
  answers: Answer[];
  players: PublicPlayer[];
  answered: number;
  finished: boolean;
  onSkip: () => void;
  onNext: () => void;
  onLobby: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="text-center">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-muted">
          {finished ? "The wall" : `${answered} of ${players.length} answered`}
        </p>
        <h1 className="mt-3 text-4xl font-black text-balance sm:text-6xl">{prompt}</h1>
      </div>

      <div className="flex flex-1 flex-wrap content-start items-start justify-center gap-4">
        {answers.length === 0 ? (
          <p className="animate-pulse-soft self-center text-2xl font-bold text-muted">
            Answers will land here…
          </p>
        ) : (
          answers.map((answer, index) => (
            <AnswerCard key={answer.playerId} answer={answer} index={index} />
          ))
        )}
      </div>

      <div className="flex justify-center gap-4">
        {finished ? (
          <>
            <Button onClick={onNext}>Next prompt</Button>
            <Button variant="ghost" onClick={onLobby}>
              Back to lobby
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onSkip}>
            End round early
          </Button>
        )}
      </div>
    </div>
  );
}

const CARD_TILTS = ["-2deg", "1.5deg", "-1deg", "2.5deg", "0.5deg", "-2.5deg"];

function AnswerCard({ answer, index }: { answer: Answer; index: number }) {
  return (
    <figure
      className="animate-pop max-w-xs rounded-3xl border-2 border-ink-line bg-ink-soft px-6 py-5 shadow-xl"
      style={{ transform: `rotate(${CARD_TILTS[index % CARD_TILTS.length]})` }}
    >
      <blockquote className="text-2xl font-black text-balance text-cream sm:text-3xl">
        {answer.text}
      </blockquote>
      <figcaption className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-punch">
        {answer.name}
      </figcaption>
    </figure>
  );
}
