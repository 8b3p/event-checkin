# Multi-Event Check-In Platform — Design Spec

Date: 2026-09-22
Status: Approved for implementation planning

## 1. Summary

Evolve the existing single-wedding check-in app into a platform for an event
hall owner who hosts many events for many customers. The owner manages a
list of events from one authenticated dashboard; each event has its own
guest list, its own door code, and its own QR-coded invitations. Door staff
scan guests in and out, with a full audit log, and can fall back to manual
search or quick-add when a guest doesn't have their code. The app moves off
SQLite onto a cloud Postgres database so it can be hosted on Vercel.

This is an evolution of the current app, not a rewrite: the core ideas that
already work (short unique codes, seats-based parties, no guest accounts,
no offline mode, one file owns the SQL) carry forward. What changes is the
data model (single event → many events) and the check-in model (one-way
arrival → two-way in/out with a full log).

## 2. Goals

- Owner can create, edit, and archive events from a dashboard, each with its
  own name, date, venue, description, door code, and optional capacity.
- Each event has its own guest list, scoped independently from every other
  event.
- Each guest gets a unique QR code, delivered two ways: a downloadable
  branded image (name + QR + plain-language instructions) and a shareable
  invitation link page — same as today, generalized per event.
- Door staff sign in with a per-event door code and land on a scan-first
  screen. Scanning (or typing a code) checks a guest in or out, seats-aware,
  with every action recorded in an immutable log.
- When a guest doesn't have their code, staff can search the guest list by
  name and manually check someone in or out, or quick-add a walk-in who
  isn't on the list at all. Both paths are distinctly logged as manual
  entries, separate from QR scans, so the owner can audit who was
  code-verified vs staff-vouched after the event.
- Runs on Vercel with a cloud Postgres database (Neon or Vercel Postgres).
- Entire product is in **Arabic**, right-to-left, and **mobile-first** —
  owner, door staff, and guests are all primarily on phones.

## 3. Non-Goals (deliberately out of scope)

- **No multi-tenant SaaS.** One owner account, many events. Not building
  per-business signup/billing/isolation.
- **No guest accounts.** An invitation link/code is the guest's credential,
  same trust model as a paper ticket, same as today.
- **No offline scanning.** The door needs connectivity. This is where
  double-entry bugs live; today's app made this call deliberately and nothing
  about multi-event changes that reasoning.
- **No payments or ticketing.** Still an RSVP/attendance tool, not a
  box-office.
- **No automated guest messaging** (SMS/email/WhatsApp API sending).
  Distribution stays manual: the owner downloads an image or copies a link
  and sends it themselves.
- **No named door-staff accounts.** Door access is a per-event shared code,
  same pattern as today, just one code per event instead of one code total.
- **No migration of existing wedding.db data.** The current database is
  treated as sample data and discarded; the new schema starts fresh.

## 4. Data Model

Postgres via Drizzle ORM, accessed through the 4-layer clean architecture
described in `docs/architecture-docs/` — feature-sliced by business domain
(`auth`, `events`, `guests`, `check-in`), each with a `domain/` (entities,
repository interfaces, use-cases) and `infrastructure/` (Drizzle-backed
repository implementations) split. See
`docs/architecture-docs/04-NEXTJS-ADAPTATION.md` for exactly how that
maps onto Next.js (no separate backend, no DI container, no SPA router).
The tables themselves are unchanged by that decision:

```
owner
  id, email, password_hash, created_at
  -- single row, dashboard login (same concept as today's settings row,
  -- split out because settings is now per-event)

events
  id, name, event_date, venue, description,
  door_code (unique), capacity (nullable),
  status ('draft' | 'live' | 'archived'),
  created_at

guests
  id, event_id (FK -> events, cascade delete),
  name, seats, phone, note, code (unique),
  source ('invited' | 'walk_in'),
  created_at

scan_events
  id, guest_id (FK -> guests, cascade delete),
  direction ('in' | 'out'),
  method ('qr' | 'manual'),
  seats, at, scanned_by, override (bool),
  created_at
```

