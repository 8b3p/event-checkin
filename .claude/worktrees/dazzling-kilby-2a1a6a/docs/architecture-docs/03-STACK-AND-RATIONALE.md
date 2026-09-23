# Reference Stack & Rationale

The architecture in `01-ARCHITECTURE.md` and `02-CONVENTIONS.md` is
stack-agnostic by design: it names *roles* (a build tool, a DI container, a
server-state library) rather than mandating specific packages. This
document gives one concrete, proven stack that fills those roles, and —
more importantly — the reasoning behind the choices that aren't obvious,
so a team adopting this pattern doesn't have to rediscover the same traps.

---

## A reference stack

| Role | One proven choice | Notes |
| --- | --- | --- |
| Build tool | Vite | Fast dev server, SWC/esbuild-based. |
| Language | TypeScript, `strict: true` | No `any`, no per-file relaxations. |
| UI runtime | React | The architecture doesn't require React specifically — it requires a component model with hooks or an equivalent composition primitive. |
| Routing | A client-side router (e.g. React Router) | Framework-specific routing concepts (server/client component splits, file-system routing directives) stay out of feature code — see `01-ARCHITECTURE.md` → Routing. |
| Styling | Utility-class CSS + CSS-variable design tokens (e.g. Tailwind) | One paradigm, applied consistently. |
| Design-system primitives | A headless/unstyled primitive library (e.g. Radix) behind a local wrapper set | Feature code never imports the primitive library directly. |
| DI container | Inversify (or an equivalent decorator-based IoC container) | See **Decorator metadata is not free** below before assuming automatic type inference works. |
| Client/global state | A small store library (e.g. Zustand) | For state that isn't server data — UI state, session flags, ephemeral selections. |
| Server state & caching | A query/cache library (e.g. TanStack Query) | Owns loading/error/staleness so `view-model/` hooks don't hand-roll it. |
| Forms | A form-state library + schema validator, via an official resolver (e.g. react-hook-form + zod) | One pairing, project-wide — see **Consolidate on one form stack early** below. |
| API contract | Generated client from a machine-readable spec (e.g. OpenAPI via `openapi-ts` or equivalent) | Never hand-edited; regenerated on contract change. |
| Unit/component tests | A fast unit runner + a component-testing library (e.g. Vitest + Testing Library) | |
| End-to-end tests | A browser-automation E2E tool (e.g. Playwright) | |

None of these choices are load-bearing for the architecture itself — the
layering and DI discipline in `01-ARCHITECTURE.md` is the part to keep;
swap any row for an equivalent that fits your constraints.

---

## Rationale for the decisions that aren't obvious

### Decorator metadata is not free

Decorator-based DI containers commonly advertise (or are assumed to
support) automatic constructor-parameter resolution by type — write a
class, decorate it, and the container infers what to inject from the
parameter's declared type. **This depends entirely on whether something in
the build pipeline actually emits reflection metadata at compile time**,
and on a fast, SWC/esbuild-based toolchain, it frequently does not: those
compilers parse decorator *syntax* so the code runs, but only a full
`tsc`-emit build produces the `design:paramtypes` metadata that
type-based inference reads at runtime. A project that type-checks with
`tsc --noEmit` and builds with SWC/esbuild gets legacy decorator syntax
working and silently gets **no** reflection metadata, ever — with no error,
just a container that can't resolve a parameter it should theoretically be
able to infer.

**The practical rule this implies:** treat explicit dependency tagging
(e.g. `@inject(TOKEN)` on every injected constructor parameter) as
mandatory, always, regardless of what the DI library's docs suggest is
possible — verify what your specific build pipeline actually emits before
ever relying on implicit resolution, and default to explicit tagging when
in doubt. This is cheap to get right up front and expensive to discover
mid-project as a mysterious resolution failure.

### Pick one state-management split and enforce it, even against inertia

