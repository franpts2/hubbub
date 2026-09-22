import type { InputHTMLAttributes } from "react";

/**
 * The shared shell for every text input in the app.
 *
 * Only the chrome lives here — border, background, focus ring, placeholder
 * colour — because that is the part all three inputs agreed on while being
 * copy-pasted between them. Size, padding, weight and alignment stay at the
 * call site, since a four-character room code and an eighty-character answer
 * genuinely want to look different.
 */
const BASE =
  "w-full rounded-2xl border-2 border-ink-line bg-ink text-cream " +
  "placeholder:text-ink-line focus:border-cool focus:outline-none";

export function TextField({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${BASE} ${className}`} {...props} />;
}
