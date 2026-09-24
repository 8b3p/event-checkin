import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium, type Browser } from "playwright-core";
import type { Guest } from "@/features/guests/domain/Guest";
import { inviteUrl } from "@/shared/lib/codes";

const CARD_SELECTOR = '[data-testid="invite-card"]';

/**
 * Screenshotting the real `/i/[code]` page — rather than re-implementing its
 * look in `next/og`'s Satori renderer — is the only way the downloaded card
 * is guaranteed to match what a guest actually sees: Satori doesn't shape
 * text or implement the Unicode Bidirectional Algorithm, so Arabic spacing
 * there was always an approximation, never a match.
 */

export async function launchCardBrowser(): Promise<Browser> {
  // @sparticuz/chromium ships a Linux binary built for Lambda/Vercel — it
  // doesn't run on a local dev machine. Locally, playwright-core finds the
  // Chromium installed via `npx playwright-core install chromium` instead
  // (see README).
  if (process.env.VERCEL) {
    return playwrightChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  return playwrightChromium.launch({ headless: true });
}

/**
 * @sparticuz/chromium's `chromium.args` includes `--single-process` (required
 * on Lambda/Vercel to avoid a `prctl(PR_SET_NO_NEW_PRIVS)` sandbox error),
 * which runs the renderer in the same process as the browser itself. That
 * means one browser instance can safely drive only one page at a time —
 * opening a second concurrent page crashes the shared process, which is why
 * bulk export used to fail every card after the first. Callers that need
 * real concurrency (the bulk export route) must launch one browser per
 * concurrent worker via `launchCardBrowser` instead of sharing one.
 */
export async function renderGuestCardImageOnBrowser(browser: Browser, guest: Guest): Promise<Response> {
  const page = await browser.newPage({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 2 });

  try {
    await page.goto(inviteUrl(guest.code), { waitUntil: "load" });
    // Cairo is self-hosted via next/font, but the browser still loads it
    // asynchronously — screenshotting before it's ready would capture the
    // fallback font mid-swap.
    await page.evaluate(() => document.fonts.ready);

    const png = await page.locator(CARD_SELECTOR).screenshot({ type: "png" });
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
  } finally {
    await page.close();
  }
}

/**
 * One Chromium instance per warm serverless container, not per render: launch
 * cost (~1-2s) would otherwise be paid on every single card download.
 * `.catch` clears the cache on failure so a launch error doesn't wedge every
 * future render behind the same rejection.
 */
let browserPromise: Promise<Browser> | null = null;

async function getSharedBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchCardBrowser().catch((error: unknown) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

/**
 * Serializes access to the shared browser (see the single-process note
 * above): if Vercel ever routes two concurrent single-card downloads to the
 * same warm container, this queues the second behind the first instead of
 * opening two pages on one single-process browser.
 */
let sharedBrowserQueue: Promise<unknown> = Promise.resolve();

export function renderGuestCardImage(guest: Guest): Promise<Response> {
  const result = sharedBrowserQueue.then(async () => {
    const browser = await getSharedBrowser();
    return renderGuestCardImageOnBrowser(browser, guest);
  });
  sharedBrowserQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
