"use client";

import { useState } from "react";
import { Button, Card, CardHeader } from "@/components/ui";

type Props = {
  guest: { name: string; seats: number; phone: string | null; code: string };
  coupleNames: string;
  eventDate: string | null;
  venue: string | null;
  url: string;
  qr: string;
};

function buildMessage({ guest, coupleNames, eventDate, venue, url }: Props): string {
  const when = eventDate
    ? new Date(`${eventDate}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const occasion = [
    `You're invited to ${coupleNames}'s wedding`,
    when ? ` on ${when}` : "",
    venue ? ` at ${venue}` : "",
  ].join("");

  const admits = guest.seats === 1 ? "one person" : `${guest.seats} people`;

  return [
    `${guest.name},`,
    "",
    `${occasion}.`,
    "",
    "This link is your invitation. Open it and show the QR code at the door:",
    url,
    "",
    `It admits ${admits}. We can't wait to see you.`,
  ].join("\n");
}

export default function ShareInvite(props: Props) {
  const { guest, url, qr } = props;
  const [copied, setCopied] = useState<"link" | "message" | null>(null);

  const message = buildMessage(props);

  async function copy(what: "link" | "message") {
    try {
      await navigator.clipboard.writeText(what === "link" ? url : message);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this:", what === "link" ? url : message);
    }
  }

  const whatsapp = `https://wa.me/${(guest.phone ?? "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(message)}`;

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Their invitation" hint="Send this to them however you like." />

      <div className="flex flex-col items-center border-b border-line bg-raised px-5 py-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr}
          alt={`QR code for ${guest.name}`}
          className="h-56 w-56 rounded-xl border border-line bg-white p-3"
        />
        <p className="mt-4 font-mono text-sm tracking-[0.2em] text-muted">{guest.code}</p>
        <p className="mt-1 text-xs text-muted">
          Readable at the door if their screen won't scan.
        </p>
      </div>

      <div className="space-y-3 p-5">
        <p className="rounded-lg bg-raised px-3 py-2 font-mono text-xs break-all text-muted">{url}</p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => copy("message")} tone="primary">
            {copied === "message" ? "Copied" : "Copy invitation text"}
          </Button>
          <Button onClick={() => copy("link")}>{copied === "link" ? "Copied" : "Copy link"}</Button>
          <a
            href={qr}
            download={`invitation-${guest.code}.png`}
            className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-raised"
          >
            Download QR
          </a>
          {guest.phone ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-raised"
            >
              Send on WhatsApp
            </a>
          ) : null}
        </div>

        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-muted hover:text-ink">
            Preview the message ›
          </summary>
          <pre className="mt-2 rounded-lg bg-raised p-3 text-xs whitespace-pre-wrap text-muted">{message}</pre>
        </details>
      </div>
    </Card>
  );
}
