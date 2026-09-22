import { QrCode } from "../../components/QrCode";
import { Eyebrow } from "../../components/ui";
import { joinUrl, withoutScheme } from "../../lib/urls";

/**
 * The two ways in, side by side: scan the code, or read it out loud.
 *
 * Both are driven by the same derived URL, so the printed address and the QR
 * code cannot disagree.
 */
export function JoinCallout({ code }: { code: string }) {
  const url = joinUrl(code);

  return (
    <div className="flex flex-col items-center gap-5">
      <Eyebrow size="md" tracking="wider">
        Join at {withoutScheme(url)}
      </Eyebrow>

      <div
        className="text-[6rem] leading-none font-black tracking-[0.15em] text-zap sm:text-[9rem]"
        // Spelled out, so a screen reader does not read "4BC7" as a number.
        aria-label={`Room code ${code.split("").join(" ")}`}
      >
        {code}
      </div>

      <QrCode value={url} size={200} />

      <Eyebrow tracking="widest" weight="normal">
        or scan to join instantly
      </Eyebrow>
    </div>
  );
}
