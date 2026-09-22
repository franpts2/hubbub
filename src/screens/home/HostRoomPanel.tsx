import { useState } from "react";

import { clientGames } from "../../../games/client";
import type { GameId } from "../../../engine/ids";
import { Button, Eyebrow, Panel, eyebrowClass } from "../../components/ui";

/**
 * Pick a game, then open the room.
 *
 * The choice is made here rather than in the lobby because a room is bound to
 * one game for its whole life — the server fixes it at creation so that a
 * running game cannot be swapped out from under the players' phones.
 */
export function HostRoomPanel({
  pending,
  disabled,
  onHost,
}: {
  pending: boolean;
  disabled: boolean;
  onHost: (gameId: GameId) => void;
}) {
  const games = clientGames();
  const [chosen, setChosen] = useState<GameId>(games[0].id);

  return (
    <Panel>
      <Eyebrow as="h2">On a TV or laptop</Eyebrow>
      <p className="mt-2 mb-4 text-sm text-muted">
        Open the shared screen everyone can see.
      </p>

      <fieldset className="mb-5 flex flex-col gap-2" disabled={disabled}>
        <legend className={eyebrowClass({ size: "xs" }, "mb-2")}>Pick a game</legend>
        {games.map((game) => {
          const selected = game.id === chosen;
          return (
            <label
              key={game.id}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 px-4 py-3 transition ${
                selected
                  ? "border-zap bg-zap/10"
                  : "border-ink-line bg-ink hover:border-muted"
              }`}
            >
              {/*
                A real radio, sized and styled rather than hidden behind
                `sr-only`. Visually hiding it leaves a one-pixel hit target and
                no visible indication of what is selected beyond the card
                colour, which is the sort of thing that works until someone
                turns off custom styles.
              */}
              <input
                type="radio"
                name="game"
                value={game.id}
                checked={selected}
                onChange={() => setChosen(game.id)}
                className="mt-1 size-4 shrink-0 appearance-none rounded-full border-2 border-ink-line checked:border-zap checked:bg-zap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cool"
              />
              <span>
                <span className="block text-base font-black">{game.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{game.tagline}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <Button onClick={() => onHost(chosen)} disabled={disabled} className="w-full">
        {pending ? "Creating…" : "Start a room"}
      </Button>
    </Panel>
  );
}
