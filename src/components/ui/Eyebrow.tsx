import type { ReactNode } from "react";

/**
 * The small-caps label that appears above or beside almost everything in this
 * app ("Room", "Players (3)", "or scan to join instantly").
 *
 * Before this existed the same four utilities were pasted at roughly fifteen
 * call sites, each drifting a little. The variants below are the values
 * actually in use, mapped explicitly so no two of them can collide: composing
 * Tailwind class strings by concatenation is unsafe when both strings set the
 * same property, because the winner is decided by stylesheet order rather than
 * by the order they appear in `className`.
 */

type EyebrowTag = "p" | "span" | "div" | "h2" | "figcaption";

export type EyebrowSize = "xxs" | "xs" | "sm" | "md" | "lg" | "xl";
export type EyebrowTone = "muted" | "punch" | "cool";
export type EyebrowTracking = "wide" | "wider" | "widest";
export type EyebrowWeight = "normal" | "bold" | "black";

const SIZE: Record<EyebrowSize, string> = {
  xxs: "text-[0.6rem]",
  xs: "text-[0.65rem]",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-xl",
  xl: "text-2xl",
};

const TONE: Record<EyebrowTone, string> = {
  muted: "text-muted",
  punch: "text-punch",
  cool: "text-cool",
};

const TRACKING: Record<EyebrowTracking, string> = {
  wide: "tracking-[0.2em]",
  wider: "tracking-[0.3em]",
  widest: "tracking-widest",
};

const WEIGHT: Record<EyebrowWeight, string> = {
  normal: "font-normal",
  bold: "font-bold",
  black: "font-black",
};

export interface EyebrowStyle {
  size?: EyebrowSize;
  tone?: EyebrowTone;
  tracking?: EyebrowTracking;
  weight?: EyebrowWeight;
}

/**
 * The class string on its own, for elements that need attributes `Eyebrow`
 * does not accept (a `<label htmlFor>`, for instance).
 *
 * `extra` is for utilities the variants do not set — layout, decoration — so
 * it never conflicts with what this builds.
 */
export function eyebrowClass(
  { size = "sm", tone = "muted", tracking = "wide", weight = "black" }: EyebrowStyle = {},
  extra = "",
): string {
  return `uppercase ${SIZE[size]} ${WEIGHT[weight]} ${TRACKING[tracking]} ${TONE[tone]} ${extra}`.trimEnd();
}

export function Eyebrow({
  as: Tag = "p",
  className = "",
  children,
  ...style
}: EyebrowStyle & {
  as?: EyebrowTag;
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={eyebrowClass(style, className)}>{children}</Tag>;
}
