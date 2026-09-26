# Offline-First Door & Scanner, Post-Scan UX, and App-Wide Loading States — Design Spec

Date: 2026-09-26
Status: Draft — pending review before an implementation plan is executed

## 1. Summary

Three related changes to the door-staff experience and the owner dashboard:

- **A. Offline-first door + scanner.** Scanning a guest today costs two
  network round trips (resolve, then commit) on the critical path of every
  single scan. On slow/flaky venue Wi-Fi this is the "wait for an API call"
  problem. The fix: the scanner works off a local cache and a local write
  queue, resolves and commits instantly against local state, and syncs to
  the server in the background whenever connectivity is available.
- **B. Post-scan UX.** After a check-in/check-out is committed, staff should
  land back on the camera immediately, with a small non-blocking
  success indicator instead of the current full-screen 2.2s color overlay.
  The guest-info card shown before that action (the "pending" overlay) gets
  a visual pass so it reads faster at a glance.
- **C. Loading states.** Add consistent loading affordances everywhere data
  is fetched or an action is pending — the owner dashboard (event list,
  per-event dashboard, guest list/detail, settings) and the scanner.

## 2. Reversing a documented decision — read this first

This repo's own specs currently rule offline mode out on purpose:

> **No offline scanning.** The door needs connectivity. This is where
> double-entry bugs live; today's app made this call deliberately and
> nothing about multi-event changes that reasoning.
> — `docs/superpowers/specs/2026-09-22-multi-event-checkin-design.md` §3

> No offline mode — the app assumes connectivity at the door; a lost
> connection is a visible error, not a silent local queue.
> — `docs/superpowers/plans/2026-09-23-door-scanner-checkin.md`, Global Constraints

The user has asked to reverse this. That's a legitimate product call, but
the whole point of the old constraint was to avoid **double-entry bugs** —
the same physical scan getting recorded twice, or two devices silently
disagreeing about who's inside. §6.8 below is the direct answer to that
concern: every locally-queued scan carries a client-generated idempotency
key so a retried request can never double-record, and the reconciliation
rule is designed so two devices can never silently overwrite each other's
decisions. If this spec is approved, these two documents should be amended
to point at it instead of contradicting it (Task 0 in the implementation
plan).

## 3. Goals

- A scan (camera or manual code) resolves the guest and shows their status
  with **no network wait** — the UI never blocks on a fetch to show the
  pending guest card.
- Committing a check-in/check-out **applies instantly** to the local UI
  (stats, guest list, overlay) and is durably queued for sync, surviving an
  app reload or a full loss of connectivity for the rest of the event.
- Sync happens automatically in the background whenever the device is
  online, with retries, and never loses a queued action.
- No scan is ever recorded twice, regardless of retries, reloads, or
  duplicate network delivery.
- Staff always know, at a glance, whether everything has synced.
- After a committed action, staff are back on the camera in well under a
  second, with a lightweight, dismiss-free success signal (sound/vibration
  stay as they are today).
- The guest-info card shown mid-scan is easier to read at a glance.
- Every page that fetches data or runs an action shows a proper loading
  state — skeletons on navigation, spinners/disabled state on in-flight
  actions — nowhere in the app should look frozen or unresponsive.

## 4. Non-goals

- **Not a full installable PWA in this pass.** This spec makes the *data
  layer* offline-first (cached reads, queued writes, background sync) for a
  `/scan` page that has already been loaded once while online. It does
  **not** add a service worker / app-shell precaching so that a cold reload
  of `/scan` works with zero prior connectivity. See §6.12 — flagged as a
  candidate follow-up, not built here, because it's a materially different
  and riskier piece of work (service worker lifecycle, cache versioning,
  interaction with this custom Next.js build) than the queue/sync engine
  the actual complaint is about.
- **Not changing the seats-aware guard's business rules** (`RecordScanUseCase`
  logic) — same rules, just evaluated locally first and never re-litigated
  by the server after the fact (§6.8).
