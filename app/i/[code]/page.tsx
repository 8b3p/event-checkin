import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { GetGuestByCodeUseCase } from "@/features/guests/domain/use-cases/GetGuestByCodeUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { inviteUrl, normaliseScan } from "@/shared/lib/codes";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const normalised = normaliseScan(code);
  const guest = normalised ? await new GetGuestByCodeUseCase(makeGuestRepository()).execute(normalised) : null;
  const event = guest ? await new GetEventUseCase(makeEventRepository()).execute(guest.eventId) : null;

  return {
    title: event ? `أنت مدعو — ${event.name}` : "دعوة",
    robots: { index: false, follow: false },
  };
}

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const normalised = normaliseScan(code);
  const guest = normalised ? await new GetGuestByCodeUseCase(makeGuestRepository()).execute(normalised) : null;
  if (!guest) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(guest.eventId);
  if (!event) notFound();

  const qr = await QRCode.toDataURL(inviteUrl(guest.code), { errorCorrectionLevel: "M", margin: 1, width: 900 });

  const when = event.eventDate
    ? new Date(`${event.eventDate}T00:00:00`).toLocaleDateString("ar-u-nu-latn", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <main dir="rtl" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <article className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border bg-accent px-6 py-8 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-accent-foreground">أنت مدعو</p>
          <h1 className="display mt-3 text-4xl leading-tight text-foreground">{event.name}</h1>
          {when ? <p className="mt-3 text-sm text-accent-foreground">{when}</p> : null}
          {event.venue ? <p className="text-sm text-accent-foreground">{event.venue}</p> : null}
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
            أظهر هذه الشاشة عند الباب. التقط لقطة شاشة إن لم يكن لديك إنترنت عند الوصول.
          </p>
        </div>
      </article>

      <p className="mt-6 text-center text-xs text-muted-foreground">احتفظ بهذا الرابط لنفسك — إنه ما يتيح لك الدخول.</p>
    </main>
  );
}
