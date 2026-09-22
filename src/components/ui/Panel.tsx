import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border-2 border-ink-line bg-ink-soft/70 p-6 backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}
