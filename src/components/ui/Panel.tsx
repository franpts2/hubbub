import type { CSSProperties, ReactNode } from "react";

/**
 * The frosted card the home screen and the name form are built from.
 *
 * It rises in. Every panel in this app is the first thing on a freshly
 * mounted screen rather than something that appears mid-session, so there is
 * no case where this fires often enough to get in the way — and a landing
 * screen that assembles itself is the app's only chance to look alive before
 * anyone has pressed anything.
 *
 * `style` exists so a caller can offset that entrance with `stagger()`.
 */
export function Panel({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`animate-rise rounded-3xl border-2 border-ink-line bg-ink-soft/70 p-6 backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}
