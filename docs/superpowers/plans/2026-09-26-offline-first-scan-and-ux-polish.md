# Offline-First Door & Scanner, Post-Scan UX, and Loading States — Implementation Plan

**Goal:** Ship the three workstreams in
`docs/superpowers/specs/2026-09-26-offline-first-scan-and-ux-polish.md`:
(A) offline-first scanning with a durable local queue and idempotent
background sync, (B) an instant, non-blocking post-scan result plus a
redesigned guest card, (C) loading states across the owner dashboard and
scanner.

**Spec:** [docs/superpowers/specs/2026-09-26-offline-first-scan-and-ux-polish.md](../specs/2026-09-26-offline-first-scan-and-ux-polish.md)
**Architecture:** [docs/architecture-docs/04-NEXTJS-ADAPTATION.md](../../architecture-docs/04-NEXTJS-ADAPTATION.md), [docs/architecture-docs/02-CONVENTIONS.md](../../architecture-docs/02-CONVENTIONS.md)
**Supersedes-in-part:** `docs/superpowers/specs/2026-09-22-multi-event-checkin-design.md` §3 ("No offline scanning") and `docs/superpowers/plans/2026-09-23-door-scanner-checkin.md`'s Global Constraints ("No offline mode") — Task 0 updates both to point at the new spec instead of contradicting it.

