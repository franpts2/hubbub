import { Eyebrow, stagger } from "../../../src/components/ui";
import type { Standing } from "../shared";

/** Running totals. Shown small beside a round, large at the end. */
export function Scoreboard({
  standings,
  size = "sm",
}: {
  standings: Standing[];
  size?: "sm" | "lg";
}) {
  const large = size === "lg";

  return (
    <ol className={large ? "flex flex-col gap-3" : "flex flex-col gap-1.5"}>
      {standings.map((standing, index) => (
        <li
          key={standing.playerId}
          // Top down, so the eye is led from first place rather than
          // arriving to find the whole table already settled.
          style={stagger(index)}
          className={`animate-rise flex items-baseline justify-between gap-4 rounded-xl border-2 border-ink-line bg-ink-soft ${
            large ? "px-5 py-3" : "px-3 py-1.5"
          }`}
        >
          <span className="flex items-baseline gap-3">
            <Eyebrow as="span" size="xs" tone={index === 0 ? "punch" : undefined}>
              {index + 1}
            </Eyebrow>
            <span className={large ? "text-2xl font-black" : "text-sm font-bold"}>
              {standing.name}
            </span>
          </span>
          <span
            className={`tabular-nums ${large ? "text-2xl font-black" : "text-sm font-bold"}`}
          >
            {standing.score}
          </span>
        </li>
      ))}
    </ol>
  );
}
