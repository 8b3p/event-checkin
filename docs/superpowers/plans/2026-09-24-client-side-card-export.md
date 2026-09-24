# Client-Side Guest Card Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "تحميل البطاقة" and "تحميل كل البطاقات" fast and reliable by drawing card PNGs in the owner's browser instead of in a headless Chromium on Vercel, then remove the server-side screenshot pipeline entirely.

**Why:** Today every card is: boot `@sparticuz/chromium` in a Vercel function (seconds cold) → `page.goto` the *public* `/i/[code]` URL (a second function invocation, DB queries, QR generation, full JS load) → wait up to Playwright's 30s default for the card selector → screenshot. The bulk route (`app/events/[id]/guests/cards/route.ts`) also renders **every** card before sending the first byte (`generateInternalStream` only starts after `Promise.all`), so the owner sees "0 ك.ب" for the entire run until the function times out or runs out of memory. In practice the bulk download spins for about a minute and then fails.

**Architecture:** The reason for a server browser was correct Arabic shaping and bidi, which Satori couldn't do. The owner's browser already does both. We extract the invite card markup into one presentational `InviteCard` component used by **both** the public `/i/[code]` page and the exporter, so the downloaded image still is the guest's page. The exporter mounts `InviteCard` off-screen with `createRoot`, waits for fonts + QR image, rasterises it with `modern-screenshot` (SVG `foreignObject` → canvas, so the browser's own text engine lays it out), and zips the results with the already-installed `jszip`. No server work at all beyond the existing page load.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, `modern-screenshot` (new), `jszip` + `qrcode` (existing), Vitest.

**Spike result (2026-09-24, headless Chromium, 40 cards, 2× scale, QR generation included):**

| Library | First card | Avg / card | Avg PNG |
|---|---|---|---|
| `modern-screenshot` 4.7.0 | 278 ms | 176 ms | 102 KB |
| `html-to-image` 1.11.13 | 156 ms | 137 ms | 100 KB |

Both produced output identical to a native Chromium element screenshot of the same card: correct Arabic joining, correct RTL line-wrapping of a two-line event name, Cairo loaded from self-hosted woff2. We pick `modern-screenshot` because it is actively maintained (last release Apr 2026 vs Apr 2025) and has a context API for batch reuse. `html-to-image` is a drop-in fallback (`toBlob(el, { pixelRatio: 2 })`) if needed. **Not yet verified: WebKit/Safari** (no WebKit in the spike environment). See Task 7.

Projected bulk time: ~200 guests × ~0.2 s ≈ 40 s, with a live "n / total" counter the whole way, versus a failure today.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing code (see `AGENTS.md`). This Next version differs from training data.
- Follow `docs/architecture-docs/`: `ui/` is presentational only, `view-model/` hooks hold client orchestration, pure logic lives in `shared/lib/` with unit tests.
- Only `shared/lib/*.ts` gets unit tests (house convention: no `.test.tsx`, vitest runs in `node` env). UI and view-model changes are verified via `npm run typecheck`, `npm run lint`, `npm run build`, and manual browser testing.
- The downloaded card must stay pixel-equivalent to the guest-facing `/i/[code]` card: same component, same QR options, same width. Don't restyle anything.
- Keep the existing user-facing behaviours: bulk ZIP name `بطاقات-{eventId}.zip`, the `ملاحظات.txt` success/skipped note, per-card failure never aborts the whole ZIP.
- Each task below is one commit.

---

### Task 1: Make `inviteUrl` and the QR options client-safe

`shared/lib/codes.ts` imports `node:crypto`, so the browser bundle can't import `inviteUrl` from it. The card QR options are also duplicated as literals.

**Files:**
- Create: `shared/lib/invite-url.ts`
- Modify: `shared/lib/codes.ts` (remove `inviteUrl`, re-export it from `./invite-url` so existing imports keep working)
- Modify: `shared/lib/codes.test.ts` (move the `inviteUrl` describe block to `invite-url.test.ts`)
- Create: `shared/lib/invite-url.test.ts`
- Modify: `app/i/[code]/page.tsx:39`: use `INVITE_CARD_QR_OPTIONS`

