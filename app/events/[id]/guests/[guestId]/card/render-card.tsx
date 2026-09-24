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

/**
 * One Chromium instance per warm serverless container, not per render: launch
 * cost (~1-2s) would otherwise be paid on every single card download and on
 * every guest in a bulk export. `.catch` clears the cache on failure so a
 * launch error doesn't wedge every future render behind the same rejection.
 */
let browserPromise: Promise<Browser> | null = null;

async function launchBrowser(): Promise<Browser> {
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

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((error: unknown) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

export async function renderGuestCardImage(guest: Guest): Promise<Response> {
  const browser = await getBrowser();
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
