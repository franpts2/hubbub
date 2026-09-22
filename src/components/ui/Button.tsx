import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "ghost";

const BASE =
  "rounded-2xl px-6 py-4 text-lg font-black uppercase tracking-wide transition " +
  "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 " +
  "disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-cool";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-zap text-ink shadow-[0_6px_0_#93b100] active:shadow-[0_2px_0_#93b100] active:translate-y-1",
  ghost: "border-2 border-ink-line bg-ink-soft text-cream hover:border-muted",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}
