# Architecture

The rules every feature must follow. A **4-layer clean architecture**,
feature-sliced by business domain, wired through a single dependency
injection (DI) container. **UI never contains business logic. Logic never
imports UI.**

---

## Layered structure

```
src/
├── api/
│   └── generated/              # backend client (types + calls) — generated, never hand-edited
├── app/ (or routes/)           # route tree — routing only, no logic
├── features/                   # feature modules — the bulk of all work
│   └── <domain>/
│       ├── ui/                 # presentation — components only
│       ├── view-model/         # application — hooks bridging UI ↔ domain
│       ├── domain/             # domain — entities, repository interfaces, use-cases
│       └── infrastructure/     # infrastructure — repository implementations, API adapters
└── shared/                     # cross-feature shared code
    ├── component/
    │   └── ui/                 # design-system primitives (Button, Input, Dialog, …)
    ├── container/               # DI container + tokens
    ├── hook/                    # shared hooks
    ├── lib/                     # shared utilities
    └── types/                   # shared types
```

### Feature folder organisation

- Name features by **business domain** (e.g. `billing`, `inventory`,
  `notifications`), **not** by route segment or screen name. There is no
  `features/dashboard/` — a dashboard is a view assembled from one or more
  domains, not a domain itself.
- Large product areas may use a **grouped namespace** with sub-features,
  each with its own four layers — e.g. `features/admin/billing/`,
  `features/admin/users/`.
- Routing code is not a feature. Route components live in the route tree
  and are thin (see **Routing** below).
- Not every slice needs every folder. A read-only screen may have no
  `infrastructure/` beyond a thin repository; a purely presentational slice
  may have only `ui/`. What a slice must never do is *invert* the
  dependency flow to avoid writing a layer it "doesn't need."

---

## Layer rules

### `ui/` — presentation

- Only view components. No business logic, no direct network calls, no
  repository or use-case calls.
- Receives all data and callbacks from a view-model hook (or props passed
  down from one).
- Uses design-system primitives from `shared/component/ui/` and composed
  components from `shared/component/`. Styled with utility classes and
  design tokens, not one-off inline styles or component-scoped stylesheets.
- May import from: `view-model/`, `shared/component/`, `shared/types/`
  (types only).
- **Must not** import from `domain/` use-cases or `infrastructure/`.
- **Must not** resolve anything from the DI container directly.

### `view-model/` — application

- Hooks (or view-model classes, in a non-React UI runtime) that own a
  screen or component's state and behaviour.
- Bridges UI and domain: resolves use-cases from the container, calls
  them, maps results into view-ready shapes, exposes handlers for user
  actions.
- Server state (data fetched over the network) is owned by whatever
  data-fetching/caching library the stack uses; client/global state by
  whatever store library the stack uses. Both are a stack decision, not an
  architecture decision — see `03-STACK-AND-RATIONALE.md`.
- One view-model per component or logical screen unit, conventionally
  named `use<Name>ViewModel`.
- May import from: `domain/`, `shared/container/`, `shared/types/`.
- **Must not** import styling utilities, design-system components, or any
  other UI code.
- **This is the only layer allowed to resolve anything from the DI
  container.**

### `domain/` — domain

- Entities (plain types/classes), repository **interfaces**, and
  **use-case** classes.
- **Zero framework dependencies.** No UI framework, no HTTP client, no
  browser globals. This layer must be able to run in a plain script or a
  unit test with nothing mocked but its own repository interfaces.
- A use-case is a small, single-purpose class registered with the DI
  container. It receives repository interfaces through constructor
  injection and exposes exactly one public method (conventionally
  `execute(...)`). Orchestration and business rules live here — not in the
  repository (which only talks to the backend) and not in the view-model
  (which only adapts results for display).
- Repository **interfaces** (`I<Name>Repository`) live here; their
  **implementations** live in `infrastructure/`. This inversion is the
  point of the pattern: `domain/` defines the contract it needs, and
  `infrastructure/` is the only layer that knows the contract is fulfilled
  by, say, a REST call.
- Prefer types generated from the backend contract (see **Generated
  backend client** below) for shapes that mirror backend responses. Extend
  them rather than re-hand-writing them:
  ```ts
  import type { Widget } from "@/api/generated/types.gen";
  export type WidgetListItem = Widget & { updatedAtLabel: string };
  ```
  Define wholly new domain types only for things the generated client
  doesn't model — UI-built request payloads, client-only enums, derived
  view shapes.
