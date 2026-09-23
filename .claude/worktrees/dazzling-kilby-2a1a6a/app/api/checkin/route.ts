import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { normaliseScan } from "@/lib/codes";
import {
  getGuestByCode,
  getStats,
  recordCheckin,
  updateCheckinSeats,
  type Stats,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export type ScanResult =
  | { status: "unknown"; stats: Stats }
  | {
      status: "admitted";
      checkinId: number;
      guest: { name: string; seats: number; note: string | null };
      admitted: number;
      override: boolean;
      stats: Stats;
    }
  | {
      status: "already";
      guest: { name: string; seats: number; note: string | null };
      arrived: number;
      firstArrival: string;
      stats: Stats;
    };

/**
 * One scan at the door.
 *
 * A first scan admits the whole invitation straight away — the common case has
 * to be instant. A repeat scan stops and reports when they came through, and
 * only admits again if the operator explicitly overrides, which is recorded.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { code?: unknown; override?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const code = normaliseScan(String(body.code ?? ""));
  if (!code) {
    return NextResponse.json<ScanResult>({ status: "unknown", stats: getStats() });
  }

  const guest = getGuestByCode(code);
  if (!guest) {
    return NextResponse.json<ScanResult>({ status: "unknown", stats: getStats() });
  }

  const override = body.override === true;

  if (guest.arrived > 0 && !override) {
    return NextResponse.json<ScanResult>({
      status: "already",
      guest: { name: guest.name, seats: guest.seats, note: guest.note },
      arrived: guest.arrived,
      firstArrival: guest.first_arrival ?? new Date().toISOString(),
      stats: getStats(),
    });
  }

  // An override admits one more person, not the whole invitation again.
  const admitted = override ? 1 : guest.seats;

  const checkin = recordCheckin({
    guestId: guest.id,
    seats: admitted,
    scannedBy: session.role,
    override,
  });

  return NextResponse.json<ScanResult>({
    status: "admitted",
    checkinId: checkin.id,
    guest: { name: guest.name, seats: guest.seats, note: guest.note },
    admitted,
    override,
    stats: getStats(),
  });
}

/** Corrects how many people a scan actually let in, when fewer turned up. */
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { checkinId?: unknown; seats?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const checkinId = Number(body.checkinId);
  const seats = Number(body.seats);

  if (!Number.isInteger(checkinId) || !Number.isInteger(seats) || seats < 1 || seats > 50) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  updateCheckinSeats(checkinId, seats);
  return NextResponse.json({ ok: true, stats: getStats() });
}
