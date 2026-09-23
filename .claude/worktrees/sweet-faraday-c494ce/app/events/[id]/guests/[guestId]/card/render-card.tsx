import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import type { CSSProperties } from "react";
import type { Event } from "@/features/events/domain/Event";
import type { Guest } from "@/features/guests/domain/Guest";
import { inviteUrl } from "@/shared/lib/codes";

const CARD_WIDTH = 1000;
const CARD_HEIGHT = 1400;

/**
 * Satori (next/og's renderer) doesn't implement the Unicode Bidirectional
 * Algorithm — a text node's words lay out in source order left-to-right
 * regardless of `direction`/`unicode-bidi` (verified empirically: see
 * task-5-report.md). Reversing word order before handing the string to
 * Satori produces the correct RTL visual result, since each word's own
 * (already correctly-shaped) internal character order is untouched — only
 * word order changes. Skipped for text with no Arabic characters, so a
 * Latin guest name like "John Smith" keeps its natural reading order.
 */
function toVisualOrder(text: string): string {
  if (!/[؀-ۿ]/.test(text)) return text;
  return text.trim().split(/\s+/).reverse().join(" ");
}

/**
 * `toVisualOrder` reverses word order in a single string, which is only
 * correct when the whole string fits on one line — once Satori wraps it,
 * the line-break happens *after* reversal, so the logically-first words end
 * up on the last line instead of the first. For the two genuinely unbounded
 * free-text fields (event/guest names — no length cap or truncation exists
 * anywhere in this codebase, and long Arabic names are common), we instead
 * render each word as its own flex child inside a `row-reverse` + `wrap`
 * container. That lets Satori's own Yoga layout do the line-breaking: words
 * are placed starting from the right, and each wrapped line *also* starts
 * from the right, producing correct RTL order on every line — not just the
 * first. Short, fixed-content strings (seatsLabel, the instruction lines)
 * stay on `toVisualOrder` — they're plan-authored sentences at a width
 * already confirmed not to wrap, so the single-line-only limitation above
 * doesn't apply to them.
 *
 * Empirically verified (see task-5-report.md) that flexbox `gap` does
 * produce visible spacing between the word boxes in this Satori version —
 * confirmed by temporarily giving each word box a distinct background
 * color and rendering a real card, rather than assuming it works.
 */
function BidiText({ text, style }: { text: string; style: CSSProperties }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const isArabic = /[؀-ۿ]/.test(text);

  if (!isArabic) {
    return <div style={style}>{text}</div>;
  }

  return (
    <div style={{ ...style, flexDirection: "row-reverse", flexWrap: "wrap", gap: "0.35em" }}>
      {words.map((word, index) => (
        <div key={index} style={{ display: "flex" }}>
          {word}
        </div>
      ))}
    </div>
  );
}

/**
 * Fetches Cairo from Google Fonts.
 *
 * Satori (the renderer behind `next/og`'s ImageResponse) can only parse
 * uncompressed OpenType data (TTF/OTF) — not the brotli-compressed WOFF2
 * files Google's CSS2 endpoint serves once it recognizes the request as
 * coming from a modern, woff2-capable browser (real Chrome/Firefox/Safari
 * user-agent strings). Passing such a UA reliably reproduces
 * `Error: Unsupported OpenType signature wOF2` at render time.
 *
 * Sending a bare, version-less "Mozilla/5.0" User-Agent instead makes Google
 * fall back to its legacy response: a single, unsplit .ttf per weight that
 * already contains every script Cairo supports — Latin *and* Arabic — in one
 * file (the per-script unicode-range splitting only ever accompanies the
 * woff2 response, so there is nothing to split out here). That means no
 * subset-specific parsing is needed: we grab the one @font-face block's URL
 * and fetch the font bytes directly.
 *
 * Two guards protect against a silent bad render if Google ever changes
 * what the legacy UA gets served: we assert the CSS response actually has
 * the single-@font-face shape this function assumes (not zero, not several
 * — either would mean our "grab the first URL" logic is no longer sound),
 * and we check the fetched file's magic bytes are a real sfnt (TTF/OTF)
 * signature before handing it to Satori. Without these, a format change on
 * Google's end could make this function fetch a Latin-only or otherwise
 * wrong font, and the route would return 200 OK with every Arabic glyph
 * rendered as tofu — worse than the loud WOFF2 failure this function
 * already guards against, because nothing would error.
 */
