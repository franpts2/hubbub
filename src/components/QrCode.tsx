import QRCode from "qrcode";
import { useEffect, useState } from "react";

/**
 * Typing a URL plus a room code on a phone is the single most annoying part of
 * joining a party game, and it is where people give up. The QR code turns
 * joining into one tap.
 */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size * 2, // Render at 2x so it stays crisp on high-DPI screens.
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#07061aff", light: "#ffffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        // Non-fatal: the room code is still shown, so people can type it.
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div
      className="flex items-center justify-center rounded-2xl bg-white p-3"
      style={{ width: size, height: size }}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={`QR code linking to ${value}`}
          className="h-full w-full"
        />
      ) : null}
    </div>
  );
}