Key design decisions:

- **`scan_events` is append-only.** A guest's current status is *derived*,
  never stored as a separate mutable flag: seats currently inside =
  sum of `in` seats minus sum of `out` seats for that guest; "inside" means
  that number is greater than zero. This is the same principle as today's
  `checkins` table, extended to two directions. It's what makes the audit
  trail trustworthy — nothing overwrites history.
- **`method` distinguishes QR scans from manual actions.** Both search-based
  check-in and walk-in quick-add produce `method: 'manual'` rows. `override`
  stays a separate flag for "let one more of the party in/out than the
  guest's current seat balance suggests" — orthogonal to how the guest was
  identified.
- **`source` on `guests`** distinguishes people the owner invited from
  walk-ins door staff added on the spot. A walk-in gets a real guest row
  (auto-generated code, so they could later be given a QR too if the owner
  wants), just flagged differently for reporting.
- **Everything guest/scan-related is scoped by `event_id`** (directly on
  `guests`, transitively via `guest_id` on `scan_events`). Every query in the
  data layer takes an event id; Drizzle's typed schema makes it a compile
  error to forget it.

## 5. Auth & Access

- **Owner**: single account, email + password, same login flow as today
  (bcrypt hash, JWT session cookie via `jose`). Signing in lands on the
  **event list** (new home page) instead of a single dashboard.
- **Door staff**: no account. Visiting `/door`, entering an event's door
  code signs them into a session scoped to that one event and redirects to
  `/scan`. They cannot see other events, the guest CSV, or settings.

## 6. Owner Dashboard

- **Event list** (new home page): all events, status, quick stats (invited /
  arrived / currently inside), create/archive actions.
- **Per-event dashboard**: stats (invited, arrived, currently inside),
  arrivals-over-time chart (existing component, reused as-is), capacity
  warning banner if currently-inside approaches the event's capacity.
- **Guest management**: add one at a time or paste a list (existing import
  flow, scoped to the event), per-guest QR card and invitation link, CSV
  export of the guest list plus the full scan log for post-event
  reconciliation.
- **Event settings**: name, date, venue, description, door code, capacity.
  **Duplicate event** action: clones an event's settings (not its guests)
  so a repeat customer doesn't start from scratch.
- **Archive**: marks an event read-only and moves it out of the default
  event list view, without deleting data.

## 7. Door Scanner

Scan-first screen, same visual language as today (full-bleed camera view,
color-flash result overlay, manual code entry fallback).

