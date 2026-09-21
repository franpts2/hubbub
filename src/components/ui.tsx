import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { ConnectionStatus } from "../lib/useRoomSocket";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const base =
    "rounded-2xl px-6 py-4 text-lg font-black uppercase tracking-wide transition " +
    "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 " +
    "disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 " +
    "focus-visible:outline-cool";
  const styles =
    variant === "primary"
      ? "bg-zap text-ink shadow-[0_6px_0_#93b100] active:shadow-[0_2px_0_#93b100] active:translate-y-1"
      : "border-2 border-ink-line bg-ink-soft text-cream hover:border-muted";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

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

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-black tracking-tight ${className}`}>
      hub<span className="text-punch">bub</span>
    </span>
  );
}

/**
 * Always-visible connection state. On a phone at a party, silently dropping
 * offline is the worst possible failure mode — people just stare at a frozen
 * screen. This makes reconnection visible so they wait instead of refreshing.
 */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === "open") return null;

  const label =
    status === "connecting"
      ? "Connecting…"
      : status === "reconnecting"
        ? "Reconnecting…"
        : "Disconnected";

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-punch px-4 py-2 text-center text-sm font-black uppercase tracking-widest text-cream"
    >
      <span className={status === "closed" ? "" : "animate-pulse-soft"}>{label}</span>
    </div>
  );
}

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
