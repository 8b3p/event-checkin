import JSZip from "jszip";
import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { ListGuestsForEventUseCase } from "@/features/guests/domain/use-cases/ListGuestsForEventUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";
import { renderGuestCardImage } from "../[guestId]/card/render-card";

export const maxDuration = 300;

// Each card is now a real browser navigation + screenshot (~700ms warm) rather than a
// Satori render, and too many of those in flight at once would exhaust the function's
// memory — so cards render through a small worker pool (see CARD_RENDER_CONCURRENCY)
// instead of one at a time or all at once. Above this guest count, even that pool risks
// running past `maxDuration`, so we refuse up front with a message instead of letting the
// owner's browser hang.
const MAX_GUESTS_FOR_BULK_CARDS = 600;

// Pages share one browser process, so this is bounded by memory, not CPU: each open tab
// costs real RAM, and the function's memory ceiling (not the 300s time budget) is what
// caps how high this can safely go.
const CARD_RENDER_CONCURRENCY = 4;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const guests = await new ListGuestsForEventUseCase(makeGuestRepository()).execute(eventId);
  if (guests.length === 0) notFound();

  if (guests.length > MAX_GUESTS_FOR_BULK_CARDS) {
    return Response.json(
      {
        error:
          "قائمة الدعوات كبيرة جداً للتنزيل دفعة واحدة. تواصل مع الدعم لمساعدتك في تصدير البطاقات على دفعات.",
      },
      { status: 413 },
    );
  }

  // A render failure for one guest shouldn't corrupt-name a real image, and there's no
  // way to know up front whether a given guest will fail — so a failed render is swapped
  // for this valid (blank) placeholder rather than a 0-byte file.
  const BLANK_PLACEHOLDER_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  const zip = new JSZip();
  const skipped: string[] = [];

  // A fixed-size pool of workers pulls from the shared `nextIndex` cursor, so at most
  // CARD_RENDER_CONCURRENCY browser tabs are open at once regardless of guest count.
  // Write order into `zip`/`skipped` doesn't matter — a ZIP's entries are named
  // independently — so unordered completion across workers is fine.
  let nextIndex = 0;
  async function renderWorker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= guests.length) return;
      const guest = guests[i];
      const cardName = `${guest.name}-${guest.code}.png`;
      try {
        const image = await renderGuestCardImage(guest);
        zip.file(cardName, await image.arrayBuffer());
      } catch (error) {
        console.error(`Failed to render guest card for ${cardName}:`, error);
        skipped.push(guest.name);
        zip.file(cardName, BLANK_PLACEHOLDER_PNG);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CARD_RENDER_CONCURRENCY, guests.length) }, renderWorker));

  // Encoded to UTF-8 bytes ourselves rather than handed to JSZip as a plain string:
  // passing a string would fall back to JSZip's default `binary: true`, storing the raw
  // UTF-16 code units unencoded and corrupting the Arabic text.
  zip.file(
    "ملاحظات.txt",
    new TextEncoder().encode(
      skipped.length === 0
        ? "تم إنشاء جميع البطاقات بنجاح."
        : `تعذر إنشاء بطاقات الدعوات التالية، حاول تحميلها يدوياً من صفحة كل دعوة:\n${skipped.join("\n")}`,
    ),
  );

  // HTTP header values must be Latin-1/ByteString — the Arabic filename can't go in
  // `filename=` directly (Response throws "Cannot convert argument to a ByteString" at
  // request time). RFC 5987's `filename*=UTF-8''<percent-encoded>` carries the real
  // Arabic name; the ASCII `filename=` fallback covers any client that ignores `filename*`.
  const filename = `بطاقات-${event.id}.zip`;

  const helper = zip.generateInternalStream({ type: "uint8array", streamFiles: true });

  // Bridge JSZip's paused-by-default event stream to a Web ReadableStream: `pull` is
  // called whenever the consumer has room for more, which resumes the helper for exactly
  // one chunk (it re-pauses itself after each "data" event below) — so backpressure from
  // the HTTP response flows back into how fast JSZip renders and compresses the next card.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      helper
        .on("data", (chunk) => {
          controller.enqueue(chunk);
          helper.pause();
        })
        .on("end", () => controller.close())
        .on("error", (error) => controller.error(error));
    },
    pull() {
      helper.resume();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="cards-${event.id}.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
