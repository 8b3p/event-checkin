import type { QRCodeToDataURLOptions } from "qrcode";

/**
 * Lives apart from `codes.ts` (which imports `node:crypto`) so the browser can
 * build invite URLs too — the owner's browser draws the downloadable cards.
 * `NEXT_PUBLIC_APP_URL` is inlined into client bundles at build time.
 */
export function inviteUrl(code: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not set in production — guest invitation links would point at localhost.",
    );
  }
  const base = (configured ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/i/${code}`;
}

/** The QR on the guest-facing card — shared so the page and the downloaded image can't drift. */
export const INVITE_CARD_QR_OPTIONS: QRCodeToDataURLOptions = { errorCorrectionLevel: "M", margin: 1, width: 900 };