"Client/global state" and "server state" are different problems — the
former is data your app owns; the latter is a cached, potentially-stale
copy of someone else's data, with its own loading/error/staleness
lifecycle. Using one general-purpose reactive-state library for both
(common in codebases that adopted a store library before dedicated
server-state libraries were mainstream) tends to accrete hand-rolled
caching logic (TTLs, manual invalidation, fan-out-request workarounds)
that a purpose-built query library gives you for free.

When migrating or rearchitecting, this is a legitimate point to
**deliberately diverge from an existing, working pattern** even if it's
documented and reasoned — "it works today" and "it's the right foundation
for what's next" are different bars. If you do diverge, name what the old
pattern was solving (e.g. a specific over-fetching problem) and make sure
the new pattern has an explicit answer to that same problem — don't just
drop the old solution and hope the new library handles it by default.

### Consolidate on one form stack early — and make it hard to violate a second time

A form has two states worth separating even in a small project: form-state
management (values, touched/dirty tracking, submission) and schema
validation. Pairing one form library with one schema library through an
official resolver, and doing it **before** the second feature that needs a
form exists, avoids a specific, common failure mode: two forms built at
different times by different sessions, each inventing its own validation
approach, with no test or lint rule to catch the second one until a
refactor forces the question. Once a project has exactly one form
standard, protect it with an automated check (a structural test asserting
only the sanctioned pattern is imported, or a lint rule) rather than
relying on every future contributor reading the docs first — documented
conventions get skipped; enforced ones don't.

### Don't let a controlled primitive fake an uncontrolled one

Some design-system primitives (most commonly a styled `Select`/combobox
built on a headless UI library) are **controlled components** — they take
a value and an `onChange`, not a native DOM `<select>` contract. A form
library's basic field-registration API (e.g. `register()` in
react-hook-form) typically assumes an uncontrolled, native-input-shaped
element and will silently fail to keep a controlled primitive in sync.
The fix is a small wrapper component built specifically to bridge a
controlled primitive into the form library's controlled-component API
(e.g. a `Controller`-based wrapper) — and the convention is to require
every form field using that primitive to go through the wrapper, never
`register()` directly. This is easy to get wrong exactly once per
project, usually noticed only when a save silently does nothing with a
value that looked selected.

### Record decisions as you make them, not after

Any non-default architectural choice — a stack pick, a deliberate
divergence from an existing pattern, a scoping decision — is worth a short
written record at the moment it's made: what was decided, why, what was
considered instead, and what it implies for code that follows. The value
isn't the ceremony; it's that six months (or six independent agent
sessions) later, nobody has to reverse-engineer intent from a diff. Keep
these lightweight — context, decision, consequences, alternatives
considered — and index them from one discoverable location.

---

## Open questions every team should expect to answer for itself

These aren't architecture decisions this document can make generically —
each has a real, project-specific answer:

- **"No backend" / offline dev mode.** Does the app need to run against
  demo/fixture data with network calls disabled, for local development
  without a live backend? If so, where does that switch live (an env
  flag feeding the server-state library's "enabled" mechanism is a common
  answer) — decide before the first view-model hook is written, not
  after several exist inconsistently.
- **Composite form components (multi-step / dialog-wrapped forms).** The
  form-state stack (previous section) is a separate decision from
  whether a project needs a shared `FormDialog`/`FormTabs`-style
  composition on top of it. Don't resolve this speculatively — resolve it
  when the first feature that actually needs modal or multi-step form
  composition arrives, so the interface is validated against a real use
  case instead of guessed at.
- **Locale/RTL strategy**, if the product is multilingual: which i18n
  library, whether routes are locale-prefixed, and who owns the
  navigation-wrapper convention referenced in `01-ARCHITECTURE.md`.
- **Ownership of any generated build artifact that a second system also
  reads** (e.g. a route manifest consumed by a backend template
  renderer) — decide which side of the migration/system owns producing it
  before both sides start writing to it independently.
