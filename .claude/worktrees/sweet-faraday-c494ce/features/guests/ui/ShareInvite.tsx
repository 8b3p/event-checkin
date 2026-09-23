"use client";

import { useState } from "react";
import { Button } from "@/shared/component/ui/button";
import { Card, CardHeader, CardTitle } from "@/shared/component/ui/card";
import type { Event } from "@/features/events/domain/Event";
import type { Guest } from "../domain/Guest";

function buildMessage(guest: Guest, event: Event, url: string): string {
  const when = event.eventDate
    ? new Date(`${event.eventDate}T00:00:00`).toLocaleDateString("ar-u-nu-latn", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const occasion = [`أنت مدعو إلى ${event.name}`, when ? ` يوم ${when}` : "", event.venue ? ` في ${event.venue}` : ""].join(
    "",
  );

  const seatsText = guest.seats === 1 ? "شخصاً واحداً" : `${guest.seats} أشخاص`;

  return [
    `${guest.name}،`,
    "",
    `${occasion}.`,
    "",
    "هذا الرابط هو دعوتك. افتحه وأظهر رمز QR عند الباب:",
    url,
    "",
    `يشمل ${seatsText}. بانتظاركم.`,
  ].join("\n");
}

export default function ShareInvite({
  guest,
  event,
  url,
  qr,
}: {
  guest: Guest;
  event: Event;
  url: string;
  qr: string;
}) {
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const message = buildMessage(guest, event, url);

  async function copy(what: "link" | "message") {
    try {
      await navigator.clipboard.writeText(what === "link" ? url : message);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("انسخ هذا:", what === "link" ? url : message);
    }
  }

  const whatsapp = `https://wa.me/${(guest.phone ?? "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(message)}`;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>دعوتهم</CardTitle>
      </CardHeader>

      <div className="flex flex-col items-center border-y border-border bg-muted px-5 py-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr}
          alt={`رمز QR لـ ${guest.name}`}
          className="h-56 w-56 rounded-xl border border-border bg-white p-3"
        />
        <p dir="ltr" className="mt-4 font-mono text-sm tracking-[0.2em] text-muted-foreground">
          {guest.code}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">يمكن قراءته عند الباب إذا تعذّر مسح الشاشة.</p>
      </div>

      <div className="space-y-3 p-5">
        <p dir="ltr" className="rounded-lg bg-muted px-3 py-2 text-start font-mono text-xs break-all text-muted-foreground">
          {url}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => copy("message")}>{copied === "message" ? "تم النسخ" : "نسخ نص الدعوة"}</Button>
          <Button variant="outline" onClick={() => copy("link")}>
            {copied === "link" ? "تم النسخ" : "نسخ الرابط"}
          </Button>
          <a
            href={qr}
            download={`دعوة-${guest.code}.png`}
            className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            تحميل QR
          </a>
          <a
            href={`/events/${event.id}/guests/${guest.id}/card`}
            download={`دعوة-${guest.code}.png`}
            className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            تحميل البطاقة
          </a>
          {guest.phone ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
            >
              إرسال عبر واتساب
            </a>
          ) : null}
        </div>

        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground">
            معاينة الرسالة ‹
          </summary>
          <pre dir="rtl" className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            {message}
          </pre>
        </details>
      </div>
    </Card>
  );
}
