import type { PublicPlayer } from "../../../shared/protocol";
import { Eyebrow } from "../../components/ui";

export function PlayerRoster({ players }: { players: PublicPlayer[] }) {
  return (
    <>
      <Eyebrow as="h2" tracking="wider" className="mb-4">
        Players ({players.length})
      </Eyebrow>

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
    </>
  );
}
