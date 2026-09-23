import JSZip from "jszip";
import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { ListGuestsForEventUseCase } from "@/features/guests/domain/use-cases/ListGuestsForEventUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";
import { renderGuestCardImage } from "../[guestId]/card/render-card";

export const maxDuration = 300;

// Each card costs a real render (Satori + QR generation), ~300-400ms in the worst case.
// Above this count a single request risks running past `maxDuration` even with streaming,
// so we refuse up front with a message instead of letting the owner's browser hang.
const MAX_GUESTS_FOR_BULK_CARDS = 600;

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
  // way to know at `zip.file()` time whether a given guest will fail — so a failed
  // render is swapped for this valid (blank) placeholder rather than a 0-byte file.
  const BLANK_PLACEHOLDER_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  const zip = new JSZip();
  const skipped: string[] = [];

  for (const guest of guests) {
    const cardName = `${guest.name}-${guest.code}.png`;
    // The data source is a promise, not an already-awaited buffer: JSZip resolves each
    // one lazily, in order, as the streaming generator below reaches it — so cards are
    // rendered and compressed one at a time instead of all held in memory up front.
    zip.file(
      cardName,
      renderGuestCardImage(event, guest)
        .then((image) => image.arrayBuffer())
        .catch((error) => {
          console.error(`Failed to render guest card for ${cardName}:`, error);
          skipped.push(guest.name);
          return BLANK_PLACEHOLDER_PNG;
        }),
    );
  }

  // Added last, so — since a ZIP's entries stream out strictly in write order — every
  // guest promise above has already settled (and `skipped` fully populated) by the time
  // this one's executor runs, even though nothing here explicitly awaits them.
  //
  // Content is encoded to UTF-8 bytes ourselves rather than handed to JSZip as a plain
  // string: JSZip only auto-detects "text, so UTF-8-encode it" by inspecting the argument
  // passed to `zip.file()` synchronously, and that argument here is a Promise, not a
  // string — so its default (`binary: true`) would otherwise store the raw UTF-16 code
  // units unencoded, corrupting the Arabic text.
  zip.file(
    "ملاحظات.txt",
    Promise.resolve().then(() =>
      new TextEncoder().encode(
        skipped.length === 0
          ? "تم إنشاء جميع البطاقات بنجاح."
          : `تعذر إنشاء بطاقات الدعوات التالية، حاول تحميلها يدوياً من صفحة كل دعوة:\n${skipped.join("\n")}`,
      ),
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