**Interfaces:**
- Produces `inviteUrl(code: string): string`: body moved verbatim. `NEXT_PUBLIC_APP_URL` is inlined into client bundles at build time, so it behaves the same in the browser.
- Produces `INVITE_CARD_QR_OPTIONS = { errorCorrectionLevel: "M", margin: 1, width: 900 } as const`: the options `/i/[code]` uses today. The admin detail page's `width: 720` preview QR is intentionally left alone; it's not part of the card.

- [ ] Step 1: Move the test block, run `npx vitest run shared/lib/invite-url.test.ts`, expect FAIL (module missing)
- [ ] Step 2: Create `invite-url.ts`, re-export from `codes.ts`, switch `/i/[code]` to the constant
- [ ] Step 3: `npm test` + `npm run typecheck`: PASS
- [ ] Step 4: Commit: `Move inviteUrl to a client-safe module; share the card QR options`

---

### Task 2: Safe ZIP/PNG file names

Bulk entries are named `${guest.name}-${guest.code}.png`. A name containing `/` (e.g. "أحمد / سارة") creates a folder inside the ZIP, and `\ : * ? " < > |` break extraction on Windows.

**Files:**
- Create: `shared/lib/card-file-name.ts`, `shared/lib/card-file-name.test.ts`

**Interfaces:**
- Produces `cardFileName(guest: { name: string; code: string }): string`. It replaces `[\\/:*?"<>|\u0000-\u001f]` runs with `-`, collapses whitespace, trims, and falls back to `دعوة` if the name is empty after cleaning. Returns `${clean}-${code}.png`.

- [ ] Step 1: Failing tests: plain Arabic name unchanged; `/` and `\` replaced; Windows-reserved chars replaced; whitespace-only name → `دعوة-CODE.png`
- [ ] Step 2: Implement, `npx vitest run shared/lib/card-file-name.test.ts` PASS
- [ ] Step 3: Commit: `Add cardFileName: filesystem-safe card image names`

---

### Task 3: Extract `InviteCard` and use it on `/i/[code]`

**Files:**
- Create: `features/guests/ui/InviteCard.tsx`
- Modify: `app/i/[code]/page.tsx` renders `<InviteCard event guest qr />` inside the existing `<main>`

**Interfaces:**
- `InviteCard({ event, guest, qr }: { event: Event; guest: Guest; qr: string })`: the `<article data-testid="invite-card">…</article>` block from `app/i/[code]/page.tsx` moved **verbatim**, including the `when` date formatting. No `"use client"` directive and no server-only imports (only `pluralizeAr`), so it renders on the server for guests and in the browser for export.

- [ ] Step 1: Move the markup. The `<main>` wrapper and the "احتفظ بهذا الرابط" footer stay in the page.
- [ ] Step 2: `npm run typecheck && npm run lint`
- [ ] Step 3: Manual: open `/i/<code>` before and after. The page must look identical.
- [ ] Step 4: Commit: `Extract InviteCard so the guest page and card export share one component`

---

### Task 4: Browser card renderer

**Files:**
- Modify: `package.json`: add `modern-screenshot`
- Create: `features/guests/view-model/invite-card-renderer.tsx`

**Interfaces:**
- Produces `createInviteCardRenderer(event: Event): { render(guest: Guest): Promise<Blob>; dispose(): void }`.

Shape of the implementation (final code may differ in detail):

```tsx
"use client";

import QRCode from "qrcode";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { domToBlob } from "modern-screenshot";
import type { Event } from "@/features/events/domain/Event";
import { INVITE_CARD_QR_OPTIONS, inviteUrl } from "@/shared/lib/invite-url";
import type { Guest } from "../domain/Guest";
import InviteCard from "../ui/InviteCard";

