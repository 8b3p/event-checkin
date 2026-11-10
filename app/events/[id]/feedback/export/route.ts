import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { ListFeedbackForEventUseCase } from "@/features/feedback/domain/use-cases/ListFeedbackForEventUseCase";
import { makeFeedbackRepository } from "@/features/feedback/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";

const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

function csvField(value: string): string {
  const safe = DANGEROUS_PREFIX.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const items = await new ListFeedbackForEventUseCase(makeFeedbackRepository()).execute(eventId);

  const header = ["الاسم", "التقييم", "التعليق", "التاريخ"];
  const rows = items.map((item) => [
    item.guestName,
    String(item.rating),
    item.comment ?? "",
    item.updatedAt.toISOString().slice(0, 10),
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvField).join(",")).join("\n");
  // A UTF-8 BOM so Excel (still the most common opener) detects Arabic text as UTF-8 instead of guessing a local codepage.
  const bom = "﻿";

  // HTTP header values must be Latin-1/ByteString — the Arabic filename can't go in
  // `filename=` directly (Response throws "Cannot convert argument to a ByteString" at
  // request time). RFC 5987's `filename*=UTF-8''<percent-encoded>` carries the real
  // Arabic name; the ASCII `filename=` fallback covers any client that ignores `filename*`.
  const filename = `آراء-${event.id}.csv`;

  return new Response(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="feedback-${event.id}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
