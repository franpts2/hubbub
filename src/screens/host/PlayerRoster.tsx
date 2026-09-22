import type { PublicPlayer } from "../../../shared/protocol";
import { Eyebrow, PlayerBlob } from "../../components/ui";

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
            /*
              This is where a face gets introduced, and it is the reason the
              lobby is worth the pixels: by the time an answer is on the wall
              there is no room to teach anybody whose blob is whose, so the
              pairing has to be learned here, while people are only waiting.
            */
            <li
              key={player.id}
              className="animate-pop flex items-center gap-3 rounded-2xl border-2 border-cool/40 bg-cool/10 py-2 pr-4 pl-2 text-xl font-black text-cream"
            >
              <PlayerBlob seed={player.id} />
              {player.name}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
