# Door Scanner & Check-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the door-staff experience the spec promised but no plan ever covered: a `/door` code-gated entry point (hinted from the owner login page), a persistent-camera `/scan` screen that checks guests in or out (seats-aware, with an override for edge cases), and a name-search/filter panel reachable from the same screen for scanning without a code — including adding a walk-in guest on the spot. All of it in Arabic/RTL/mobile-first, matching the rest of the app.

**Architecture:** Same layering as every other feature slice here: `domain/use-cases` hold the one new piece of real business logic (the in/out guard + seat clamping), Server Components fetch on load, `view-model/` hooks wrap `useActionState` for forms, and a Route Handler (`/api/checkin`) is the composition root for the two calls the camera/search UI makes as background `fetch`es (a page-level `redirect()` guard doesn't suit a `fetch` call the way it suits a page or a form submit — see Task 4). `features/check-in` already has the full domain model (`ScanEvent`, `foldGuestBalances`, `IScanRepository`, `ScanRepository`) and read-side use-cases; this plan adds the one write-side use-case that was always missing (`RecordScanUseCase`) plus a cross-feature one for walk-ins (`AddWalkInGuestUseCase`, same pattern as `AuthenticateDoorUseCase` depending on another feature's repository interface).

**Tech Stack:** Next.js 16 / React 19, `html5-qrcode` (already a dependency, unused until now), shadcn/ui primitives + `Shell`/`Field`/`ErrorNote`/`EmptyState` from prior plans, `jose`/JWT session cookie (already built).

**Spec:** [docs/superpowers/specs/2026-09-22-multi-event-checkin-design.md](../specs/2026-09-22-multi-event-checkin-design.md) — §5 (Auth & Access, door staff), §7 (Door Scanner: normal flow, unknown code, manual check-in, walk-in quick-add), §10 (Localization & Mobile-First UI), §11 (testing notes — derived status is the highest-risk area).
**Architecture:** [docs/architecture-docs/04-NEXTJS-ADAPTATION.md](../../architecture-docs/04-NEXTJS-ADAPTATION.md)
**Builds on:** [docs/superpowers/plans/2026-09-22-data-foundation-auth.md](2026-09-22-data-foundation-auth.md) (Part 1 — `features/check-in` domain/infrastructure, `features/guests`, `features/auth`, all merged) and [docs/superpowers/plans/2026-09-22-owner-auth-and-events-ui.md](2026-09-22-owner-auth-and-events-ui.md) (Part 2 — shadcn primitives, `Shell`, `Field`, `ErrorNote`, `EmptyState`, merged).

