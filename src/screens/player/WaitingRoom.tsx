import { Eyebrow, Logo } from "../../components/ui";

export function WaitingRoom({ count }: { count: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <Logo className="text-5xl" />
      <p className="text-2xl font-black">You are in.</p>
      <Eyebrow size="md" weight="bold" className="animate-pulse-soft">
        Waiting for the host to start
      </Eyebrow>
      <Eyebrow weight="bold">
        {count} {count === 1 ? "player" : "players"} here
      </Eyebrow>
    </div>
  );
}
