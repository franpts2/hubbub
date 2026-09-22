import type { ReactNode } from "react";

/**
 * A complaint the player can act on.
 *
 * It rises into place instead of appearing. An error that blinks into
 * existence under a form is easy to miss entirely when you are looking at
 * the button you just pressed — the movement is what pulls the eye down.
 */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="animate-rise rounded-xl border-2 border-punch/60 bg-punch/15 px-4 py-3 text-center text-sm font-bold text-cream"
    >
      {children}
    </p>
  );
}