**Recommended order:** C (independent, lowest risk) → A (largest) → B (small, sits on A's result shape). Tasks below are grouped by workstream but numbered as one sequence; a team could run C in parallel with A/B if working with more than one person.

## Global Constraints

- Same layering rules as every prior plan in this repo: `domain/` holds
  real logic + tests, `infrastructure/` implements repository interfaces,
  `view-model/` wraps state hooks, `ui/` renders only.
- Route Handlers use the global `Response`/`Request`, not `next/server`'s
  `NextResponse` (matches every existing Route Handler).
- This repo's `AGENTS.md` flags this Next.js build as non-standard —
  check `node_modules/next/dist/docs/` before touching `loading.tsx`
  conventions, Route Handler behavior, or anything else that looks
  version-sensitive.
- No new icon library, no new styling paradigm, no second form-state
  library — extend what's already in `shared/component/ui/`.
- Arabic/RTL/mobile-first throughout, same as every existing screen.

---

## Phase C — Loading states (do first)

### Task C1: Shared `Spinner` and `Skeleton` primitives

**Files:**
- Create: `shared/component/ui/spinner.tsx`
- Create: `shared/component/ui/skeleton.tsx`

**Steps:**
- [ ] Build a small inline SVG spinner component (`Spinner`), sized via the
      same `size` convention `Button` uses (`xs`/`sm`/`default`/`lg`), no
      new icon library.
- [ ] Build a generic `Skeleton` block (pulsing background, `className`
      passthrough for width/height/shape), composed by page-specific
      skeletons rather than used bare.
- [ ] Unit/render test for both (component test per house convention —
      "component tests for interactive components").
- [ ] Commit.

### Task C2: `Button` gets an `isLoading` prop

**Files:**
- Modify: `shared/component/ui/button.tsx`

**Steps:**
- [ ] Add `isLoading?: boolean` to `Button`'s props. When true: render the
      Task C1 `Spinner` in place of/alongside children (decide via a quick
      look at existing button sizes so text doesn't reflow), force
      `disabled`, keep width stable (avoid layout shift).
- [ ] Component test: `isLoading` disables the button and shows the
      spinner.
- [ ] Commit.

### Task C3: Migrate existing pending-state call sites onto `isLoading`

**Files:**
- Modify: every form/action button currently hand-rolling
  `disabled={pending}` — `DoorForm.tsx`, `LoginForm.tsx`, `SetupForm.tsx`,
  `AddGuestForm.tsx`, `EditGuestForm.tsx`, `ImportGuestsForm.tsx`,
  `CreateEventForm.tsx`, `EventSettingsForm.tsx`, `DeleteGuestButton.tsx`,
  `ArchiveEventButton.tsx`, `DuplicateEventButton.tsx`, `AddWalkInForm.tsx`.

**Steps:**
- [ ] For each: replace the manual disabled/text-swap with
      `isLoading={pending}` (keeping any Arabic "جارٍ…" text where it
      already reads well — `isLoading` and a text swap aren't mutually
      exclusive, but don't invent new copy where a static label already
      works).
- [ ] Re-run each feature's existing tests; these are UI-only changes, no
      view-model/domain behavior changes expected.
- [ ] Commit (one commit per feature area is fine — auth, guests, events,
      check-in — rather than one giant commit).

### Task C4: Route-level `loading.tsx` + page-shaped skeletons

**Files:**
- Create: `app/loading.tsx`, `app/events/[id]/loading.tsx`,
  `app/events/[id]/guests/loading.tsx`,
  `app/events/[id]/guests/[guestId]/loading.tsx`, `app/scan/loading.tsx`.
- Create supporting skeleton components colocated with each feature's UI
  (e.g. `features/events/ui/EventListSkeleton.tsx`) rather than one
  generic catch-all, per §8.3's "roughly match the shape" requirement.

**Steps:**
- [ ] Confirm this build's `loading.tsx`/Suspense behavior against
      `node_modules/next/dist/docs/` before writing (per `AGENTS.md` and
      this plan's Global Constraints) — flag anything that differs from
      stock Next App Router conventions.
- [ ] Build each skeleton to match its real page's layout (grid of cards
      for the event list, stat row + chart block for the event dashboard,
      list rows for guests, a dark full-bleed placeholder for `/scan` so
      the light→dark transition isn't jarring).
- [ ] Manual check: throttle network in devtools, navigate to each route,
      confirm the skeleton shows and matches the eventual real layout
      (no obvious pop-in/reflow).
- [ ] Commit.

---

## Phase A — Offline-first door & scanner

### Task A0: Reconcile the docs this reverses

**Files:**
- Modify: `docs/superpowers/specs/2026-09-22-multi-event-checkin-design.md` §3
- Modify: `docs/superpowers/plans/2026-09-23-door-scanner-checkin.md` Global Constraints

**Steps:**
- [ ] Replace the "No offline scanning" non-goal and the "No offline mode"
      constraint with a pointer to the new spec (§2 of it exists
      specifically to be that pointer), so a future reader doesn't hit a
      direct contradiction between two "approved" documents.
- [ ] Commit.

### Task A1: Extract the shared seats-aware guard function

**Files:**
- Create: `features/check-in/domain/decideScanOutcome.ts` (naming: pure
  `camelCase.ts` helper per `02-CONVENTIONS.md`'s naming table)
- Modify: `features/check-in/domain/use-cases/RecordScanUseCase.ts` (calls
  the extracted function instead of inlining the math)
- Modify: `features/check-in/domain/use-cases/check-in-use-cases.test.ts`
  (existing `RecordScanUseCase` tests should still pass unchanged; add
  direct tests for the extracted function)

**Interfaces:**
- Produces: `decideScanOutcome(input: { insideSeats, partySeats, direction,
  seats, override }): { outcome: "recorded"; seats; insideSeats } | {
  outcome: "blocked"; reason; insideSeats }` — consumed by
  `RecordScanUseCase` (server) and Task A3's client resolver (same
  function, two callers, per spec §6.5).

**Steps:**
- [ ] Write/port tests for `decideScanOutcome` covering the same five cases
      `RecordScanUseCase`'s existing suite already covers (full check-in,
      clamped check-in, blocked+override, checked-out clamped, blocked
      check-out+override).
- [ ] Implement `decideScanOutcome`, refactor `RecordScanUseCase.execute`
      to call it and only handle the repository read/write around it.
- [ ] Run `npm test -- check-in-use-cases` — confirm all existing +
      new tests pass unchanged in behavior.
- [ ] Commit.

### Task A2: `client_scan_id` idempotency column + migration

**Files:**
- Modify: `shared/infrastructure/db/schema.ts` (add nullable unique
  `clientScanId: text("client_scan_id").unique()` to `scanEvents`)
- Create: Drizzle migration (via `npm run db:push` or the repo's migration
  flow — confirm which this project uses; `drizzle-kit push` is in
  `package.json`, so check whether migrations are file-based or push-based
  before assuming a migration file needs hand-authoring)
- Modify: `features/check-in/domain/ScanEvent.ts` (`RecordScanInput` gets
  an optional `clientScanId`)
- Modify: `features/check-in/infrastructure/ScanRepository.ts` (`record()`
  passes `clientScanId` through; add a `findByClientScanId` method used by
  Task A6's dedupe check)
- Modify: `features/check-in/domain/IScanRepository.ts` (interface gets
  the new method)
- Modify: `features/check-in/infrastructure/ScanRepository.test.ts`

**Steps:**
- [ ] Add the column, regenerate/push schema per this repo's existing DB
      workflow.
- [ ] Add `findByClientScanId(clientScanId: string): Promise<ScanEvent |
      null>` to the repository interface + implementation + a fake for
      tests.
- [ ] Test: recording twice with the same `clientScanId` — second call
      returns the first row, does not insert a second.
- [ ] Commit.

### Task A3: Client-side local store (`shared/offline/`)

**Files:**
- Create: `shared/offline/db.ts` — IndexedDB wrapper (guests / scanQueue /
  meta stores per spec §6.3)
- Create: `shared/offline/db.test.ts`

**Steps:**
- [ ] Decide and document the IndexedDB access approach (raw `indexedDB`
      API vs. a minimal wrapper — no new heavy dependency needed for three
      simple object stores; keep this file small and dependency-free
      unless an existing project convention says otherwise).
- [ ] Implement seed/read/write for all three stores, scoped by `eventId`.
- [ ] Implement `foldGuestBalances`-based derivation so a guest's
      `insideSeats` is always (last snapshot + locally queued scans for
      that guest) — reusing the existing pure function, not reimplementing
      the fold.
- [ ] Tests against a fake/in-memory IndexedDB shim (Vitest has no real
      IndexedDB) — same house convention as `FakeScanRepository`.
- [ ] Commit.

### Task A4: Snapshot endpoint

**Files:**
- Modify: `app/api/checkin/route.ts` (add a `GET` handler) or create a
  sibling route — decide based on keeping one composition root per the
  existing plan's stated preference; a `GET` on the same route file is
  the more consistent choice given `POST`/`PATCH` already live there.

**Interfaces:**
- Consumes: `ListGuestsWithStatusUseCase`, `GetEventStatsUseCase` (both
  existing, unchanged).
- Produces: `{ guests: GuestWithStatus[]; stats: EventStats; syncedAt:
  string }` for the session's event.

**Steps:**
- [ ] Implement `GET`, gated the same way `POST`/`PATCH` are
      (`requireDoorSession`, 401 JSON on failure — same reasoning as the
      existing route's comment about `fetch` not following `redirect()`).
- [ ] Manual check via curl with/without a valid session cookie.
- [ ] Commit.

### Task A5: Dedupe-aware commit-via-sync endpoint

**Files:**
- Modify: `app/api/checkin/route.ts` — extend `PATCH` (or add a distinct
  method/body-flag) to accept `clientScanId` and, when present, follow the
  §6.8 rule: check `findByClientScanId` first (no-op if already recorded),
  otherwise **record unconditionally** (no guard re-run) using the
  seats/direction the client already decided.
- Modify: `RecordScanUseCase` usage here — for the sync path this endpoint
  should *not* call `decideScanOutcome`'s blocking branch at all; it always
  writes what the client sent, exactly like today's `override: true` path,
  distinguished from the *live* `PATCH` (unchanged behavior, still runs
  the real guard) by the presence of `clientScanId`.

**Steps:**
- [ ] Write tests: a fresh `clientScanId` records exactly the requested
      seats/direction unconditionally, even if the server's current
      `insideSeats` would otherwise block it; a repeated `clientScanId`
      returns the original result without a second insert.
- [ ] Confirm the *live* `PATCH` path (no `clientScanId`, i.e. the existing
      online interactive commit) is untouched — same guard behavior as
      today, so this is additive, not a behavior change for the still-live
      online path.
- [ ] Commit.

### Task A6: Sync engine hook

**Files:**
- Create: `features/check-in/view-model/useOfflineSync.ts` (or
  `shared/offline/sync.ts` if it ends up feature-agnostic enough — decide
  once A3/A5 are done and the actual dependency shape is clear)
- Create accompanying test file per house convention (non-trivial derived
  state/orchestration gets a test).

**Steps:**
- [ ] Implement queue draining: FIFO, retry with capped exponential
      backoff, `online`/`offline` listeners, periodic tick while
      non-empty and tab visible.
- [ ] Implement the 401-pauses-not-drops behavior from spec §6.9.
- [ ] Implement snapshot refresh (Task A4's `GET`) on mount and on
      regaining connectivity, merged per §6.6 (server wins for guests with
      no locally-pending scan; local optimistic value wins otherwise).
- [ ] Tests: backoff timing, dedupe-safe retry, merge behavior with a
      pending local scan vs. a stale server value.
- [ ] Commit.

### Task A7: Wire `Scanner.tsx` onto the local-first path

**Files:**
- Modify: `features/check-in/ui/Scanner.tsx`
- Modify: `app/scan/page.tsx` if the initial-seed contract changes (likely
  stays the same — server still provides the first `initialGuests`/
  `initialStats`, now used to seed IndexedDB instead of just React state).

**Steps:**
- [ ] `resolveByCode`/`resolveGuest` become local lookups against Task A3's
      store (no `fetch`) — per spec §6.4.
- [ ] `commit` runs `decideScanOutcome` (Task A1) locally, updates the
      local store + React state immediately, enqueues a `QueuedScan`
      (Task A3), and triggers Task A6's sync engine — per spec §6.5.
- [ ] Remove the network-wait paths from the "happy path" entirely; keep
      a graceful degrade note in code only if the initial seed is somehow
      empty (shouldn't happen given `app/scan/page.tsx` still seeds
      server-side on load).
- [ ] Add the sync status indicator to the header (spec §6.10).
- [ ] Update/rewrite `Scanner.tsx`'s existing behavior notes (the
      code comments explaining `pausedRef`, the repeat-scan window, etc.)
      to reflect that resolve is now synchronous.
- [ ] Manual QA per spec §9: airplane-mode mid-session, scan several
      guests, re-enable network, confirm queue drains and dashboard
      converges.
- [ ] Commit.

---

## Phase B — Post-scan UX (after Phase A)

### Task B1: Instant dismiss + non-blocking success toast

**Files:**
- Modify: `features/check-in/ui/Scanner.tsx` (the `recorded` overlay
  branch and the effect that currently auto-dismisses it after 2200ms)

**Steps:**
- [ ] On a successful local commit (Task A7), dismiss the overlay/release
      `pausedRef` immediately instead of waiting out a timer.
- [ ] Add a small toast-style success indicator (guest name + direction +
      seats), auto-clearing after ~1–1.5s, non-blocking, capped stacking
      of 2 if a second scan lands before the first clears (spec §7.2).
- [ ] Component test: a recorded commit clears the blocking overlay
      immediately and shows/clears the toast on schedule.
- [ ] Manual QA: rapid consecutive scans feel immediate, camera never
      appears frozen behind a color flash.
- [ ] Commit.

### Task B2: Redesigned guest-result ("pending") card

**Files:**
- Modify: `features/check-in/ui/Scanner.tsx` (`ResultOverlay`'s "pending"
  branch, `DirectionActions`)

**Steps:**
- [ ] Add the seat-dot/pill visual for inside/outside status (spec §7.3).
- [ ] De-emphasize phone/note relative to the name/status.
- [ ] Replace the small-number-button row with a stepper once party size
      exceeds a threshold (~6) to avoid a long row of tiny buttons.
- [ ] Keep primary button position/order unchanged (muscle memory).
- [ ] Component test for the new card's rendering across the outside/
      partial/inside states.
- [ ] Manual QA on an actual phone viewport.
- [ ] Commit.

---

## Testing & sign-off checklist (spec §9)

- [ ] `npm run typecheck`, `npm run lint`, `npm test` all green.
- [ ] Domain tests: `decideScanOutcome`, `RecordScanUseCase` (unchanged
      behavior), dedupe-by-`clientScanId`.
- [ ] Offline-store tests (fake IndexedDB), sync-engine tests (backoff,
      merge, 401 handling).
- [ ] Manual: airplane-mode scan session end-to-end, reload-with-pending-
      queue resumes syncing, two-tabs-as-two-devices concurrent offline
      scan of the same guest both land honestly in the audit log.
- [ ] Manual: throttled-network pass over every route in Phase C's table,
      confirming skeletons match real layouts.
- [ ] Manual: scanner UX feel-check — no full-screen block after a
      recorded scan, guest card readable at a glance.
