import { GetGuestByCodeUseCase } from "@/features/guests/domain/use-cases/GetGuestByCodeUseCase";
import { GetGuestUseCase } from "@/features/guests/domain/use-cases/GetGuestUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import type { Guest } from "@/features/guests/domain/Guest";
import { GetEventStatsUseCase } from "@/features/check-in/domain/use-cases/GetEventStatsUseCase";
import { GetGuestInsideSeatsUseCase } from "@/features/check-in/domain/use-cases/GetGuestInsideSeatsUseCase";
import { RecordScanUseCase } from "@/features/check-in/domain/use-cases/RecordScanUseCase";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import type { EventStats, ScanDirection, ScanMethod } from "@/features/check-in/domain/ScanEvent";
import { normaliseScan } from "@/shared/lib/codes";
import { getSession } from "@/shared/lib/session-cookie";
import type { Session } from "@/features/auth/domain/Session";

export type ResolveResult =
  | { status: "unauthorized" }
  | { status: "unknown" }
  | {
      status: "resolved";
      guest: { id: number; name: string; seats: number; note: string | null };
      direction: ScanDirection;
      insideSeats: number;
      defaultSeats: number;
    };

export type CommitResult =
  | { status: "unauthorized" }
  | { status: "not_found" }
  | { status: "blocked"; reason: "already_full" | "not_inside"; insideSeats: number }
  | { status: "recorded"; insideSeats: number; stats: EventStats };

/** Route Handlers hit by background `fetch()` can't use requireDoor()'s
 * redirect() — a redirect response would just be followed transparently by
 * fetch instead of surfacing as "you're logged out". Return 401 JSON instead;
 * the client checks for it and sends the page itself to /door. */
async function requireDoorSession(): Promise<Extract<Session, { role: "door" }> | null> {
  const session = await getSession();
  return session?.role === "door" ? session : null;
}

export async function POST(request: Request): Promise<Response> {
  const session = await requireDoorSession();
  if (!session) return Response.json({ status: "unauthorized" } satisfies ResolveResult, { status: 401 });

  const body = await request.json();
  const guestRepository = makeGuestRepository();

  let guest: Guest | null;
  if (typeof body.guestId === "number") {
    guest = await new GetGuestUseCase(guestRepository).execute(session.eventId, body.guestId);
  } else {
    const code = normaliseScan(String(body.code ?? ""));
    guest = code ? await new GetGuestByCodeUseCase(guestRepository).execute(code) : null;
    if (guest && guest.eventId !== session.eventId) guest = null;
  }

  if (!guest) return Response.json({ status: "unknown" } satisfies ResolveResult);

  const scanRepository = makeScanRepository();
  const insideSeats = await new GetGuestInsideSeatsUseCase(scanRepository).execute(guest.id);
  const direction: ScanDirection = insideSeats < guest.seats ? "in" : "out";
  const defaultSeats = direction === "in" ? guest.seats - insideSeats : insideSeats;

  return Response.json({
    status: "resolved",
    guest: { id: guest.id, name: guest.name, seats: guest.seats, note: guest.note },
    direction,
    insideSeats,
    defaultSeats,
  } satisfies ResolveResult);
}

export async function PATCH(request: Request): Promise<Response> {
  const session = await requireDoorSession();
  if (!session) return Response.json({ status: "unauthorized" } satisfies CommitResult, { status: 401 });

  const body = await request.json();
  const guestId = Number(body.guestId);
  const direction: ScanDirection = body.direction === "out" ? "out" : "in";
  const seats = Math.max(1, Number.parseInt(String(body.seats ?? "1"), 10) || 1);
  const override = Boolean(body.override);
  const method: ScanMethod = body.method === "manual" ? "manual" : "qr";

  const guestRepository = makeGuestRepository();
  const guest = await new GetGuestUseCase(guestRepository).execute(session.eventId, guestId);
  if (!guest) return Response.json({ status: "not_found" } satisfies CommitResult, { status: 404 });

  const scanRepository = makeScanRepository();
  const result = await new RecordScanUseCase(scanRepository).execute({
    guestId: guest.id,
    partySeats: guest.seats,
    direction,
    method,
    seats,
    scannedBy: "door",
    override,
  });

  if (result.outcome === "blocked") {
    return Response.json({
      status: "blocked",
      reason: result.reason,
      insideSeats: result.insideSeats,
    } satisfies CommitResult);
  }

  const stats = await new GetEventStatsUseCase(scanRepository).execute(session.eventId);
  return Response.json({ status: "recorded", insideSeats: result.insideSeats, stats } satisfies CommitResult);
}
