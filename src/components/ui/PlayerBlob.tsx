import { Blobatar } from "@blobatar/react";

/**
 * A player's face: one deterministic blob, the same one all game.
 *
 * Exists because a name is not much use on the shared screen. Read from a
 * sofa, a caption under an answer is a few pixels of grey, and matching it
 * to a person takes longer than the answer is on screen. A silhouette and a
 * colour is recognisable at that distance in a way eight-point text is not.
 *
 * ## Seeded on the id, never the name or the roster position
 *
 * `seed` is the player's id, which looks wrong at a glance — the library's
 * own prop is called `name` and we are handing it a uuid — and is the whole
 * reason this wrapper exists rather than call sites reaching for `Blobatar`
 * themselves. Getting the seed wrong is silent: it renders a perfectly nice
 * face that means the wrong thing.
 *
 * Not the roster position, because leaving the room *filters* the array
 * (`removePlayer` in `worker/room/state.ts`). The fourth player of six
 * becoming the third shifts everybody behind them, so every face after the
 * gap would change in the middle of a round — precisely when identity has
 * to hold still.
 *
 * Not the display name, because names are mutable and ids are not. A
 * returning phone reclaims its seat *and may rename itself doing it* — see
 * the `existing.name = name` branch in `worker/room/join.ts`. Seeded on the
 * name, coming back from a dropped connection as "Ana!" instead of "Ana"
 * would hand you a new face mid-game while your score and your answers
 * stayed put. The room does enforce unique names, so two players cannot
 * collide on one today; that is a rule about the lobby, though, and this
 * does not want to depend on it.
 *
 * The id is also simply what the rest of the app already keys players on —
 * `submitted`, `voted`, `Answer.playerId`, `Standing.playerId` are all ids.
 * A face keyed on something else would be the one identity in the codebase
 * that disagreed with the others.
 *
 * ## Tone is locked, and that is a legibility fix
 *
 * Left to itself the library picks lightness from the seed, and against
 * `--color-ink` the dark end of that range disappears. Measured across
 * twelve ids: the worst head-vs-background contrast came out at 1.39:1, and
 * one in twelve fell below 3:1. In a six-player room that is roughly a two
 * in five chance somebody gets an invisible face.
 *
 * `tone: 0.15` pins every blob to the pale end — same twelve ids, worst case
 * 5.74:1, nothing below 3:1. It costs the darker, more saturated blobs,
 * which honestly suit the voltage of this palette better; legibility on the
 * one screen everybody is looking at from a sofa wins that argument.
 *
 * ## Static, and decorative
 *
 * No `animate`. Animated blobs have to be inline SVG, which is about a dozen
 * nodes each; static ones are a single `<img>`, and the lobby can hold
 * twelve of them. Nothing here needs to blink.
 *
 * `alt=""` on purpose. Every call site puts the player's name directly
 * beside the blob, so giving the image the name too makes a screen reader
 * announce it twice. The blob is decoration for the text, not a substitute.
 */

/** Pale enough to clear 3:1 on `--color-ink` for every possible seed. */
const TONE = 0.15;

/**
 * No `sm`. Below about 40px the silhouettes stop being distinguishable and
 * only the hue survives, at which point this is an expensive coloured dot —
 * so the scoreboards, whose rows are that size, deliberately do not use it.
 */
export type PlayerBlobSize = "md" | "lg" | "xl";

const SIZE: Record<PlayerBlobSize, number> = {
  md: 48,
  lg: 64,
  xl: 96,
};

export function PlayerBlob({
  /** The player's id. Not their name — see above, this matters. */
  seed,
  size = "md",
  className = "",
}: {
  seed: string;
  size?: PlayerBlobSize;
  className?: string;
}) {
  return (
    <Blobatar
      name={seed}
      size={SIZE[size]}
      tone={TONE}
      alt=""
      className={`shrink-0 ${className}`}
    />
  );
}