- **Not adding multi-device presence/collision UI** (e.g. "someone else is
  scanning this guest right now"). Out of scope; see §6.11 for how
  concurrent-device conflicts are still handled safely without it.
- **Not touching guest CSV export, QR card generation, or auth flows**
  beyond what §6.9 needs for session handling while offline.
- **Not a redesign of the color/tone system** (`good`/`warn`/`bad`) — B and
  C reuse existing tokens (`app/globals.css`), not new ones.

## 5. Workstream breakdown

| Workstream | Touches | Depends on |
| --- | --- | --- |
| A. Offline-first door & scanner | `features/check-in/*`, `app/scan/*`, `app/api/checkin/*`, new `shared/offline/*`, DB migration | Independent |
| B. Post-scan UX | `features/check-in/ui/Scanner.tsx`, feedback module | Should land after A (the "recorded" result now comes from local state, not a fetch) |
| C. Loading states | `shared/component/ui/*`, every route's `loading.tsx`, every form view-model/UI pair | Independent of A/B, can ship first or in parallel |

Recommended build order: **C is independent and lowest-risk — do it
first or in parallel. A is the largest piece and B is a small change that
sits on top of A's result shape**, so A → B.

---

## 6. Workstream A: Offline-first door & scanner

### 6.1 Today's flow (recap)

1. Camera decodes a code → `POST /api/checkin` (`resolveByCode`) → server
   looks up the guest, computes `insideSeats` from `scan_events`, returns
   `canCheckIn`/`canCheckOut` → overlay shows "pending".
2. Staff taps a direction/seat count → `PATCH /api/checkin` (`commit`) →
   server re-runs the guard (`RecordScanUseCase`), writes a row, returns the
   new `insideSeats` + event `stats` → overlay shows "recorded" for 2.2s.

Both steps are on the scanning critical path. Step 1 is pure read logic
over data the client mostly already has (`initialGuests` includes `code`,
`insideSeats`). Step 2 is a write that must eventually reach the server,
but doesn't need to happen *before* staff sees a result.

### 6.2 Target architecture

- **Local-first read model**: the door session's guest list + derived
  `insideSeats` per guest is held in an on-device store (IndexedDB), seeded
  from the server on page load and refreshed periodically/on reconnect.
  Resolving a scanned code or a manual guest becomes a synchronous local
  lookup — no fetch on the resolve path at all.
- **Optimistic local write + durable queue**: committing a check-in/out
  runs the existing seats-aware guard logic **locally**, updates the local
  guest cache and stats immediately, shows the result overlay immediately,
  and appends the action to a durable local queue tagged with a
  client-generated id.
- **Background sync engine**: drains the queue over the network whenever
  online, in order, with retry/backoff, using the client-generated id as an
  idempotency key so retries can never double-record.
- **Reconciliation, not re-validation**: once staff has made a decision
  (queued a scan), the server's job on sync is to durably record it, not to
  re-run the guard against newer server state and possibly reject a
  decision staff already acted on with the guest standing right there. See
  §6.8 — this is the key mechanism that keeps this safe against the
  original double-entry concern.

### 6.3 Local store (client-side, IndexedDB)

New module: `shared/offline/db.ts` (or similar — exact naming decided at
implementation time to match `shared/lib` vs a new `shared/offline`
convention call). One IndexedDB database, scoped and keyed by `eventId` so
a device that's used for two different events never mixes their data:

```
db: "checkin-offline-v1"
├── guests            (keyPath: id)          — GuestWithStatus rows for the current event
├── scanQueue          (keyPath: clientScanId) — pending/failed mutations, FIFO order by createdAt
└── meta               (keyPath: key)          — { eventId, lastSyncedAt, stats: EventStats }
```

`scanQueue` entry shape:

```ts
type QueuedScan = {
  clientScanId: string;      // crypto.randomUUID(), the idempotency key
  guestId: number;
  direction: ScanDirection;
  method: ScanMethod;
  seats: number;
  createdAt: number;         // Date.now(), for ordering + display only
  status: "pending" | "syncing" | "synced" | "failed";
  attempts: number;
  lastError?: string;
};
```

A guest's `insideSeats` in the local `guests` store is always the *result
of folding every scan this device knows about* — synced ones (from the
last server snapshot) plus this device's own still-pending queued ones.
That fold is exactly `foldGuestBalances` (already a pure function in
`features/check-in/domain/foldGuestBalances.ts`) — reused as-is on the
client, so the derived-status math never drifts between server and
client.

### 6.4 Resolve path (fully local)

`resolveByCode(code)` and `resolveGuest(guestId)` stop calling
`fetch("/api/checkin", { method: "POST" })`. Instead:

1. Normalise the code (`normaliseScan`, existing).
2. Look up the guest by `code` (or `id`) in the local `guests` store.
3. Not found → same "unknown" overlay + `signalBad()` as today, with the
   same "search by name" escape hatch.
4. Found → compute `canCheckIn`/`canCheckOut` from the guest's current
   local `insideSeats` and `seats` (same arithmetic `POST /api/checkin`
   does today, now inlined client-side) → "pending" overlay, no wait.

This alone removes one full network round trip from every scan, online or
not.

### 6.5 Commit path (optimistic, queued)

`commit(resolved, method, direction, seats, override)`:

1. Run the **shared guard logic** (see below) locally against the current
   local `insideSeats` for that guest.
2. `blocked` (and not overridden) → same "blocked" overlay as today,
   offering the override button — no network involved, this decision is
   entirely local and instant.
3. `recorded` → update the local guest's `insideSeats`, update local
   `stats`, show the result (§7 — the new lightweight non-blocking
   version), and enqueue a `QueuedScan` row with a fresh `clientScanId`.
4. Kick the sync engine (fire-and-forget) if online; if offline, the queue
   just grows and the header's sync indicator (§6.10) reflects the pending
   count.

**Shared guard logic**: `RecordScanUseCase`'s guard math (the "clamp to
remaining seats" / "blocked unless overridden" rules) must not be
duplicated by hand on the client — that's exactly the kind of drift that
causes the double-entry-adjacent bugs the old spec worried about. Extract
the pure decision function (guest's current `insideSeats`, `partySeats`,
`direction`, requested `seats`, `override` → `{ outcome, seats, insideSeats
}`) out of `RecordScanUseCase` into a plain function in
`features/check-in/domain/` with no repository dependency, and have both
`RecordScanUseCase` (server) and the new client resolver call it. One
implementation, two callers — same pattern the codebase already uses for
`foldGuestBalances`.

### 6.6 Sync engine

A small client-side module (`shared/offline/sync.ts` or
`features/check-in/ui/useOfflineSync.ts` depending on where it's wired —
decided at implementation time), responsible for:

- Listening for `online`/`offline` browser events.
- On `online`, and periodically while the queue is non-empty (e.g. every
  8–10s) and the tab is visible, draining `scanQueue` in FIFO order:
  - Mark the row `syncing`.
  - `POST` it to a new sync endpoint (§6.7) with its `clientScanId`.
  - `200` → mark `synced`, remove from the queue, reconcile local `stats`/
    `insideSeats` for that guest with the server's authoritative response
    (should already match, since the server no longer re-derives a
    different outcome — see §6.8).
  - Network failure → leave `pending`, increment `attempts`, back off
    (capped exponential, e.g. 2s/4s/8s/… up to a ceiling) and retry on the
    next tick.
  - `401` → session expired while offline; **do not drop the queued item**.
    Surface "sign back in to sync" via the existing `/door` redirect path,
    but only for the interactive resolve/commit calls, never for the
    background sync loop dropping data.
- A full guest-list + stats refetch (§6.3's `meta.lastSyncedAt`) on `/scan`
  mount and on regaining connectivity, merged so that any guest with no
  locally-queued pending scan gets the server's value (picks up scans made
  by *other* devices), while a guest with a still-pending local scan keeps
  the local optimistic value until that scan syncs.

### 6.7 Server changes

- **Migration**: add a nullable, unique `client_scan_id text` column to
  `scan_events` (`shared/infrastructure/db/schema.ts` + a Drizzle
  migration). This is the idempotency key. A `POST` that repeats an
  already-seen `client_scan_id` is a no-op that returns the existing row's
  result — not a new insert, not an error.
- **New/changed endpoints** (exact routing decided in the plan — likely
  extending `app/api/checkin/route.ts` rather than a new route file, to
  keep one composition root):
  - **Commit-via-sync**: like today's `PATCH`, but takes `clientScanId` and
    **records unconditionally** (see §6.8) instead of re-running the
    blocking guard — dedupes on `clientScanId` first.
  - **Snapshot**: a lightweight `GET` returning `{ guests: GuestWithStatus[],
    stats: EventStats, syncedAt }` for the session's event — used for the
    periodic/reconnect refresh in §6.6. (`ListGuestsWithStatusUseCase` +
    `GetEventStatsUseCase` already do this read-side work server-side;
    this is a thin new Route Handler wrapping both, not new domain logic.)
  - The existing synchronous `POST` (resolve) and interactive `PATCH`
    (commit-while-online, still used for the very first scan before a
    local cache exists, or as a graceful degrade path — see below) can
    stay as they are; they're just no longer on the *typical* critical
    path once the local cache is warm.

### 6.8 Reconciliation semantics — the double-entry answer

This is the load-bearing design decision, called out explicitly because
it's the direct rebuttal to the spec this reverses:

- **A queued scan is a decision staff already made and acted on** — they
  told a guest "go on in" based on what the screen showed at that moment.
  By the time it syncs, server-side state may have moved (another device
  recorded something for the same guest in the meantime). Re-running the
  guard at sync time and rejecting the scan would silently disagree with
  an action staff already took in the physical world — worse than just
  recording it.
- So: **the sync endpoint never blocks a queued scan.** It records exactly
  the `seats`/`direction` the device queued, unconditionally (equivalent to
  today's `override: true` path), the *first* time it sees that
  `client_scan_id`. Any later delivery of the same `client_scan_id`
  (retry, duplicate background-tick, service worker replay) is a pure
  no-op — this is what prevents the same physical tap from ever becoming
  two rows.
- **What this trades away**: the "already full, are you sure?" block can
  no longer fire retroactively for an offline-queued scan the way it fires
  today for a live one — by definition, the guard already ran against the
  best information staff had *at the moment of the tap*, live or not. Two
  devices independently admitting the same party while both offline is a
  real possibility this design accepts (each device's guard runs against
  its own last-known state); the audit log still records both scans
  faithfully (this is exactly what `scan_events` being append-only and
  never overwritten is *for* — see spec §4 of the multi-event design). A
  "party inside > party seats" state that this produces is a data
  reconciliation question for the owner's audit view, not something the
  scanner UI should paper over with a false "blocked".
- **What this does not weaken**: the *live, online* guard is unchanged —
  when the device is online and the local cache is fresh, staff still sees
  the same "already full, override?" prompt they see today, because the
  local guard runs against accurate local state that's itself kept fresh
  by the periodic snapshot sync. This only changes behavior in the
  window where a device made a decision on stale/offline information.

### 6.9 Auth/session handling while offline

- The door session is a JWT cookie (`shared/lib/session-cookie.ts`),
  already independent of any specific request; it doesn't need "offline
  support" itself. What needs handling:
  - **Local store is namespaced by `eventId`** (from the session), so it
    never leaks another event's guest list into a device reused for a
    different event, and a queued-but-unsynced scan stays associated with
    the right event even across a logout/login cycle on the same device.
  - **Session expiring while the device is offline**: the interactive
    resolve/commit calls already redirect to `/door` on `401` (existing
    behavior, kept). The *background sync loop* must not treat `401` as
    "drop the queue" — it pauses syncing (keeps retrying, or waits for a
    fresh sign-in) and the sync indicator (§6.10) should say so, rather
    than silently discarding queued work.
- **Cold start with zero cached data and zero connectivity** (device never
  loaded `/scan` while online, or IndexedDB was cleared): explicitly out
  of scope per §4 — the page load itself still requires the server round
  trip it does today (`requireDoor()` + the three server-side use-cases in
  `app/scan/page.tsx`). This is a real gap this pass leaves open;
  documented here so it isn't rediscovered as a surprise later.

### 6.10 Sync status indicator

A small, unobtrusive element in the `/scan` header (next to the
inside/invited seat count) — not a modal, never blocks scanning:

- **All synced** (queue empty, last sync recent): no indicator, or a
  quiet "متصل" dot.
- **Pending** (queue non-empty, online): "N بانتظار المزامنة" with a subtle
  spinner — informational only.
- **Offline** (browser reports offline, or sync has been failing):
  "غير متصل — سيُزامَن لاحقًا" — reassures staff their scans aren't lost.
- **Sync stuck on auth** (§6.9): a slightly more insistent variant prompting
  re-entry of the door code, since this one does need staff attention
  eventually (though scanning itself keeps working locally in the
  meantime).

### 6.11 Edge cases

| Case | Behavior |
| --- | --- |
| Same scan submitted twice (network retry, double-tap protected by `pausedRef` already) | Deduped server-side by `client_scan_id`; local queue also only ever enqueues once per commit call |
| Two devices, both offline, scan the same guest fully in | Both succeed locally; both sync as separate `scan_events` rows (§6.8); resulting over-capacity state is a reporting/audit concern, not a scanner-blocking one |
| Device offline for the whole event, syncs everything at the end | Queue drains in original FIFO order once online; `at` timestamp is server-assigned (`defaultNow()`, already true today) so ordering in the audit log reflects sync order, not scan order — acceptable, but worth a one-line note in the queue UI ("قد يختلف وقت التسجيل عن وقت المزامنة") if the plan has time for it |
| IndexedDB unavailable (private browsing in some browsers) | Fall back to an in-memory queue for that session with a persistent warning banner that durability isn't guaranteed — never silently pretend it's durable |
| Local queue very large (hundreds of scans) | Cap is generous (thousands), not a real constraint for a single event; no pruning needed beyond removing synced rows |
| Staff logs out with items still pending | Queue is not tied to the session cookie's lifetime — it persists in IndexedDB under the event id and keeps trying to sync (as long as a valid session/cookie exists to authenticate the sync call); logging back in as the same event resumes draining it |
| Owner views the dashboard while door staff has unsynced scans | Dashboard reads server state only (unchanged) — it will lag behind the door device until that device syncs; this is inherent to offline-first and acceptable per the goals in §3 |

### 6.12 Open decision: full PWA / offline page load

Not building this now (§4), flagging here so it's a conscious choice, not
an oversight: if venues regularly have **zero connectivity at door-open
time** (not just flaky connectivity mid-event), `/scan` itself needs a
service worker precaching the app shell so the page can load with no
network at all. That's materially more infrastructure (manifest, SW
lifecycle, cache versioning, interaction with this repo's non-standard
Next.js build per `AGENTS.md`) than the queue/sync engine above, which
only needs the page to have loaded successfully at least once. Revisit as
a separate spec if that turns out to be a real scenario.

---

## 7. Workstream B: Post-scan UX

### 7.1 Today

- `commit()` succeeds → overlay switches to `kind: "recorded"` → a
  **full-screen color flash** (`bg-good`) with the guest's name and
  "checked in/out N" — blocks the whole viewport, including the camera
  feed underneath — for a fixed 2200ms, then auto-dismisses back to the
  camera.
- Scanning is already effectively paused for that whole window
  (`pausedRef` stays true until dismiss).

### 7.2 New "recorded" behavior

- On a successful commit (now instant/local per Workstream A), the overlay
  is **dismissed immediately** — camera view is live again right away,
  `pausedRef` released immediately so the very next guest can be scanned
  with no artificial delay.
- A **small, non-blocking success indicator** appears over a corner of the
  camera view (e.g. a toast near the top or bottom, a checkmark that
  scales in and fades out) showing the guest's name + direction/seats,
  auto-clearing after roughly 1–1.5s. It must not intercept taps on the
  camera area and must not stack awkwardly if a second scan completes
  before the first toast clears (either replace-in-place or a small
  stacked queue capped at 2).
- Sound/vibration (`signalGood()`) unchanged.
- `recent` list (the last-3 log under the manual-entry field) unchanged.
- **Blocked** and **unknown** overlays are unchanged in *behavior*
  (they still require a tap — a decision is needed), but get the same
  restyle pass as the pending card (§7.3) for visual consistency.

### 7.3 Redesigned guest-result ("pending") card

Same information, clearer hierarchy — concrete requirements (exact visual
polish is an implementation-time call, not pinned down pixel-by-pixel
here):

- Guest name stays the largest element.
- Status becomes a **visual seat indicator**, not just a text fraction —
  e.g. a row of seat dots/pills (filled = inside, hollow = outside) beside
  or below the `insideSeats/seats` text, so "3 of 4 arrived, one still
  outside" reads in under a second.
- Phone/note stay as secondary lines, de-emphasized relative to today.
- The seat-count picker (today's row of small number buttons for "check in
  fewer") gets a cleaner treatment for large parties — e.g. a stepper
  instead of N separate buttons once the party is larger than ~6, so the
  overlay doesn't get a long scrolling row of tiny buttons.
- Primary action button stays the single largest tap target on the
  screen, unchanged position/order (in above out, as today) so staff's
  muscle memory carries over.

### 7.4 Consistency

`Overlay`/`ResultOverlay`/`DirectionActions` in `Scanner.tsx` are the only
things touched; no new shared component is required unless the toast in
§7.2 is judged reusable elsewhere (it isn't needed anywhere else today, so
default to keeping it local to `features/check-in/ui/`).

---

## 8. Workstream C: Loading states

### 8.1 Audit of current gaps

- **No `loading.tsx` anywhere** in `app/` — every route is a server
  component doing `await` data fetches with zero Suspense fallback; a slow
  DB query currently just leaves the browser on a blank/previous screen
  until the whole page is ready.
- **No shared `Spinner`/`Skeleton` primitive** in `shared/component/ui/`.
- **`Button` has no built-in loading/pending affordance** — every form
  today hand-rolls its own `disabled={pending}` + text swap
  (`DoorForm`'s `"جارٍ الدخول…"` is a good existing example), inconsistently:
  some forms show a text swap, some just disable, some do neither. Needs
  an audit pass across all `useActionState`/`useTransition` call sites
  (`features/*/view-model/*`, `features/*/ui/*Form.tsx`,
  `DeleteGuestButton.tsx`, `ArchiveEventButton.tsx`,
  `DuplicateEventButton.tsx`) to make this consistent everywhere rather
  than page-by-page guesswork.
- **Scanner** already has a `busy` flag disabling the action buttons during
  a commit — this mostly *disappears* as a concern once Workstream A makes
  commits instant/local; what's left is a loading affordance for the
  initial page load (before `initialGuests`/`initialStats` arrive) and for
  the sync indicator (§6.10, which is itself a loading-adjacent state).

### 8.2 Shared primitives to add

- `shared/component/ui/spinner.tsx` — small inline spinner (SVG, matches
  existing icon usage / no new icon library per house convention).
- `shared/component/ui/skeleton.tsx` — a generic pulsing placeholder block,
  composed into page-specific skeleton layouts (not one generic
  "loading card" reused everywhere — each skeleton should roughly match
  the shape of what it's replacing, same principle the empty-states
  already follow).
- `Button` gets an optional `isLoading` prop: swaps in the shared spinner,
  keeps the button's width stable, forces `disabled` — one place this
  logic lives instead of N hand-rolled versions. Every existing manual
  `disabled={pending}` + text-swap call site migrates to it for
  consistency (kept as a follow-on cleanup, not silently left half-done).

### 8.3 Per-route loading states

Route-level `loading.tsx` (Next.js App Router convention — confirm exact
behavior against `node_modules/next/dist/docs/` per `AGENTS.md` before
implementing, since this build may differ from stock Next) for every
segment that fetches on the server:

| Route | Skeleton shape |
| --- | --- |
| `/` (event list) | Grid of card-shaped placeholders matching `EventListPage`'s grid |
| `/events/[id]` | Stats row + chart placeholder |
| `/events/[id]/guests` | List-row placeholders matching `GuestListPage` |
| `/events/[id]/guests/[guestId]` | Detail-card placeholder |
| `/events/new`, event settings | Form-field placeholders |
| `/scan` | Full-bleed dark placeholder matching the night theme, so the transition into the real scanner isn't a jarring light→dark flash |
| `/door`, `/login`, `/setup` | Minimal — these are already near-instant static forms; low priority |

### 8.4 Action pending-states

Sweep every mutating form/button and confirm each one, on submit:
disables itself, shows the shared spinner via `Button`'s new `isLoading`,
and (where relevant) shows inline text like the existing DoorForm pattern.
Specifically: `AddGuestForm`, `EditGuestForm`, `ImportGuestsForm`,
`CreateEventForm`, `EventSettingsForm`, `DeleteGuestButton`,
`ArchiveEventButton`, `DuplicateEventButton`, `LoginForm`, `SetupForm`,
`AddWalkInForm`.

### 8.5 Scanner-specific

- Initial `/scan` load: covered by §8.3's route-level skeleton.
- Sync indicator (§6.10) *is* this workstream's scanner-side loading state
  — implemented once, referenced from both specs.

---

## 9. Testing strategy

- **Domain layer** (highest priority, per this repo's existing testing
  convention — `docs/architecture-docs/02-CONVENTIONS.md`): unit tests for
  the extracted shared guard function (§6.5) covering the same cases
  `RecordScanUseCase`'s existing tests do, called from both call sites;
  unit tests for the sync-endpoint's dedupe-by-`client_scan_id` behavior
  (first delivery records, repeat delivery is a no-op returning the same
  result).
- **Client-side offline logic**: unit tests for the local resolve/commit
  functions against a fake/in-memory IndexedDB-shaped store (no real
  IndexedDB in Vitest) — same fake-repository pattern this repo already
  uses (`FakeScanRepository` in `check-in-use-cases.test.ts`).
- **Sync engine**: tests for retry/backoff behavior and for the
  reconciliation rule in §6.8 (a queued scan's local `insideSeats` guess
  vs. the server's returned value after sync).
- **Manual QA**: airplane-mode a device mid-event, scan several guests
  in/out, re-enable connectivity, confirm the queue drains and the owner
  dashboard converges to the same numbers; confirm a killed/reloaded tab
  with pending items resumes syncing from IndexedDB.
- **UI**: component test for the new toast/success indicator (§7.2) and
  for `Button`'s `isLoading` state (§8.2).

## 10. Open decisions needing a decision before/while planning

1. **§6.12** — full offline-capable page load (service worker) is treated
   as out of scope for this pass. Confirm that's right, or say if
   zero-connectivity-at-open is a real scenario worth building now.
2. **§6.8's trade-off** — accepting that two offline devices can both admit
   the same over-capacity party, recorded honestly rather than silently
   blocked after the fact. Confirm this is the right call for this
   product (it matches "better to record the truth than lose an action",
   but it is a real behavior change from today's always-live guard).
3. **Exact visual treatment** of the toast (§7.2) and the redesigned guest
   card (§7.3) — this spec pins down requirements, not pixels; fine to
   leave to implementation-time taste, but flagging in case there's a
   specific look in mind.
