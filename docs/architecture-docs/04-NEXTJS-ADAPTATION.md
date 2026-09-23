# Decision Record: Adapting the 4-Layer Architecture to Next.js

**Context.** [`01-ARCHITECTURE.md`](./01-ARCHITECTURE.md) through
[`03-STACK-AND-RATIONALE.md`](./03-STACK-AND-RATIONALE.md) describe a React
SPA: client-side routing, a decorator-based DI container (Inversify), and a
frontend that only reaches the backend through a generated OpenAPI client.
This project is a single Next.js (App Router) application with **no
separate backend** — Server Components and Server Actions call the database
directly. There is no network boundary to generate a client against, and no
SPA router to wire.

**Decision.** Adapt, not replace. The layering and dependency-direction
rules are followed exactly: `ui → view-model → domain ← infrastructure`,
one-way, `domain/` framework-free, feature-sliced by business domain rather
than by route. Three SPA-specific pieces are dropped, each for a concrete
reason tied to this stack:

| Dropped | Why |
| --- | --- |
| DI container (Inversify) | [`03-STACK-AND-RATIONALE.md`](./03-STACK-AND-RATIONALE.md) itself warns that decorator-based auto-resolution needs `design:paramtypes` reflection metadata, which only a full `tsc`-emit build produces — Next.js compiles with SWC, so this would silently never work. There is also no runtime need to swap implementations (no browser env, no mock/live toggle), which is the other reason a container earns its keep. |
| Generated OpenAPI client (`api/generated/`) | Nothing generates an OpenAPI contract here — Server Actions and Route Handlers call Postgres in the same process. The "generated backend client" role is filled by the Drizzle schema + query builder instead: still typed, still the only thing `infrastructure/` is allowed to import for data access. |
| Client-side router (React Router) | Next.js's file-system App Router fills the "route tree, routing only" role the doc already describes — it *is* the "server-rendered framework with its own loader convention" the doc names as a legitimate exception (§Routing, `01-ARCHITECTURE.md`). |

**What's kept, and how it maps:**

- **Feature slicing by business domain**, not by route or screen — same as
  the doc. This project's domains (so far): `auth`, `events`, `guests`,
  `check-in`.
- **`domain/` use-case classes**, one public `execute()` method, named
  `<Verb><Noun>UseCase`. Orchestration and business rules live here.
  Constructed directly (no container) — see composition root, below.
- **Repository interfaces in `domain/`, implementations in
  `infrastructure/`.** The implementation talks to Postgres via Drizzle;
  the interface and every use-case that depends on it stay framework-free
  and swappable for a hand-written fake in tests.
- **`shared/`** for cross-feature code, same intent as the doc: DB
  connection plumbing that every feature's infrastructure needs
  (`shared/infrastructure/db/`), and Next.js-specific glue that isn't any
  one feature's business logic (`shared/lib/`).