- May import from: `shared/types/`, the generated API client (types only).
- **Must not** import from `ui/`, `view-model/`, or `infrastructure/`.

### `infrastructure/` — infrastructure

- Repository implementations and API adapters. Implements the interfaces
  declared in `domain/`.
- Talks to the backend **only** through the generated API client. Maps raw
  API responses to domain types when the repository returns an
  extended or view-specific shape; unwraps any response envelope here,
  once, so nothing above this layer ever sees transport-level shape again.
- Registered in the DI container.
- May import from: `domain/`, `shared/types/`, the generated API client.
- **Must not** import from `ui/` or `view-model/`.

---

## Dependency flow (strictly one-way)

```
ui  →  view-model  →  domain  ←  infrastructure
                  ↘              ↗
                   shared/types
```

An inner layer never imports an outer layer. `domain/` is innermost and
knows nothing about React, HTTP, or the DI container's existence beyond the
decorators used to make itself injectable. To let an inner layer hand data
outward, define an interface or callback in the inner layer and let the
outer layer satisfy it — never reach outward with a concrete import.

This is what makes the layers independently testable: `domain/` tests run
with a hand-written fake implementing the repository interface, no
framework or network involved; `infrastructure/` tests can mock only the
transport; `ui/` tests can render against a hand-built view-model return
value with no container, no network, no domain code in the test at all.

---

## Routing

- Route definitions live in one place (an `app/` or `routes/` tree,
  whichever the framework in use calls it).
- A route element is a **thin delegate**: it reads route/query params,
  performs auth or permission gating, and renders exactly one feature
  `ui/` component. No data fetching, no business logic, no layout logic
  beyond the page shell.
- Data loading happens in the feature's **view-model hook**, not in a
  router-level loader/resolver, unless a recorded architecture decision
  says otherwise for a specific case (server-rendered frameworks with
  their own loader convention are a legitimate reason to make that
  exception — record it, don't default into it).
- If the app is multi-framework-portable in spirit (i.e. the router is a
  swappable detail, not core to the architecture), don't let
  framework-specific routing concepts — server/client component splits,
  directives, file-system route conventions — leak past the route tree
  into feature code.
- If the app is localised, wrap navigation primitives (link, programmatic
  navigate) once in `shared/` and require every feature to use the
  wrapper rather than the router's raw APIs, so locale-prefixing is
  enforced in one place.

---

## Generated backend client

- The backend publishes a machine-readable contract (OpenAPI or
  equivalent). Generate a typed client + data types from it into
  `api/generated/`. **Never hand-edit generated output** — regenerate when
  the contract changes and fix the resulting type errors at the call
  sites, which by construction can only be in `infrastructure/`.
- Only `infrastructure/` may import the generated client's call
  functions. `domain/`, `view-model/`, and `ui/` may import its *types*
  (to describe shapes) but never its network-calling functions.
- Configure the underlying HTTP client (base URL, auth headers,
  interceptors) in exactly one place, imported by the generated client's
  setup — not duplicated per repository.

---

## DI container

- One container for the whole app. Tokens declared in one file (e.g.
  `shared/container/tokens.ts`), bindings in one file (e.g.
  `shared/container/container.ts`), a single public export point.
- Repositories are bound as **singletons** — one instance for the app's
  lifetime, which matters if a repository ever holds in-memory state
  (a cache, a mock store): a non-singleton binding silently resets that
  state on every resolve. Use-cases are bound **transient** — a fresh
  instance per resolution, since they're cheap, stateless, and
  single-purpose.
- Every bound class is marked injectable; every injected constructor
  parameter is explicitly tagged with its token. Depending on the
  language/toolchain, automatic type-based resolution of constructor
  parameters may not be available at all (see `03-STACK-AND-RATIONALE.md`
  for a concrete case where it silently isn't) — treat explicit tagging as
  mandatory regardless, not as a fallback for when inference fails.
- View-model hooks resolve dependencies from the container. Nothing else
  does. Never construct a use-case or repository with `new` outside the
  container's own binding configuration — doing so bypasses the
  singleton/transient contract and creates an instance the container
  doesn't know about.
