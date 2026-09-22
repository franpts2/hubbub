import type { ReactNode } from "react";

export function Screen({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={`relative z-10 flex min-h-dvh flex-col px-5 py-6 ${className}`}
      // Keep content clear of notches and the iOS home indicator.
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      {children}
    </main>
  );
}
