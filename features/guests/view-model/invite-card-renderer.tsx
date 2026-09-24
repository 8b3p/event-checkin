"use client";

import { domToBlob } from "modern-screenshot";
import QRCode from "qrcode";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Event } from "@/features/events/domain/Event";
import { INVITE_CARD_QR_OPTIONS, inviteUrl } from "@/shared/lib/invite-url";
import type { Guest } from "../domain/Guest";
import InviteCard from "../ui/InviteCard";

// The card's width on /i/[code]: the max-w-md (448px) <main> minus its px-5 padding.
const CARD_WIDTH = 408;
const SCALE = 2;

/**
 * Draws guest cards in the owner's browser: the real `InviteCard` is mounted
 * off-screen and rasterised via SVG foreignObject, so the browser's own text
 * engine shapes the Arabic — the same engine that renders `/i/[code]` for guests.
 * One renderer reuses one off-screen root; call `render` serially and
 * `dispose` when done.
 */
export function createInviteCardRenderer(event: Event) {
  // Off-screen but still laid out — display:none would skip font loading and give
  // the card no size. Appended to <body> so it inherits the next/font Cairo
  // variable on <html> and the global CSS.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.dir = "rtl";
  host.style.cssText = `position:fixed;top:0;left:-10000px;width:${CARD_WIDTH}px;pointer-events:none`;
  document.body.appendChild(host);

  // The card has rounded corners, so it's captured on a frame painted with the page
  // colour — as a screenshot of /i/[code] would be — instead of transparent corners,
  // which some chat apps show as black. (modern-screenshot's own `backgroundColor`
  // option can't do this: it repaints the captured element, i.e. the card itself.)
  const frame = document.createElement("div");
  frame.style.backgroundColor = getComputedStyle(document.body).backgroundColor;
  host.appendChild(frame);
  const root = createRoot(frame);

  return {
    async render(guest: Guest): Promise<Blob> {
      const qr = await QRCode.toDataURL(inviteUrl(guest.code), INVITE_CARD_QR_OPTIONS);
      flushSync(() => root.render(<InviteCard event={event} guest={guest} qr={qr} />));

      // Reading layout queues the font loads this card's text needs, so `fonts.ready`
      // actually waits for them instead of resolving before they've started.
      void frame.offsetHeight;
      await document.fonts.ready;
      await frame.querySelector("img")?.decode();

      return domToBlob(frame, { scale: SCALE, type: "image/png" });
    },
    dispose() {
      root.unmount();
      host.remove();
    },
  };
}
