import { Eyebrow } from "../../components/ui";

/** Keeps the code reachable mid-round so latecomers can still join. */
export function RoomCodeChip({ code }: { code: string }) {
  return (
    <div className="text-right">
      <Eyebrow as="div" size="xxs" tracking="wider">
        Room
      </Eyebrow>
      <div className="text-2xl font-black tracking-[0.2em] text-cool">{code}</div>
    </div>
  );
}
