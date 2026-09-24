import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { GetGuestByCodeUseCase } from "@/features/guests/domain/use-cases/GetGuestByCodeUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import InviteCard from "@/features/guests/ui/InviteCard";
import { normaliseScan } from "@/shared/lib/codes";
import { INVITE_CARD_QR_OPTIONS, inviteUrl } from "@/shared/lib/invite-url";

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
    title: event ? `أنت مدعوة — ${event.name}` : "دعوة",
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

  const qr = await QRCode.toDataURL(inviteUrl(guest.code), INVITE_CARD_QR_OPTIONS);

  return (
    <main dir="rtl" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <InviteCard event={event} guest={guest} qr={qr} />

      <p className="mt-6 text-center text-xs text-muted-foreground">احتفظ بهذا الرابط لنفسك — إنه ما يتيح لك الدخول.</p>
    </main>
  );
}