**No DI container — the composition root instead.** Every place the doc
would resolve from a container, this project constructs directly, in
exactly one kind of place: a Server Action or a Route Handler (the
composition root — the Next.js analogue of "outermost layer that's allowed
to wire concrete things together"). Each feature's `infrastructure/`
exposes a small factory (e.g. `makeEventRepository(): IEventRepository`) so
the construction call at the composition root reads the same way a
container resolution would, without decorator metadata or a binding file.
**Nothing in `ui/` ever constructs a repository or use-case** — that rule
from the original doc is unchanged; only *how* construction happens differs.

**No view-model hooks for server-rendered reads.** A Server Component
that only reads data (e.g. the event list page) calls a use-case directly
and awaits it — there is no client/server boundary for it to cross, so a
`use<Name>ViewModel` hook would only add indirection with nothing to
bridge. `view-model/` hooks are used exactly where the doc's own logic for
them applies: **interactive Client Components** (the door scanner, guest
search, forms) that need client state and call back into a Server Action.
This is the documented exception, recorded rather than defaulted into.

**Cross-feature domain dependencies are allowed through interfaces.** Door
login needs to resolve an event by its door code — that's the `events`
feature's data, not `auth`'s. `features/auth/domain/use-cases/
AuthenticateDoorUseCase.ts` takes an `IEventRepository` (from
`features/events/domain`) as an explicit dependency, same as it takes its
own `ISessionRepository`. This is a domain-to-domain dependency on an
*interface*, which keeps both sides framework-free and testable with
fakes; only the composition root knows which concrete repository fulfills
it.

**Testing strategy (extends `02-CONVENTIONS.md` → Testing for this
project):**

- **Domain (use-cases, pure helpers):** unit tests with hand-written fake
  repositories, no database — exactly as documented. The highest-risk logic
  in this app (folding a guest's scan history into an in/out balance) is a
  pure domain helper for exactly this reason: it needs zero framework or
  database to be fully tested.
- **Infrastructure (repository implementations):** the doc allows either
  mocking the transport or a real integration test; this project chooses
  **real integration tests against a local Postgres** (via Docker Compose)
  over mocking Drizzle's query builder, because a mocked query builder
  verifies "I called the mock correctly," not "the SQL is right" — and the
  SQL correctness is exactly what matters for the derived-status queries.
  This is a deliberate divergence from "mock the transport," recorded here
  per the doc's own governance rule.

**Folder structure for this project** (no `src/` — the existing repo has
none, and introducing one buys nothing here):

```
app/                              # route tree only — thin delegates
features/
  auth/
    domain/
      Session.ts
      IOwnerRepository.ts
      ISessionRepository.ts
      use-cases/
    infrastructure/
      OwnerRepository.ts
      JwtSessionRepository.ts
  events/
    domain/
      Event.ts
      IEventRepository.ts
      use-cases/
    infrastructure/
      EventRepository.ts
  guests/
    domain/ ...
    infrastructure/ ...
  check-in/
    domain/
      ScanEvent.ts
      IScanRepository.ts
      foldGuestBalances.ts          # pure helper, camelCase per 02-CONVENTIONS.md
      use-cases/
    infrastructure/
      ScanRepository.ts
shared/
  infrastructure/
    db/
      schema.ts                     # Drizzle schema — cross-domain (guests → events, scan_events → guests)
      client.ts                     # getDb()
      test-helpers.ts                # resetDb()
  lib/
    codes.ts                        # guest/door code generation — pure, used by multiple features
    session-cookie.ts                # next/headers cookie I/O — Next.js-specific, not domain
    guard.ts                         # requireOwner()/requireDoor() — route-level auth gating
  component/
    ui/                              # design-system primitives (existing components/ui.tsx content)
```

**Consequence for the already-written implementation plan.** Part 1
(`docs/superpowers/plans/2026-09-22-data-foundation-auth.md`) was written
before this decision and uses a flat `lib/db/*.ts` structure. It is being
rewritten in place to the structure above before any of it is executed —
nothing from the original had been built yet, so there is no migration
cost, only a planning-time correction.

## Design-system primitives: shadcn/ui

`shared/component/ui/*` is generated by the shadcn CLI (`components.json`
at the repo root configures the output location) rather than hand-written —
this is a closer match to `03-STACK-AND-RATIONALE.md`'s reference stack ("a
headless/unstyled primitive library behind a local wrapper set") than an
earlier, hand-rolled version of this plan used. Regenerating or adding a
component (`npx shadcn@latest add <name>`) is the normal way to extend this
set — don't hand-write a new primitive that duplicates what the registry
already offers. Composed, project-specific pieces that aren't part of
shadcn's registry (`Field`, `ErrorNote`, `EmptyState`) live one level up, in
`shared/component/` directly, not under `ui/` — that boundary is
deliberate: `ui/` is "what the CLI owns," `shared/component/` is "what we
compose from it."

Two things about the CLI's actual behavior (as installed, `shadcn@4.21.0`)
diverged from what was originally planned, and this project adapted rather
than fighting the tool:

- Generated components import their class-merging helper from the `cn` npm
  package (`import { cn } from "cn"`), not from a locally-generated
  `shared/lib/utils.ts` — that file doesn't exist in this project; there's
  nothing for it to do that the `cn` package doesn't already provide, and
  every future `add` would regenerate files pointing at `cn` regardless of
  what a hand-written alternative said. `class-variance-authority`, which
  three of the generated components import, also isn't installed by the
  CLI — added as an explicit dependency instead.
- This CLI version injects no CSS custom properties into the configured
  CSS file at all. The color block in `app/globals.css`'s `@theme` block
  was hand-authored, using the project's own `--color-*` naming
  convention — not copied from shadcn's own defaults, since the CLI
  produced none to copy.

The existing warm color palette (`--color-canvas`, `--color-ink`,
`--color-good`/`-warn`/`-bad`, etc.) is kept as the source of truth for
everything outside shadcn's own semantic slots. Two of the original
tokens collided by *name* with a shadcn slot that means something
different — `--color-accent*` (this project's "brand mark" concept) vs.
shadcn's `accent` (a hover-background tint), and `--color-muted` (a text
color here) vs. shadcn's `muted` (a background tint). Same property name,
different job — keeping both would mean one silently overwrites the
other. Both old tokens were removed rather than kept alongside a
same-named shadcn slot with a different value; their exact hex values live
on under shadcn's own names (`--color-primary`, `--color-accent`,
`--color-muted-foreground`), and the one place in this codebase that
referenced the old bare `accent` name (`app/setup/page.tsx`'s eyebrow
label, in Task 3) uses `text-primary` instead.

## Forms

This project uses Next.js Server Actions + `useActionState`, not the
reference stack's `react-hook-form` + `zod` pairing — and, as a direct
consequence, not shadcn's `Form`/`FormField`/`FormMessage` components
either, since those are built specifically to bind to `react-hook-form`.
Next.js's native form-action model already solves the problem
`react-hook-form` exists for in an SPA (pending/error state without a page
reload) — adding a second form-state library on top would be redundant,
not complementary. Validation lives as guard clauses at the top of the
relevant domain use-case's `execute()` (e.g. `CreateEventUseCase` rejects
an empty name or a too-short door code), thrown as an `Error` whose message
is the Arabic text to display — colocated with the business rule it
enforces, per `02-CONVENTIONS.md`'s "schemas are defined in domain/"
guidance, just without a schema-validation library specifically. A plain
`shared/component/field.tsx` (`Label` + input + hint text) fills the role
`FormField` would have.

Per the doc's own view-model exception for server-rendered frameworks: a
`view-model/` hook here is a thin wrapper around `useActionState(action,
initialState)` calling into a Server Action — the Server Action itself
is the composition root (constructs use-cases via `make<Name>Repository`
factories), analogous to a Route Handler.
