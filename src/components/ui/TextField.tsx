import type { InputHTMLAttributes } from "react";

/**
 * The shared shell for every text input in the app.
 *
 * Only the chrome lives here — border, background, focus ring, placeholder
 * colour — because that is the part all three inputs agreed on while being
 * copy-pasted between them. Size, padding, weight and alignment stay at the
 * call site, since a four-character room code and an eighty-character answer
 * genuinely want to look different.
 *
 * The placeholder used to be drawn in `ink-line`, the same colour as the
 * border. On a phone in a dim room that is roughly invisible, so the box read
 * as empty rather than as a prompt. Half-strength `muted` is still obviously
 * placeholder text, but it can be read.
 */
const BASE =
  "w-full rounded-2xl border-2 border-ink-line bg-ink text-cream caret-cool " +
  "transition-[border-color] duration-150 ease-out " +
  "placeholder:text-muted/50 focus:border-cool focus:outline-none";

export function TextField({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${BASE} ${className}`} {...props} />;
}