**Normal flow**: scan or type a code → resolve the guest → show current
derived status → one primary action:
- Outside → "Check in" (seats-aware, same override-on-mismatch pattern as
  today's arrival flow)
- Inside → "Check out" (seats-aware; staff can adjust the count if the party
  is leaving split up, same override pattern applied to exits)

**Unknown code**: "Not on the list" overlay, same as today, now with a
"Can't scan? Search by name" link so staff don't have to leave the scanner
to recover.

**Manual check-in (no code)**: a search view (name search, filter by
in/outside/not-arrived) reachable from the scanner's idle state or from any
failed scan. Tapping a result shows the same status + Check In/Out action as
a QR resolve. Search results show seats/phone/note alongside the name so
staff can tell same-named guests apart before acting. Every action taken
here is logged with `method: 'manual'`.

**Walk-in quick-add**: from the same search view, "Not finding them? Add a
walk-in" creates a new guest row (name, seats, `source: 'walk_in'`) and
immediately checks them in as a manual entry — fully traceable to which
door code/session added them.

## 8. QR Guest Cards & Distribution

- `/events/[id]/guests/[guestId]/card` renders a PNG via Next.js
  `ImageResponse` (`next/og`): guest name at top, QR code centered,
  plain-language instructions below aimed at someone who has never used a
  QR code before ("Show this screen at the door. A screenshot works too.
  No app needed.").
- The existing `/i/[code]` guest-facing link page is kept as-is — the image
  and the link are two views of the same invitation, and the owner chooses
  which to send (WhatsApp image, copied link, etc).
- **Bulk export**: server-side ZIP of every guest's card image for an event,
  for owners who want to print physical cards or send them all at once.

## 9. Hosting & Deployment

- **Database**: Postgres, hosted on Neon or Vercel Postgres (serverless,
  connection-pooled, works with Vercel's request model — unlike the current
  SQLite file, which explicitly cannot run on Vercel).
- **App**: Vercel, replacing the current Railway/Fly/VPS guidance built
  around a persistent SQLite volume.
- `NEXT_PUBLIC_APP_URL` requirement carries forward unchanged — it's baked
  into every QR code and invite link, must be the real deployed URL.
- `DATABASE_PATH` env var is replaced by a `DATABASE_URL` connection string.

## 10. Localization & Mobile-First UI

- **Arabic-only UI**, no language toggle or i18n framework. Every
  user-facing surface — owner dashboard, door scanner, guest invitation
  page, QR card image — is in Arabic. This is a deliberate simplicity
  choice: hardcoded Arabic strings, not a translation layer, since there is
  currently one target language. (If English is ever needed for the owner's
  own convenience, that's a later addition, not part of this build.)
- **RTL layout throughout**: `dir="rtl"` on `<html>`, Tailwind's logical
  properties (`ms-`/`me-`/`ps-`/`pe-` instead of `ml-`/`mr-`/`pl-`/`pr-`) so
  spacing and icons mirror correctly instead of just flipping text.
- **Arabic-supporting typeface** replaces the current Georgia/Inter pairing
  (neither has Arabic glyphs) — e.g. Cairo or IBM Plex Sans Arabic for both
  the display and body font roles, keeping the existing warm/night theme
  and color system as-is.
- **Numerals**: stats, counts, and dates use Western digits (0-9), matching
  common practice in modern Arabic business apps — this is a default choice
  to confirm during implementation, not a hard requirement. Door codes and
  guest codes keep their existing fixed alphabet (`lib/codes.ts`) unchanged,
  since those are typed/read-aloud tokens, not language-dependent text.
- **Mobile-first is not just the scanner.** The current app already
  designed `/scan` mobile-first (full-bleed camera, bottom sheet actions).
  That same discipline extends to the owner dashboard, event list, and
  guest list: single-column layouts, large touch targets (44px minimum),
  primary actions reachable with a thumb, tables replaced by stacked cards
  on narrow screens. Desktop use is a secondary, not primary, breakpoint.
- **QR card images and the guest invitation page** carry Arabic instructions
  written for someone who has never used a QR code, per the original goal —
  short, plain sentences, no technical jargon.

## 11. Testing Notes for the Implementation Plan

- Derived status/seat-balance logic (folding `scan_events`) is the
  highest-risk correctness area — needs focused unit tests, same way the
  original arrival-counting logic needed care.
- Event-scoping needs a test that guests/scans from one event never leak
  into another event's list, dashboard stats, or search results.
- QR image generation and the search/quick-add flows both write to the same
  `scan_events` log as normal scans — tests should confirm all three paths
  (QR, manual search, walk-in) produce consistent, correctly-tagged rows.

## 12. Migration Path from Current App

The current single-wedding app is being replaced, not extended in place:

- `data/wedding.db` is discarded (explicit decision — treated as sample
  data, not production data to preserve).
- `lib/db.ts` (better-sqlite3, single-event schema) is replaced by a
  `lib/db/` module (Drizzle schema + scoped query functions).
- `better-sqlite3` dependency is dropped; `pg`/Drizzle and Drizzle's
  migration tooling are added.
- Existing UI routes (`/scan`, `/guests`, `/guests/[id]`, `/door`,
  `/setup`, `/i/[code]`) are restructured to be event-scoped
  (`/events/[id]/...`), with a new top-level event list replacing the old
  single dashboard home page.