// The /i/[code] card is 408 CSS px wide: max-w-md (448px) <main> minus px-5 on each side.
const CARD_WIDTH = 408;
const SCALE = 2;

export function createInviteCardRenderer(event: Event) {
  // Off-screen but laid out. display:none or visibility:hidden would skip font loading
  // and give the card a zero-size box. Appended to <body> so it inherits the html
  // element's next/font Cairo variable class and the global CSS.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${CARD_WIDTH}px;pointer-events:none`;
  host.dir = "rtl";
  document.body.appendChild(host);
  const root = createRoot(host);

  return {
    async render(guest: Guest): Promise<Blob> {
      const qr = await QRCode.toDataURL(inviteUrl(guest.code), INVITE_CARD_QR_OPTIONS);
      flushSync(() => root.render(<InviteCard event={event} guest={guest} qr={qr} />));

      const card = host.querySelector<HTMLElement>('[data-testid="invite-card"]');
      if (!card) throw new Error("InviteCard did not mount");
      void card.offsetHeight; // force layout so the font loads this card needs are queued
      await document.fonts.ready;
      await card.querySelector("img")?.decode();

      const blob = await domToBlob(card, { scale: SCALE, type: "image/png" });
      if (!blob) throw new Error("Card rasterisation returned no image");
      return blob;
    },
    dispose() {
      root.unmount();
      host.remove();
    },
  };
}
```

Notes for the implementer:
- `modern-screenshot` embeds the page's `@font-face` rules by fetching the same-origin `/_next/static/media/*.woff2` files. Nothing extra is needed for Cairo, but verify the PNG isn't using a fallback font (Task 7).
- If bulk export profiles slow, `modern-screenshot`'s `createContext`/`destroyContext` lets one context (and its font embedding) be reused across cards. Only adopt it if measured to matter.

- [ ] Step 1: `npm install modern-screenshot`
- [ ] Step 2: Implement; `npm run typecheck && npm run lint`
- [ ] Step 3: Commit: `Add in-browser InviteCard renderer`

---

### Task 5: Single-card download ("تحميل البطاقة")

**Files:**
- Create: `features/guests/view-model/useDownloadGuestCardViewModel.ts`
- Create: `shared/lib/save-blob.ts` (tiny `saveBlob(blob, filename)`: object URL → `<a download>` click → revoke. It's the snippet already in `useDownloadGuestCardsViewModel`, now shared by both hooks. Browser-only, so no unit test.)
- Modify: `features/guests/ui/ShareInvite.tsx:106-112`: the `<a href=/card download>` becomes a `<Button variant="outline">` wired to the hook, showing `جارٍ التحضير…` while busy and an `ErrorNote` on failure.

**Interfaces:**
- `useDownloadGuestCardViewModel(event: Event, guest: Guest) → { state: { status: "idle" } | { status: "rendering" } | { status: "error"; message: string }, download(): Promise<void> }`
- Uses the renderer for one card, then `dispose()` in `finally`, saving as `دعوة-${guest.code}.png` (unchanged name).

- [ ] Step 1: Implement hook + `saveBlob` + button
- [ ] Step 2: Manual: download from a guest page and compare against `/i/<code>`
- [ ] Step 3: Commit: `Download a single guest card from the browser`

---

### Task 6: Bulk download ("تحميل كل البطاقات")

**Files:**
- Modify: `features/guests/view-model/useDownloadGuestCardsViewModel.ts`: rewritten
- Modify: `features/guests/ui/GuestManager.tsx`: takes `event` instead of `eventId` (it only uses the id for the CSV link and download today), label shows progress
- Modify: `features/guests/ui/GuestListPage.tsx`: pass `event` through

**Interfaces:**
- `useDownloadGuestCardsViewModel(event: Event, guests: Guest[]) → { state, download }`, where `state` is `{ status: "idle" } | { status: "rendering"; done: number; total: number } | { status: "zipping" } | { status: "error"; message: string }`.
- Button label: `جارٍ التحضير… (${done} / ${total})`, then `جارٍ الضغط…`.

Behaviour:
- One renderer for the whole run, `dispose()` in `finally`.
- Cards render **serially** (the renderer reuses one off-screen root). Between cards, `await new Promise(requestAnimationFrame)` so React paints the counter and the tab stays responsive.
- A card that throws is logged, added to `skipped`, and its entry is omitted. We no longer write a 1×1 blank placeholder, because a file that looks valid but is blank is worse than one that's clearly missing. `ملاحظات.txt` keeps its exact current Arabic text and lists the skipped names.
- ZIP entries use `cardFileName(guest)`. JSZip `compression: "STORE"`: PNGs are already deflated, so recompressing wastes time for ~0% gain.
- `zip.generateAsync({ type: "blob" })` → `saveBlob(blob, \`بطاقات-${event.id}.zip\`)`.
- The 600-guest cap and its 413 message go away: there's no server time limit any more. Memory is ~100 KB/card (≈60 MB for 600), which is fine for a browser tab.

- [ ] Step 1: Implement hook + wiring
- [ ] Step 2: Manual: event with ~5 guests (incl. a `/` in a name) → unzip, check every card + notes file
- [ ] Step 3: Commit: `Build the bulk card ZIP in the browser with live progress`

---

### Task 7: Cross-browser verification (gate before Task 8)

The spike only covered Chromium. Before deleting the server path, verify on real devices:

- [ ] Desktop Chrome: single + bulk (~200 guests: note total time)
- [ ] **iPhone Safari**: single + bulk. Known WebKit risk: `foreignObject` images can come out blank on the first draw. Check that the QR and the Cairo text are present in the **first** card of a run, not just later ones. If blank, the usual fix is one throwaway warm-up render before the real one. Try that in the renderer before anything more drastic.
- [ ] Android Chrome: single + bulk
- [ ] Compare a downloaded PNG side-by-side with a phone screenshot of `/i/<code>`: fonts, line breaks, QR scannable by the door scanner (`/scan`)

If Safari can't be made reliable, the fallback is drawing the card with Canvas 2D (`ctx.direction = "rtl"` + `fillText` uses the browser's real Arabic shaping). The cost is a second hand-written layout, so it needs a separate decision. Don't do it without checking with the owner first.

---

### Task 8: Remove the server screenshot pipeline

**Files:**
- Delete: `app/events/[id]/guests/[guestId]/card/route.tsx`, `app/events/[id]/guests/[guestId]/card/render-card.tsx`, `app/events/[id]/guests/cards/route.ts`
- Modify: `package.json` / `package-lock.json`: `npm uninstall playwright-core @sparticuz/chromium`
- Modify: `next.config.mjs`: drop `outputFileTracingIncludes` (it only existed for those two packages)
- Modify: `README.md`: remove the `npx playwright-core install chromium` step and the "Guest card images are generated by screenshotting…" paragraph; replace with one sentence saying cards are drawn in the owner's browser from the same `InviteCard` component guests see.

- [ ] Step 1: `grep -rn "render-card\|/card\b\|guests/cards\|playwright\|sparticuz" app features shared README.md next.config.mjs` returns nothing relevant
- [ ] Step 2: `npm run typecheck && npm run lint && npm test && npm run build`
- [ ] Step 3: Commit: `Remove headless-Chromium card rendering`

---

## Open questions for the owner

1. **Do you download cards from a phone or a laptop?** If it's mostly iPhone, Task 7's Safari check is the one that decides whether this plan works as written.
2. **Image size:** we keep today's 2× scale (816 px wide, ~100 KB/card). Want larger for printing?
3. **Skipped cards:** OK to omit a failed card from the ZIP (listed in `ملاحظات.txt`) instead of today's blank placeholder file?
