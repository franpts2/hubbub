import type { ReactNode } from "react";

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border-2 border-punch/60 bg-punch/15 px-4 py-3 text-center text-sm font-bold text-cream"
    >
      {children}
    </p>
  );
}
