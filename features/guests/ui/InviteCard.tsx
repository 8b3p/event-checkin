import type { Event } from "@/features/events/domain/Event";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import type { Guest } from "../domain/Guest";

/**
 * The guest-facing invitation. Rendered on the server for `/i/[code]` and in the
 * owner's browser for the downloadable card image, so the two can't diverge —
 * keep it free of server-only imports.
 *
 * `variant="image"` drops what only makes sense on the live page: a map link
 * can't be tapped in a PNG, and "take a screenshot in case you're offline" is
 * moot when the card already is one.
 */
export default function InviteCard({
  event,
  guest,
  qr,
  variant = "page",
}: {
  event: Event;
  guest: Guest;
  qr: string;
  variant?: "page" | "image";
}) {
  const when = event.eventDate
    ? new Date(`${event.eventDate}T00:00:00`).toLocaleDateString("ar-u-nu-latn", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <article data-testid="invite-card" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-accent px-6 py-8 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-accent-foreground">أنت مدعوة</p>
        <h1 className="display mt-3 text-4xl leading-tight text-foreground">{event.name}</h1>
        {when ? <p className="mt-3 text-sm text-accent-foreground">{when}</p> : null}
        {event.venue ? <p className="text-sm text-accent-foreground">{event.venue}</p> : null}
        {event.locationLink && variant === "page" ? (
          <a
            href={event.locationLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm font-medium text-accent-foreground underline underline-offset-2"
          >
            الموقع على الخريطة
          </a>
        ) : null}
      </div>

      <div className="px-6 py-8 text-center">
        <p className="text-sm text-muted-foreground">هذه الدعوة لـ</p>
        <p className="display mt-1 text-2xl text-foreground">{guest.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          تشمل {pluralizeAr(guest.seats, { one: "شخصاً واحداً", two: "شخصين", few: "أشخاص", many: "شخصاً" })}
        </p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr}
          alt="رمز QR الخاص بدخولك"
          className="mx-auto mt-6 h-64 w-64 rounded-xl border border-border bg-white p-3"
        />

        <p dir="ltr" className="mt-4 font-mono text-sm tracking-[0.2em] text-muted-foreground">
          {guest.code}
        </p>
        <p className="mx-auto mt-4 max-w-xs text-sm text-muted-foreground">
          {variant === "image"
            ? "احتفظ بهذه البطاقة وأظهرها عند الباب."
            : "أظهر هذه الشاشة عند الباب. التقط لقطة شاشة إن لم يكن لديك إنترنت عند الوصول."}
        </p>
      </div>
    </article>
  );
}