async function fetchCairoFont(weight: 400 | 700): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Cairo:wght@${weight}&display=swap`;
  const cssResponse = await fetch(cssUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!cssResponse.ok) {
    throw new Error(`Failed to fetch Cairo CSS (weight ${weight}): HTTP ${cssResponse.status}`);
  }
  const css = await cssResponse.text();

  const fontFaceBlocks = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  if (fontFaceBlocks.length !== 1) {
    throw new Error(
      `Expected exactly one @font-face block in Cairo's CSS (legacy-UA response), got ` +
        `${fontFaceBlocks.length}. Google may have changed what this User-Agent is served — ` +
        `the single-block assumption this function relies on no longer holds.`,
    );
  }

  const fontUrlMatch = fontFaceBlocks[0].match(/src: url\(([^)]+)\)/);
  if (!fontUrlMatch) throw new Error("Could not find a font file URL in Cairo's CSS.");

  const fontResponse = await fetch(fontUrlMatch[1]);
  if (!fontResponse.ok) {
    throw new Error(`Failed to fetch Cairo font file (weight ${weight}): HTTP ${fontResponse.status}`);
  }
  const buffer = await fontResponse.arrayBuffer();

  const magic = new Uint8Array(buffer.slice(0, 4));
  const isTrueType = magic[0] === 0x00 && magic[1] === 0x01 && magic[2] === 0x00 && magic[3] === 0x00;
  const magicAscii = String.fromCharCode(...magic);
  const isOpenType = magicAscii === "true" || magicAscii === "OTTO";
  if (!isTrueType && !isOpenType) {
    const hex = Array.from(magic)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    const note = magicAscii === "wOF2" ? " (looks like WOFF2 — Satori cannot parse this)" : "";
    throw new Error(
      `Cairo font file (weight ${weight}) is not a recognizable TTF/OTF: first 4 bytes are ` +
        `${hex} ("${magicAscii}")${note}. Refusing to hand this to Satori.`,
    );
  }

  return buffer;
}

/**
 * Per-process cache of in-flight/resolved font fetches, keyed by weight.
 *
 * `renderGuestCardImage` is called once per guest — a single-card download
 * only ever needs one, but the bulk ZIP route (Task 6) calls it once per
 * guest in a loop, which without this cache would mean 4 network round-trips
 * to Google Fonts (CSS + file, for each of the two weights) per guest instead
 * of per server process. Caching the *promise* rather than the resolved
 * buffer means concurrent calls that land before the first fetch resolves
 * still share the one in-flight request rather than each starting their own.
 */
const fontCache = new Map<400 | 700, Promise<ArrayBuffer>>();

async function loadCairoFont(weight: 400 | 700): Promise<ArrayBuffer> {
  const cached = fontCache.get(weight);
  if (cached) return cached;

  const promise = fetchCairoFont(weight);
  fontCache.set(weight, promise);
  return promise;
}

export async function renderGuestCardImage(event: Event, guest: Guest): Promise<ImageResponse> {
  const [qr, regular, bold] = await Promise.all([
    QRCode.toDataURL(inviteUrl(guest.code), { errorCorrectionLevel: "M", margin: 1, width: 720 }),
    loadCairoFont(400),
    loadCairoFont(700),
  ]);

  const seatsLabel = guest.seats === 1 ? "تشمل شخصاً واحداً" : `تشمل ${guest.seats} أشخاص`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fbf8f4",
          fontFamily: "Cairo",
          padding: "64px",
          textAlign: "center",
        }}
      >
        <BidiText text={event.name} style={{ display: "flex", fontSize: 28, color: "#6f6357" }} />

        <BidiText
          text={guest.name}
          style={{ display: "flex", fontSize: 56, fontWeight: 700, color: "#1c1917", marginTop: 24 }}
        />

        <div style={{ display: "flex", fontSize: 24, color: "#6f6357", marginTop: 12 }}>
          {toVisualOrder(seatsLabel)}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr}
          width={480}
          height={480}
          style={{ marginTop: 40, borderRadius: 24, border: "1px solid #e8e1d6", backgroundColor: "#ffffff" }}
        />

        <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: "#6f6357", marginTop: 24 }}>
          {guest.code}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, gap: 8 }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#79490f" }}>
            {toVisualOrder("أظهر هذه الصورة عند الباب")}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#6f6357" }}>
            {toVisualOrder("لقطة شاشة تكفي، لا حاجة لتطبيق")}
          </div>
        </div>
      </div>
    ),
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fonts: [
        { name: "Cairo", data: regular, weight: 400, style: "normal" },
        { name: "Cairo", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
