import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "ghost";

/**
 * The chunky arcade button the whole app is built on.
 *
 * The hard drop shadow is load-bearing rather than decorative: it gives the
 * button a physical height, so hovering can lift it and pressing can push it
 * flat against the page. That is the entire reason the press reads as a
 * press instead of as a colour change.
 *
 * Transitions name their properties. `transition` on its own also animates
 * colour, and a button whose label fades between states looks unsure of
 * itself when what it should look is immediate.
 */
const BASE =
  "rounded-2xl px-6 py-4 text-lg font-black uppercase tracking-wide " +
  "transition-[transform,box-shadow,border-color,background-color] duration-150 ease-out " +
  "active:scale-[0.97] disabled:cursor-not-allowed " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cool";

/**
 * Disabled is drawn, not dimmed.
 *
 * `opacity-40` over this palette turned lime into olive and hot pink into
 * brown — colours that look like a rendering fault rather than like a button
 * that is not ready yet. Dropping to the inert surface says the same thing
 * and says it on purpose: the shadow goes, so the button is flat on the page
 * and visibly cannot be pushed any further.
 */
const DISABLED_FLAT =
  "disabled:translate-y-0 disabled:bg-ink-soft disabled:text-muted " +
  "disabled:shadow-none disabled:active:scale-100";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-zap text-ink shadow-[0_6px_0_#93b100] " +
    "hover:-translate-y-0.5 hover:shadow-[0_8px_0_#93b100] " +
    "active:translate-y-1 active:shadow-[0_2px_0_#93b100] " +
    `${DISABLED_FLAT} disabled:hover:translate-y-0 disabled:hover:shadow-none`,
  ghost:
    "border-2 border-ink-line bg-ink-soft text-cream hover:border-muted " +
    "disabled:border-ink-line disabled:text-muted disabled:active:scale-100",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}