**Note on a dead end:** an earlier session built a scanner prototype directly under `app/scan/` against an older, pre-`features/` single-admit data model (`lib/db.ts`, no in/out). That code was never committed and its imports (`@/lib/db`, `@/lib/guard`, `@/app/api/checkin/route`'s old `ScanResult` type) don't resolve against the current tree — it now only exists as loose, uncommitted files inside an orphaned worktree folder (`.claude/worktrees/dazzling-kilby-2a1a6a/app/scan/`) with no git history behind it. Do not import from it. Its UX patterns (repeat-scan suppression window, result overlay, manual code fallback, audio/vibration feedback) are good and this plan reuses them adapted to the current in/out domain model — Task 5 copies its `feedback.ts` verbatim (it has no broken dependencies), everything else is rewritten against `features/check-in`.

## Global Constraints

**Product (from the spec):**
- Arabic-only UI, RTL, mobile-first, 44px-minimum touch targets — same as every other page in this app (§10).
- No named door-staff accounts — one shared door code per event, `scannedBy` is always the literal `"door"` (§5; matches the existing test fixture convention in `check-in-use-cases.test.ts`).
- `method` on a scan row must reflect how the guest was *identified*, not which UI button was pressed: a code — whether scanned by camera or typed into the fallback field — is `"qr"` (code-verified); a guest found via the name-search panel, and a walk-in, are `"manual"` (staff-vouched) (§7, §4 — "so the owner can audit who was code-verified vs staff-vouched").
- Seats-aware, override-on-mismatch: checking in/out defaults to the full remaining/present party size; staff can pick a smaller number for a split party; `override` lets staff record a scan that would otherwise be blocked (already fully in, or not inside to check out) (§7).
- No offline mode — the app assumes connectivity at the door; a lost connection is a visible error, not a silent local queue (§3, and the reused prototype's own `cameraError` handling already assumes this).

**Architecture (from `docs/architecture-docs/`):**
- `ui/` renders only; `view-model/` hooks wrap `useActionState`; Server Actions and Route Handlers are composition roots via `make<Name>Repository()` factories — same rule Part 2/Part 3 followed.
- Route Handlers use the global `Response`/`Request` (`Response.json(...)`), not `next/server`'s `NextResponse` — matches every existing Route Handler in this repo (`app/events/[id]/guests/export/route.ts`, `.../cards/route.ts`).
- `requireDoor()`/`requireOwner()` call `redirect()`, which is correct for pages and form Server Actions but wrong for a Route Handler hit by background `fetch()` (a redirect response would just be followed transparently, not surfaced as "you're logged out"). `/api/checkin` reads the session directly and returns `401` JSON instead — see Task 4.
- This repo's `AGENTS.md` flags that this Next.js build may differ from training data — check `node_modules/next/dist/docs/` for Route Handler / `params` conventions if anything here looks off; the existing Route Handlers already read `params` as a `Promise`, which every new file in this plan follows too.
- Every `Field htmlFor="X"` wraps a child `id="X"` (shadcn `Label` requires explicit pairing) — same rule as prior plans.

---

## Task 1: `RecordScanUseCase` — the in/out write path with seat guards

This is the one piece of real business logic this feature needs and the highest-risk correctness area per spec §11: it decides whether a scan is allowed, and how many seats it actually moves.

**Files:**
- Create: `features/check-in/domain/use-cases/RecordScanUseCase.ts`
- Modify: `features/check-in/domain/use-cases/check-in-use-cases.test.ts`

**Interfaces:**
- Consumes: `IScanRepository` (existing — `insideSeatsForGuest`, `record`), `ScanEvent`/`ScanDirection`/`ScanMethod` types (existing, `features/check-in/domain/ScanEvent.ts`).
- Produces: `RecordScanUseCase`, `RecordScanInput`, `RecordScanResult` — Task 4's Route Handler is the only consumer.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `features/check-in/domain/use-cases/check-in-use-cases.test.ts` (the file already has a `FakeScanRepository` — reuse it):

```ts
import { RecordScanUseCase } from "./RecordScanUseCase";

describe("RecordScanUseCase", () => {
  it("checks a guest in for their full party size when outside", async () => {
    const repo = new FakeScanRepository();
    const result = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 3,
      direction: "in",
      method: "qr",
      seats: 3,
      scannedBy: "door",
      override: false,
    });

    expect(result).toEqual({
      outcome: "recorded",
      scan: expect.objectContaining({ guestId: 1, direction: "in", seats: 3 }),
      insideSeats: 3,
    });
  });

  it("clamps a check-in to the remaining seats when the requested count is too high", async () => {
    const repo = new FakeScanRepository();
    await repo.record({ guestId: 1, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });

    const result = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 3,
      direction: "in",
      method: "manual",
      seats: 99,
      scannedBy: "door",
      override: false,
    });

    expect(result).toEqual({
      outcome: "recorded",
      scan: expect.objectContaining({ seats: 1 }),
      insideSeats: 3,
    });
  });

  it("blocks a check-in when the party is already fully inside, unless overridden", async () => {
    const repo = new FakeScanRepository();
    await repo.record({ guestId: 1, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });

    const blocked = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 2,
      direction: "in",
      method: "qr",
      seats: 2,
      scannedBy: "door",
      override: false,
    });
    expect(blocked).toEqual({ outcome: "blocked", reason: "already_full", insideSeats: 2 });

    const overridden = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 2,
      direction: "in",
      method: "qr",
      seats: 2,
      scannedBy: "door",
      override: true,
    });
    expect(overridden).toEqual({
      outcome: "recorded",
      scan: expect.objectContaining({ seats: 2, override: true }),
      insideSeats: 4,
    });
  });

  it("checks a guest out, clamped to the seats currently inside", async () => {
    const repo = new FakeScanRepository();
    await repo.record({ guestId: 1, direction: "in", method: "qr", seats: 3, scannedBy: "door", override: false });

    const result = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 3,
      direction: "out",
      method: "manual",
      seats: 99,
      scannedBy: "door",
      override: false,
    });

    expect(result).toEqual({
      outcome: "recorded",
      scan: expect.objectContaining({ direction: "out", seats: 3 }),
      insideSeats: 0,
    });
  });

  it("blocks a check-out when nobody from the party is inside, unless overridden", async () => {
    const repo = new FakeScanRepository();

    const blocked = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 2,
      direction: "out",
      method: "qr",
      seats: 1,
      scannedBy: "door",
      override: false,
    });
    expect(blocked).toEqual({ outcome: "blocked", reason: "not_inside", insideSeats: 0 });

    const overridden = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 2,
      direction: "out",
      method: "qr",
      seats: 1,
      scannedBy: "door",
      override: true,
    });
    expect(overridden.outcome).toBe("recorded");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- check-in-use-cases`
Expected: FAIL — `Cannot find module './RecordScanUseCase'`.

- [ ] **Step 3: Implement `RecordScanUseCase`**

```ts
// features/check-in/domain/use-cases/RecordScanUseCase.ts
import type { ScanDirection, ScanEvent, ScanMethod } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export type RecordScanInput = {
  guestId: number;
  /** The guest's party size — needed to cap how many seats a check-in can admit. */
  partySeats: number;
  direction: ScanDirection;
  method: ScanMethod;
  seats: number;
  scannedBy: string;
  override: boolean;
};

export type RecordScanResult =
  | { outcome: "recorded"; scan: ScanEvent; insideSeats: number }
  | { outcome: "blocked"; reason: "already_full" | "not_inside"; insideSeats: number };

/**
 * Writes one scan row, after a seats-aware guard: checking in is capped at the
 * party's remaining seats, checking out is capped at the seats currently
 * inside, and both are refused outright (not just capped to zero) once the
 * party is fully in/out — unless `override` is set, which bypasses the guard
 * entirely and records exactly the requested seats. See spec §7.
 */
export class RecordScanUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  async execute(input: RecordScanInput): Promise<RecordScanResult> {
    const insideSeats = await this.scanRepository.insideSeatsForGuest(input.guestId);

    if (input.direction === "in") {
      if (!input.override && insideSeats >= input.partySeats) {
        return { outcome: "blocked", reason: "already_full", insideSeats };
      }
      const seats = input.override ? input.seats : Math.min(input.seats, input.partySeats - insideSeats);
      const scan = await this.scanRepository.record({ ...input, seats });
      return { outcome: "recorded", scan, insideSeats: insideSeats + seats };
    }

    if (!input.override && insideSeats <= 0) {
      return { outcome: "blocked", reason: "not_inside", insideSeats };
    }
    const seats = input.override ? input.seats : Math.min(input.seats, insideSeats);
    const scan = await this.scanRepository.record({ ...input, seats });
    return { outcome: "recorded", scan, insideSeats: insideSeats - seats };
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test -- check-in-use-cases`
Expected: PASS, all tests including the five new ones.

- [ ] **Step 5: Commit**

```bash
git add features/check-in/domain/use-cases/RecordScanUseCase.ts features/check-in/domain/use-cases/check-in-use-cases.test.ts
git commit -m "Add RecordScanUseCase: seats-aware in/out guard with override"
```

---

## Task 2: `AddWalkInGuestUseCase` — quick-add + immediate check-in

**Files:**
- Create: `features/check-in/domain/use-cases/AddWalkInGuestUseCase.ts`
- Modify: `features/check-in/domain/use-cases/check-in-use-cases.test.ts`

**Interfaces:**
- Consumes: `IGuestRepository.create()` (existing, `features/guests/domain/IGuestRepository.ts`), `IScanRepository.record()` (existing), `generateCode()` (existing, `shared/lib/codes.ts`).
- Produces: `AddWalkInGuestUseCase`, `AddWalkInGuestInput`, `AddWalkInGuestResult` — Task 7's `addWalkInAction` is the only consumer.

- [ ] **Step 1: Write the failing test**

Add to `features/check-in/domain/use-cases/check-in-use-cases.test.ts`. This needs a fake guest repository too — add it near the top of the file, next to `FakeScanRepository`:

```ts
import type { BulkGuestRow, CreateGuestInput, Guest, UpdateGuestInput } from "@/features/guests/domain/Guest";
import type { IGuestRepository } from "@/features/guests/domain/IGuestRepository";
import { AddWalkInGuestUseCase } from "./AddWalkInGuestUseCase";

class FakeGuestRepository implements IGuestRepository {
  rows: Guest[] = [];
  private nextId = 1;

  async listForEvent(eventId: number): Promise<Guest[]> {
    return this.rows.filter((g) => g.eventId === eventId);
  }
  async getById(eventId: number, id: number): Promise<Guest | null> {
    return this.rows.find((g) => g.eventId === eventId && g.id === id) ?? null;
  }
  async getByCode(code: string): Promise<Guest | null> {
    return this.rows.find((g) => g.code === code) ?? null;
  }
  async create(input: CreateGuestInput): Promise<Guest> {
    const guest: Guest = { id: this.nextId++, createdAt: new Date(), ...input };
    this.rows.push(guest);
    return guest;
  }
  async createMany(eventId: number, rows: BulkGuestRow[]): Promise<number> {
    for (const row of rows) await this.create({ ...row, eventId, source: "invited" });
    return rows.length;
  }
  async update(eventId: number, id: number, input: UpdateGuestInput): Promise<void> {
    const guest = await this.getById(eventId, id);
    if (guest) Object.assign(guest, input);
  }
  async delete(eventId: number, id: number): Promise<void> {
    this.rows = this.rows.filter((g) => !(g.eventId === eventId && g.id === id));
  }
}

describe("AddWalkInGuestUseCase", () => {
  it("creates a walk-in guest with a generated code and checks them in as a manual entry", async () => {
    const guests = new FakeGuestRepository();
    const scans = new FakeScanRepository();

    const result = await new AddWalkInGuestUseCase(guests, scans).execute({
      eventId: 7,
      name: "Family of Samir",
      seats: 4,
      scannedBy: "door",
    });

    expect(result.guest).toMatchObject({ eventId: 7, name: "Family of Samir", seats: 4, source: "walk_in" });
    expect(result.guest.code).toHaveLength(10);
    expect(result.insideSeats).toBe(4);

    expect(scans.scans).toHaveLength(1);
    expect(scans.scans[0]).toMatchObject({
      guestId: result.guest.id,
      direction: "in",
      method: "manual",
      seats: 4,
      scannedBy: "door",
      override: false,
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- check-in-use-cases`
Expected: FAIL — `Cannot find module './AddWalkInGuestUseCase'`.

- [ ] **Step 3: Implement `AddWalkInGuestUseCase`**

```ts
// features/check-in/domain/use-cases/AddWalkInGuestUseCase.ts
import { generateCode } from "@/shared/lib/codes";
import type { Guest } from "@/features/guests/domain/Guest";
import type { IGuestRepository } from "@/features/guests/domain/IGuestRepository";
import type { IScanRepository } from "../IScanRepository";

export type AddWalkInGuestInput = { eventId: number; name: string; seats: number; scannedBy: string };
export type AddWalkInGuestResult = { guest: Guest; insideSeats: number };

/**
 * Cross-feature domain dependency (guests + check-in), through repository
 * interfaces — same pattern as AuthenticateDoorUseCase. See spec §7: a
 * walk-in gets a real guest row (so they can be given a QR later if the
 * owner wants) and is immediately checked in, both traceable to the door
 * session that added them.
 */
export class AddWalkInGuestUseCase {
  constructor(
    private readonly guestRepository: IGuestRepository,
    private readonly scanRepository: IScanRepository,
  ) {}

  async execute(input: AddWalkInGuestInput): Promise<AddWalkInGuestResult> {
    const guest = await this.guestRepository.create({
      eventId: input.eventId,
      name: input.name,
      seats: input.seats,
      phone: null,
      note: null,
      code: generateCode(),
      source: "walk_in",
    });

    await this.scanRepository.record({
      guestId: guest.id,
      direction: "in",
      method: "manual",
      seats: input.seats,
      scannedBy: input.scannedBy,
      override: false,
    });

    return { guest, insideSeats: input.seats };
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- check-in-use-cases`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/check-in/domain/use-cases/AddWalkInGuestUseCase.ts features/check-in/domain/use-cases/check-in-use-cases.test.ts
git commit -m "Add AddWalkInGuestUseCase: quick-add + immediate manual check-in"
```

---

## Task 3: Door auth — `/door` page, session, and the login-page hint

**Files:**
- Create: `features/auth/ui/DoorForm.tsx`
- Create: `features/auth/view-model/useDoorFormViewModel.ts`
- Create: `app/door-actions.ts`
- Create: `app/door/page.tsx`
- Modify: `app/login/page.tsx`

**Interfaces:**
- Consumes: `AuthenticateDoorUseCase` (existing, `features/auth/domain/use-cases/AuthenticateDoorUseCase.ts`), `makeEventRepository()` (existing), `setSessionCookie`/`getSession` (existing, `shared/lib/session-cookie.ts`), `requireSetUp()` (existing, `shared/lib/guard.ts`).
- Produces: `doorLoginAction`, `DoorAuthState` (`app/door-actions.ts`) — used only by `DoorForm.tsx`. No later task depends on these directly; Task 4/6 depend on the *session* this produces (`{ role: "door", eventId }`), not on these files.

- [ ] **Step 1: Server Action**

```ts
// app/door-actions.ts
"use server";

import { redirect } from "next/navigation";
import { AuthenticateDoorUseCase } from "@/features/auth/domain/use-cases/AuthenticateDoorUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { setSessionCookie } from "@/shared/lib/session-cookie";

export type DoorAuthState = { error?: string };

export async function doorLoginAction(_prev: DoorAuthState, formData: FormData): Promise<DoorAuthState> {
  const code = String(formData.get("doorCode") ?? "");

  const session = await new AuthenticateDoorUseCase(makeEventRepository()).execute(code);
  if (!session) {
    return { error: "رمز الباب غير صحيح." };
  }

  await setSessionCookie(session);
  redirect("/scan");
}
```

- [ ] **Step 2: View-model + form**

```ts
// features/auth/view-model/useDoorFormViewModel.ts
"use client";

import { useActionState } from "react";
import { doorLoginAction, type DoorAuthState } from "@/app/door-actions";

export function useDoorFormViewModel() {
  const [state, action, pending] = useActionState<DoorAuthState, FormData>(doorLoginAction, {});
  return { error: state.error, action, pending };
}
```

```tsx
// features/auth/ui/DoorForm.tsx
"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import { useDoorFormViewModel } from "../view-model/useDoorFormViewModel";

export default function DoorForm() {
  const { error, action, pending } = useDoorFormViewModel();

  return (
    <form action={action}>
      <Card>
        <CardContent className="space-y-4">
          <Field label="رمز الباب" htmlFor="doorCode">
            <Input
              id="doorCode"
              name="doorCode"
              required
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              dir="ltr"
              className="text-center text-lg tracking-[0.3em] uppercase"
            />
          </Field>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "جارٍ الدخول…" : "دخول"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
```

- [ ] **Step 3: `/door` page**

```tsx
// app/door/page.tsx
import { redirect } from "next/navigation";
import { CheckSetupStatusUseCase } from "@/features/auth/domain/use-cases/CheckSetupStatusUseCase";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import { getSession } from "@/shared/lib/session-cookie";
import DoorForm from "@/features/auth/ui/DoorForm";

export const dynamic = "force-dynamic";

export default async function DoorPage() {
  const isSetUp = await new CheckSetupStatusUseCase(makeOwnerRepository()).execute();
  if (!isSetUp) redirect("/setup");
  if ((await getSession())?.role === "door") redirect("/scan");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-12">
      <div className="mb-8 text-center">
        <h1 className="display text-4xl text-foreground">بوابة الاستقبال</h1>
        <p className="mt-2 text-sm text-muted-foreground">أدخل رمز الباب الخاص بفعاليتك.</p>
      </div>

      <DoorForm />
    </main>
  );
}
```

- [ ] **Step 4: Hint link on the owner login page**

In `app/login/page.tsx`, add the import and the link below `<LoginForm />`:

```tsx
import Link from "next/link";
```

```tsx
      <LoginForm />

      <p className="mt-5 text-center text-xs text-muted-foreground">
        <Link href="/door" className="underline underline-offset-4 hover:text-foreground">
          فريق الاستقبال؟ ادخل برمز الباب
        </Link>
      </p>
```

- [ ] **Step 5: Manual check**

Run: `npm run dev`, then:
1. Visit `/login` — confirm the new hint link is visible and goes to `/door`.
2. On `/door`, enter a wrong code — confirm the Arabic error shows.
3. Create an event (as owner) if none exists yet, note its door code (event settings page), enter it on `/door` — confirm redirect to `/scan` (a 404 is expected for now; Task 8 builds that page).

- [ ] **Step 6: Commit**

```bash
git add features/auth/ui/DoorForm.tsx features/auth/view-model/useDoorFormViewModel.ts app/door-actions.ts app/door/page.tsx app/login/page.tsx
git commit -m "Add door-staff sign-in (/door) and a hint link from the owner login page"
```

---

## Task 4: `/api/checkin` — resolve + commit Route Handler

This is the one endpoint both the camera scanner and the manual guest panel call. `POST` resolves an identifier (a code, or a guestId from the search panel) to a guest + suggested direction, without writing anything. `PATCH` commits a scan.

**Files:**
- Create: `app/api/checkin/route.ts`

**Interfaces:**
- Consumes: `getSession()` (existing), `GetGuestByCodeUseCase`, `GetGuestUseCase`, `makeGuestRepository()` (existing, `features/guests/*`), `GetGuestInsideSeatsUseCase`, `GetEventStatsUseCase`, `RecordScanUseCase` (Task 1), `makeScanRepository()` (existing, `features/check-in/infrastructure/factory.ts`), `normaliseScan()` (existing, `shared/lib/codes.ts`).
- Produces: `ResolveResult`, `CommitResult` types — Task 6/7's `Scanner.tsx`/`GuestSearchPanel.tsx` import these as `import type { ResolveResult, CommitResult } from "@/app/api/checkin/route"` (same pattern the reused-but-broken prototype used for its own `ScanResult` type).

- [ ] **Step 1: Implement the route**

```ts
// app/api/checkin/route.ts
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
```

- [ ] **Step 2: Manual check (no UI yet — use curl or a REST client)**

Run: `npm run dev`, sign in at `/door`, then in another terminal check the cookie is required:

```bash
curl -i http://localhost:3000/api/checkin -X POST -H "Content-Type: application/json" -d "{\"code\":\"X\"}"
```

Expected: `401` with `{"status":"unauthorized"}` (no cookie sent). Full resolve/commit flow gets exercised end-to-end in Task 8's manual QA once the UI exists.

- [ ] **Step 3: Commit**

```bash
git add app/api/checkin/route.ts
git commit -m "Add /api/checkin: resolve-then-commit Route Handler for scan and manual check-in/out"
```

---

## Task 5: Feedback module (audio/vibration)

Verbatim reuse of the orphaned prototype's `feedback.ts` — it's a pure browser-API module with no dependency on the old `lib/` layout, so nothing about it needs to change.

**Files:**
- Create: `features/check-in/ui/feedback.ts`

**Interfaces:**
- Consumes: nothing project-specific (Web Audio API, `navigator.vibrate`).
- Produces: `signalGood()`, `signalStop()`, `signalBad()` — Task 6's `Scanner.tsx` calls these.

- [ ] **Step 1: Create the file**

```ts
// features/check-in/ui/feedback.ts
/** Short tone + buzz, so door staff never has to look twice at the screen. */

let context: AudioContext | null = null;

function tone(frequency: number, durationMs: number, startOffsetMs = 0): void {
  try {
    context ??= new (window.AudioContext ?? (window as any).webkitAudioContext)();
    if (context.state === "suspended") void context.resume();

    const start = context.currentTime + startOffsetMs / 1000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + durationMs / 1000 + 0.02);
  } catch {
    // Audio is a nicety; a blocked AudioContext must not break scanning.
  }
}

/** Admitted / recorded cleanly. */
export function signalGood(): void {
  tone(880, 90);
  tone(1320, 110, 90);
  navigator.vibrate?.(60);
}

/** Blocked — needs a decision (override or dismiss). */
export function signalStop(): void {
  tone(320, 200);
  navigator.vibrate?.([80, 60, 80]);
}

/** Unknown code. */
export function signalBad(): void {
  tone(200, 320);
  navigator.vibrate?.(300);
}
```

- [ ] **Step 2: Commit**

```bash
git add features/check-in/ui/feedback.ts
git commit -m "Add scan feedback module (audio/vibration on result)"
```

---

## Task 6: `Scanner.tsx` — persistent camera, resolve/commit overlay, manual code entry

The core screen: camera stays mounted and running for the whole `/scan` session (frames are ignored while an overlay is up, not torn down — same technique the reused prototype used), a full-bleed color-flash overlay shows the resolved guest and the one primary in/out action, and a manual "type a code" fallback uses the same resolve/commit path as the camera.

**Files:**
- Create: `features/check-in/ui/Scanner.tsx`

**Interfaces:**
- Consumes: `ResolveResult`, `CommitResult` (Task 4, type-only import from `@/app/api/checkin/route`), `signalGood`/`signalStop`/`signalBad` (Task 5), `Event` (existing, `features/events/domain/Event`), `EventStats`, `GuestWithStatus` (existing, `features/check-in/domain/ScanEvent`), `logoutAction` (existing, `shared/lib/logout-action`).
- Produces: default export `Scanner({ event, initialStats, initialGuests })`. Renders `GuestSearchPanel` (Task 7) in a `view === "guests"` branch and passes it a `resolveGuest` callback so a row tap reuses this same overlay.

- [ ] **Step 1: Build the component**

```tsx
// features/check-in/ui/Scanner.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CommitResult, ResolveResult } from "@/app/api/checkin/route";
import type { Event } from "@/features/events/domain/Event";
import type { EventStats, GuestWithStatus, ScanMethod } from "@/features/check-in/domain/ScanEvent";
import { logoutAction } from "@/shared/lib/logout-action";
import { signalBad, signalGood, signalStop } from "./feedback";
import GuestSearchPanel from "./GuestSearchPanel";

const SCANNER_ID = "wc-reader";
const REPEAT_WINDOW_MS = 4000;

type Resolved = Extract<ResolveResult, { status: "resolved" }>;
type Blocked = Extract<CommitResult, { status: "blocked" }>;
type Overlay =
  | { kind: "unknown" }
  | { kind: "pending"; resolved: Resolved; method: ScanMethod }
  | { kind: "blocked"; resolved: Resolved; method: ScanMethod; blocked: Blocked }
  | { kind: "recorded"; guestName: string; direction: Resolved["direction"]; seats: number };

type Recent = { name: string; direction: Resolved["direction"]; seats: number; at: number };

export default function Scanner({
  event,
  initialStats,
  initialGuests,
}: {
  event: Event;
  initialStats: EventStats;
  initialGuests: GuestWithStatus[];
}) {
  const [view, setView] = useState<"camera" | "guests">("camera");
  const [stats, setStats] = useState(initialStats);
  const [guests, setGuests] = useState(initialGuests);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);

  // Kept in a ref so the html5-qrcode frame callback always sees the current value
  // without having to restart the scanner every time an overlay opens or closes.
  const pausedRef = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  const applyGuestInsideSeats = useCallback((guestId: number, insideSeats: number) => {
    setGuests((rows) => rows.map((g) => (g.id === guestId ? { ...g, insideSeats } : g)));
  }, []);

  const dismiss = useCallback(() => {
    setOverlay(null);
    pausedRef.current = false;
  }, []);

  const resolveByCode = useCallback(async (code: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (response.status === 401) {
        window.location.href = "/door";
        return;
      }
      const data = (await response.json()) as ResolveResult;
      pausedRef.current = true;

      if (data.status !== "resolved") {
        setOverlay({ kind: "unknown" });
        signalBad();
        return;
      }
      setOverlay({ kind: "pending", resolved: data, method: "qr" });
    } catch {
      setCameraError("تعذّر الاتصال. تحقّق من الشبكة وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }, []);

  /** Used by GuestSearchPanel: the guest is already known, just resolve their current status. */
  const resolveGuest = useCallback(async (guestId: number) => {
    setBusy(true);
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId }),
      });
      if (response.status === 401) {
        window.location.href = "/door";
        return;
      }
      const data = (await response.json()) as ResolveResult;
      if (data.status === "resolved") setOverlay({ kind: "pending", resolved: data, method: "manual" });
    } finally {
      setBusy(false);
    }
  }, []);

  const commit = useCallback(
    async (resolved: Resolved, method: ScanMethod, seats: number, override: boolean) => {
      setBusy(true);
      try {
        const response = await fetch("/api/checkin", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestId: resolved.guest.id, direction: resolved.direction, seats, override, method }),
        });
        if (response.status === 401) {
          window.location.href = "/door";
          return;
        }
        const data = (await response.json()) as CommitResult;

        if (data.status === "blocked") {
          setOverlay({ kind: "blocked", resolved, method, blocked: data });
          signalStop();
          return;
        }
        if (data.status !== "recorded") {
          setOverlay({ kind: "unknown" });
          signalBad();
          return;
        }

        applyGuestInsideSeats(resolved.guest.id, data.insideSeats);
        setStats(data.stats);
        setOverlay({ kind: "recorded", guestName: resolved.guest.name, direction: resolved.direction, seats });
        setRecent((rows) => [{ name: resolved.guest.name, direction: resolved.direction, seats, at: Date.now() }, ...rows].slice(0, 8));
        signalGood();
      } finally {
        setBusy(false);
      }
    },
    [applyGuestInsideSeats],
  );

  /* A recorded result clears itself so a queue keeps moving; unknown/blocked stay until tapped. */
  useEffect(() => {
    if (overlay?.kind !== "recorded") return;
    const timer = setTimeout(dismiss, 2200);
    return () => clearTimeout(timer);
  }, [overlay, dismiss]);

  useEffect(() => {
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (pausedRef.current) return;

            const previous = lastScanRef.current;
            const now = Date.now();
            if (previous && previous.code === decoded && now - previous.at < REPEAT_WINDOW_MS) return;

            lastScanRef.current = { code: decoded, at: now };
            void resolveByCode(decoded);
          },
          () => {
            // Fires every frame without a code found. Nothing to do.
          },
        );
      } catch {
        if (!cancelled) setCameraError("تعذّر الوصول إلى الكاميرا. اسمح بالوصول إليها من إعدادات المتصفح.");
      }
    })();

    return () => {
      cancelled = true;
      void scanner
        ?.stop()
        .then(() => scanner?.clear())
        .catch(() => undefined);
    };
  }, [resolveByCode]);

  return (
    <div className="flex min-h-dvh flex-col bg-night text-night-ink" dir="rtl">
      <header className="flex items-center gap-4 border-b border-night-line px-5 py-3">
        <div className="min-w-0">
          <p className="display truncate text-lg">{event.name}</p>
          <p className="text-xs text-night-muted">بوابة الدخول</p>
        </div>
        <div className="me-auto text-left">
          <p className="text-lg font-semibold tabular">
            {stats.seatsInside}
            <span className="text-night-muted">/{stats.seatsInvited}</span>
          </p>
          <p className="text-xs text-night-muted">بالداخل الآن</p>
        </div>
      </header>

      <div className="flex gap-2 border-b border-night-line px-5 py-2">
        <button
          onClick={() => setView("camera")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${view === "camera" ? "bg-night-raised text-night-ink" : "text-night-muted"}`}
        >
          الكاميرا
        </button>
        <button
          onClick={() => setView("guests")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${view === "guests" ? "bg-night-raised text-night-ink" : "text-night-muted"}`}
        >
          قائمة الضيوف
        </button>
      </div>

      {view === "camera" ? (
        <div className="relative min-h-[320px] flex-1">
          {/* html5-qrcode sets position:relative on its own container inline, so the
              fill has to come from this wrapper — without it the camera letterboxes. */}
          <div className="absolute inset-0 overflow-hidden">
            <div id={SCANNER_ID} className="h-full w-full" />
          </div>

          {cameraError ? (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
              <p className="text-sm text-night-muted">{cameraError}</p>
            </div>
          ) : null}

          {overlay ? (
            <ResultOverlay overlay={overlay} busy={busy} onDismiss={dismiss} onCommit={commit} onSearch={() => setView("guests")} />
          ) : null}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-canvas p-4 text-ink">
          <GuestSearchPanel guests={guests} onResolve={resolveGuest} onGuestAdded={(guest) => setGuests((rows) => [guest, ...rows])} />
        </div>
      )}

      {overlay ? null : (
        <div className="border-t border-night-line px-5 py-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!manual.trim()) return;
              void resolveByCode(manual.trim());
              setManual("");
            }}
            className="flex gap-2"
          >
            <input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder="اكتب الرمز بدلاً من المسح"
              autoCapitalize="characters"
              autoComplete="off"
              dir="ltr"
              className="h-12 flex-1 rounded-xl border border-night-line bg-night-raised px-4 text-center text-sm tracking-[0.15em] uppercase outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-night-muted/60 focus:border-night-good"
            />
            <button
              type="submit"
              disabled={busy}
              className="h-12 rounded-xl bg-night-good px-5 text-sm font-semibold text-night disabled:opacity-50"
            >
              تحقّق
            </button>
          </form>

          {recent.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {recent.slice(0, 3).map((row) => (
                <li key={row.at} className="flex items-center gap-2 text-xs text-night-muted">
                  <span className="text-night-good">{row.direction === "in" ? "↓" : "↑"}</span>
                  <span className="truncate text-night-ink">{row.name}</span>
                  <span className="tabular">{row.seats}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <form action={logoutAction}>
            <button type="submit" className="mt-3 text-xs text-night-muted hover:text-night-ink">
              إنهاء المناوبة
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function ResultOverlay({
  overlay,
  busy,
  onDismiss,
  onCommit,
  onSearch,
}: {
  overlay: Overlay;
  busy: boolean;
  onDismiss: () => void;
  onCommit: (resolved: Resolved, method: ScanMethod, seats: number, override: boolean) => void;
  onSearch: () => void;
}) {
  if (overlay.kind === "unknown") {
    return (
      <Overlay tone="bad" onDismiss={onDismiss}>
        <p className="display text-4xl">غير موجود في القائمة</p>
        <p className="mt-3 max-w-xs text-white/80">هذا الرمز ليس دعوة صالحة.</p>
        <button onClick={onSearch} className="mt-6 text-sm text-white underline underline-offset-4">
          ابحث بالاسم بدلاً من ذلك
        </button>
        <DismissButton onDismiss={onDismiss}>الضيف التالي</DismissButton>
      </Overlay>
    );
  }

  if (overlay.kind === "blocked") {
    const label = overlay.blocked.reason === "already_full" ? "الدخول مسجَّل بالكامل" : "لم يسجَّل دخول أحد من هذه الدعوة";
    return (
      <Overlay tone="warn" onDismiss={onDismiss}>
        <p className="display text-4xl">{overlay.resolved.guest.name}</p>
        <p className="mt-3 max-w-xs text-white/85">{label}</p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
          <button
            onClick={() => onCommit(overlay.resolved, overlay.method, overlay.resolved.defaultSeats || 1, true)}
            disabled={busy}
            className="h-14 rounded-xl bg-white/95 text-base font-semibold text-ink disabled:opacity-50"
          >
            تجاوز والتسجيل على أي حال
          </button>
          <button onClick={onDismiss} className="h-14 rounded-xl border border-white/30 text-base font-semibold">
            تراجع
          </button>
        </div>
      </Overlay>
    );
  }

  if (overlay.kind === "recorded") {
    return (
      <Overlay tone="good" onDismiss={onDismiss}>
        <p className="display text-5xl">{overlay.guestName}</p>
        <p className="mt-3 text-2xl font-semibold">
          {overlay.direction === "in" ? `تم تسجيل دخول ${overlay.seats}` : `تم تسجيل خروج ${overlay.seats}`}
        </p>
      </Overlay>
    );
  }

  // kind === "pending"
  const { resolved } = overlay;
  const smallerCounts = Array.from({ length: Math.max(resolved.defaultSeats - 1, 0) }, (_, i) => i + 1);

  return (
    <Overlay tone="good" onDismiss={onDismiss}>
      <p className="display text-5xl">{resolved.guest.name}</p>
      <p className="mt-1 text-white/80">
        {resolved.direction === "in" ? "بالخارج الآن" : "بالداخل الآن"} — {resolved.insideSeats}/{resolved.guest.seats}
      </p>
      {resolved.guest.note ? <p className="mt-1 text-white/70">{resolved.guest.note}</p> : null}

      <button
        onClick={() => onCommit(resolved, overlay.method, resolved.defaultSeats, false)}
        disabled={busy}
        className="mt-8 h-14 w-full max-w-xs rounded-xl bg-white/95 text-lg font-semibold text-ink disabled:opacity-50"
      >
        {resolved.direction === "in" ? `تسجيل دخول ${resolved.defaultSeats}` : `تسجيل خروج ${resolved.defaultSeats}`}
      </button>

      {smallerCounts.length > 0 ? (
        <div className="mt-6 w-full max-w-xs">
          <p className="mb-2 text-sm text-white/80">عدد أقل؟</p>
          <div className="flex flex-wrap justify-center gap-2">
            {smallerCounts.map((seats) => (
              <button
                key={seats}
                onClick={() => onCommit(resolved, overlay.method, seats, false)}
                disabled={busy}
                className="h-12 w-12 rounded-xl border border-white/30 text-lg font-semibold tabular disabled:opacity-50"
              >
                {seats}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <DismissButton onDismiss={onDismiss}>تراجع</DismissButton>
    </Overlay>
  );
}

const TONES = { good: "bg-good", warn: "bg-warn", bad: "bg-bad" } as const;

function Overlay({ tone, onDismiss, children }: { tone: keyof typeof TONES; onDismiss: () => void; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={`flash-in absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-6 py-8 text-center text-white ${TONES[tone]}`}
    >
      {children}
      <button onClick={onDismiss} className="sr-only">
        إغلاق
      </button>
    </div>
  );
}

function DismissButton({ onDismiss, children }: { onDismiss: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onDismiss} className="mt-6 text-sm text-white/70 underline underline-offset-4">
      {children}
    </button>
  );
}
```

Note: Task 7 must exist before this file typechecks (it imports `GuestSearchPanel` from `./GuestSearchPanel`) — that's fine, this plan's tasks run in order.

- [ ] **Step 2: Commit**

```bash
git add features/check-in/ui/Scanner.tsx
git commit -m "Add Scanner: persistent-camera in/out scanning with resolve/commit overlay"
```

(Manual verification of this component happens in Task 8, once `/scan` and `GuestSearchPanel` both exist and the page actually renders.)

---

## Task 7: `GuestSearchPanel` — filter/search + act without scanning, and walk-in quick-add

**Files:**
- Create: `features/check-in/ui/GuestSearchPanel.tsx`
- Create: `features/check-in/ui/AddWalkInForm.tsx`
- Create: `features/check-in/view-model/useAddWalkInFormViewModel.ts`
- Create: `app/scan/actions.ts`

**Interfaces:**
- Consumes: `normalizeAr()` (existing, `shared/lib/normalize-ar.ts`), `pluralizeAr()` (existing, `shared/lib/pluralize-ar.ts`), `GuestWithStatus` (existing, `features/check-in/domain/ScanEvent`), `requireDoor()` (existing, `shared/lib/guard.ts`), `AddWalkInGuestUseCase` (Task 2), `makeGuestRepository()`/`makeScanRepository()` (existing).
- Produces: default export `GuestSearchPanel({ guests, onResolve, onGuestAdded })` — consumed by `Scanner.tsx` (Task 6). `addWalkInAction`, `WalkInFormState` (`app/scan/actions.ts`) — consumed only by `useAddWalkInFormViewModel`.

- [ ] **Step 1: Walk-in Server Action**

```ts
// app/scan/actions.ts
"use server";

import { AddWalkInGuestUseCase } from "@/features/check-in/domain/use-cases/AddWalkInGuestUseCase";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireDoor } from "@/shared/lib/guard";

export type WalkInGuest = {
  id: number;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  code: string;
  source: "invited" | "walk_in";
  insideSeats: number;
};

export type WalkInFormState = { error?: string; guest?: WalkInGuest };

const MAX_SEATS = 50;

function parseSeats(raw: string): number {
  const seats = Number.parseInt(raw, 10);
  if (!Number.isFinite(seats) || seats < 1) return 1;
  return Math.min(seats, MAX_SEATS);
}

export async function addWalkInAction(_prev: WalkInFormState, formData: FormData): Promise<WalkInFormState> {
  const eventId = await requireDoor();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "أضف اسم الضيف." };

  const seats = parseSeats(String(formData.get("seats") ?? "1"));

  const { guest, insideSeats } = await new AddWalkInGuestUseCase(makeGuestRepository(), makeScanRepository()).execute({
    eventId,
    name,
    seats,
    scannedBy: "door",
  });

  return {
    guest: {
      id: guest.id,
      name: guest.name,
      seats: guest.seats,
      phone: guest.phone,
      note: guest.note,
      code: guest.code,
      source: guest.source,
      insideSeats,
    },
  };
}
```

- [ ] **Step 2: Walk-in view-model + form**

```ts
// features/check-in/view-model/useAddWalkInFormViewModel.ts
"use client";

import { useActionState } from "react";
import { addWalkInAction, type WalkInFormState } from "@/app/scan/actions";

export function useAddWalkInFormViewModel() {
  const [state, action, pending] = useActionState<WalkInFormState, FormData>(addWalkInAction, {});
  return { error: state.error, guest: state.guest, action, pending };
}
```

```tsx
// features/check-in/ui/AddWalkInForm.tsx
"use client";

import { useEffect, useRef } from "react";
import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import type { WalkInGuest } from "@/app/scan/actions";
import { useAddWalkInFormViewModel } from "../view-model/useAddWalkInFormViewModel";

export default function AddWalkInForm({ onAdded, onDone }: { onAdded: (guest: WalkInGuest) => void; onDone: () => void }) {
  const { error, guest, action, pending } = useAddWalkInFormViewModel();
  const lastGuestId = useRef<number | null>(null);

  useEffect(() => {
    if (guest && guest.id !== lastGuestId.current) {
      lastGuestId.current = guest.id;
      onAdded(guest);
      onDone();
    }
  }, [guest, onAdded, onDone]);

  return (
    <Card>
      <CardContent className="space-y-4">
        <form action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="الاسم" htmlFor="wi-name">
              <Input id="wi-name" name="name" placeholder="اسم الضيف" required autoFocus />
            </Field>
            <Field label="عدد المقاعد" htmlFor="wi-seats">
              <Input id="wi-seats" name="seats" type="number" min={1} max={50} defaultValue={1} />
            </Field>
          </div>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الإضافة…" : "إضافة وتسجيل الدخول"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              إلغاء
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: The search panel**

```tsx
// features/check-in/ui/GuestSearchPanel.tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shared/component/ui/button";
import { Card } from "@/shared/component/ui/card";
import { EmptyState } from "@/shared/component/empty-state";
import { Input } from "@/shared/component/ui/input";
import { normalizeAr } from "@/shared/lib/normalize-ar";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import type { GuestWithStatus } from "@/features/check-in/domain/ScanEvent";
import type { WalkInGuest } from "@/app/scan/actions";
import AddWalkInForm from "./AddWalkInForm";

type StatusFilter = "all" | "inside" | "outside";

export default function GuestSearchPanel({
  guests,
  onResolve,
  onGuestAdded,
}: {
  guests: GuestWithStatus[];
  onResolve: (guestId: number) => void;
  onGuestAdded: (guest: GuestWithStatus) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [addingWalkIn, setAddingWalkIn] = useState(false);

  const visible = useMemo(() => {
    const needle = normalizeAr(query.trim());
    return guests.filter((guest) => {
      if (status === "inside" && guest.insideSeats <= 0) return false;
      if (status === "outside" && guest.insideSeats > 0) return false;
      if (!needle) return true;
      return normalizeAr(guest.name).includes(needle) || normalizeAr(guest.note ?? "").includes(needle) || normalizeAr(guest.code).includes(needle);
    });
  }, [guests, query, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الرمز" className="max-w-xs" autoFocus />
        <div className="flex gap-1">
          {(
            [
              { key: "all", label: "الكل" },
              { key: "inside", label: "بالداخل" },
              { key: "outside", label: "بالخارج" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setStatus(option.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${status === option.key ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button type="button" variant={addingWalkIn ? "default" : "outline"} className="ms-auto" onClick={() => setAddingWalkIn((v) => !v)}>
          ضيف بدون دعوة
        </Button>
      </div>

      {addingWalkIn ? (
        <AddWalkInForm
          onAdded={(guest: WalkInGuest) => onGuestAdded({ ...guest })}
          onDone={() => setAddingWalkIn(false)}
        />
      ) : null}

      <Card>
        {guests.length === 0 ? (
          <EmptyState title="لا توجد دعوات بعد" body="أضف ضيفاً بدون دعوة، أو ارجع للمالك لإضافة الدعوات." />
        ) : visible.length === 0 ? (
          <EmptyState title="لا توجد نتائج" body="جرّب بحثاً مختلفاً." />
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((guest) => {
              const outside = guest.insideSeats <= 0;
              const full = guest.insideSeats >= guest.seats;
              const label = outside ? "خارج" : full ? "بالداخل" : `${guest.insideSeats}/${guest.seats} بالداخل`;

              return (
                <li key={guest.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{guest.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {pluralizeAr(guest.seats, { one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعد" })} · {label}
                      {guest.phone ? ` · ${guest.phone}` : ""}
                      {guest.note ? ` · ${guest.note}` : ""}
                    </p>
                  </div>
                  <Button type="button" size="sm" onClick={() => onResolve(guest.id)}>
                    {outside ? "تسجيل دخول" : "تسجيل خروج"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add features/check-in/ui/GuestSearchPanel.tsx features/check-in/ui/AddWalkInForm.tsx features/check-in/view-model/useAddWalkInFormViewModel.ts app/scan/actions.ts
git commit -m "Add guest search/filter panel with walk-in quick-add, wired into the scanner"
```

---

## Task 8: `/scan` page, typecheck/test pass, and manual QA

**Files:**
- Create: `app/scan/page.tsx`

**Interfaces:**
- Consumes: `requireDoor()` (existing), `GetEventUseCase`/`makeEventRepository()` (existing), `GetEventStatsUseCase`/`ListGuestsWithStatusUseCase`/`makeScanRepository()` (existing), `Scanner` (Task 6, default export).
- Produces: the `/scan` route — nothing later in this plan depends on it (it's the terminal page).

- [ ] **Step 1: Build the page**

```tsx
// app/scan/page.tsx
import { notFound } from "next/navigation";
import { GetEventStatsUseCase } from "@/features/check-in/domain/use-cases/GetEventStatsUseCase";
import { ListGuestsWithStatusUseCase } from "@/features/check-in/domain/use-cases/ListGuestsWithStatusUseCase";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import Scanner from "@/features/check-in/ui/Scanner";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { requireDoor } from "@/shared/lib/guard";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const eventId = await requireDoor();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const scanRepository = makeScanRepository();
  const [stats, guests] = await Promise.all([
    new GetEventStatsUseCase(scanRepository).execute(eventId),
    new ListGuestsWithStatusUseCase(scanRepository).execute(eventId),
  ]);

  return <Scanner event={event} initialStats={stats} initialGuests={guests} />;
}
```

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS — every existing suite plus this plan's new `RecordScanUseCase`/`AddWalkInGuestUseCase` tests.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. Pay particular attention to `Scanner.tsx`'s `ResolveResult`/`CommitResult` type-only imports from the Route Handler and the `GuestWithStatus`/`WalkInGuest` shapes lining up — these are the seams most likely to drift since they're duplicated by hand across Task 4/6/7.

- [ ] **Step 4: Manual QA in a browser**

Run: `npm run dev`, then, using a real event's door code (create one as owner first if needed — event settings page shows its door code):

1. **Door entry:** `/login` → click the hint link → `/door` → enter the door code → lands on `/scan`.
2. **Camera:** browser prompts for camera permission; once granted, the full-bleed camera view is visible with the event name and `0/N` seats header.
3. **Scan a real guest QR** (from that guest's `/i/[code]` page or downloaded card, open on a second device/tab and point the camera at it, or use the manual code field with the guest's raw code): overlay shows the guest's name and a "تسجيل دخول N" button; tap it → green flash, stats header updates, guest disappears from "الكاميرا" tab's pending state and shows updated status in "قائمة الضيوف".
4. **Re-scan the same guest:** now shows "الدخول مسجَّل بالكامل" (blocked) with a "تجاوز والتسجيل على أي حال" override button.
5. **Unknown code:** type a garbage code into the manual field → red flash "غير موجود في القائمة" with a "ابحث بالاسم بدلاً من ذلك" link that switches to the guest list.
6. **Guest list tab:** search filters by name/code (try an Arabic name with alternate spelling, e.g. أ vs ا, to confirm `normalizeAr` is doing its job); tap "تسجيل خروج" on the guest just checked in → same overlay, now offering check-out.
7. **Walk-in:** tap "ضيف بدون دعوة", fill name + seats, submit → new guest appears at the top of the list already marked inside.
8. **Session end:** tap "إنهاء المناوبة" → redirected to `/login`; visiting `/scan` again now redirects to `/door` (session cleared).
9. **Wrong-event isolation** (if more than one event exists): a door code for event A must never resolve or list guests from event B — confirm by checking a guest code from a different event returns "unknown".

Fix anything that doesn't match before moving on — this is the only task in the plan that exercises the full flow end to end.

- [ ] **Step 5: Commit**

```bash
git add app/scan/page.tsx
git commit -m "Add /scan page: wires the door session to the scanner"
```

---

## Post-plan cleanup (not a task — flag for the user, don't do it silently)

Three orphaned, uncommitted worktree folders exist under `.claude/worktrees/` (`dazzling-kilby-2a1a6a`, `keen-gates-db2b4d`, `sweet-faraday-c494ce`) from earlier sessions, none registered with git anymore. `dazzling-kilby-2a1a6a/app/scan/` was this plan's UX reference (Task 5/6); nothing else in those folders is needed once this plan lands. Confirm with the user before deleting — they may still hold other in-progress work.
