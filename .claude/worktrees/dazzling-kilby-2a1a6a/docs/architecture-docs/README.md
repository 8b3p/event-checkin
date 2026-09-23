# 4-Layer Clean Architecture (OOP + DDD + DI) for a React SPA

A product-agnostic specification of a frontend architecture: strict 4-layer
clean architecture, dependency injection via an IoC container, and
feature-slicing by business domain. It is written so that **any session —
human or AI agent — can pick it up cold** and start building a compliant
feature without needing prior context, a call with the original author, or
access to any specific codebase.

This is not tied to any particular product, backend, or company. Wherever a
concrete library is named, it is one worked example of the pattern, not a
requirement — swap it for an equivalent if your stack differs, but keep the
*layering and dependency rules* intact. Those are the part that isn't
negotiable.

## Documents in this set

| File | Covers |
| --- | --- |
| [`01-ARCHITECTURE.md`](./01-ARCHITECTURE.md) | The four layers, the folder structure, the one-way dependency rule, per-layer do's/don'ts, routing, the DI container, and how the backend contract is consumed. **Read this first.** |
| [`02-CONVENTIONS.md`](./02-CONVENTIONS.md) | Naming conventions, canonical folder layout for one feature slice, copy-pasteable code shapes for a use-case / repository / view-model hook, TypeScript rules, forms, styling, and a per-layer testing strategy. |
| [`03-STACK-AND-RATIONALE.md`](./03-STACK-AND-RATIONALE.md) | A reference technology stack (one concrete, proven choice per concern) plus the *why* behind the non-obvious decisions — the kind of reasoning that otherwise only lives in one person's head. |
| [`04-NEXTJS-ADAPTATION.md`](./04-NEXTJS-ADAPTATION.md) | **Project-specific.** How this architecture applies to this repo specifically: a single Next.js app with no separate backend. What's dropped (DI container, generated OpenAPI client, SPA router), what's kept, and the concrete folder structure this project uses. Read this alongside the three files above once you're working in *this* codebase. |

## The one-paragraph version

Every feature is a vertical slice named after a **business domain**, not a
route or a screen. Each slice has exactly four layers — `ui` → `view-model`
→ `domain` ← `infrastructure` — and each layer may only import inward, never
outward or sideways past the boundary; the `domain` layer has zero framework
dependencies and is the one thing in the slice that is pure, portable
TypeScript. All cross-layer wiring (which repository implementation backs
which interface, which use-case a hook resolves) goes through one dependency
injection container — nothing is ever constructed with `new` outside it, and
nothing outside a `view-model` hook is allowed to touch the container
directly. UI components render; they never fetch, never hold business
rules, and never know a use-case exists.

## Who this is for

- **A developer or agent starting a new feature slice** — read
  `01-ARCHITECTURE.md`, then copy the shapes in `02-CONVENTIONS.md`.
- **A developer or agent reviewing a PR against this architecture** — the
  "must not" bullets in `01-ARCHITECTURE.md` under each layer are the
  checklist.
- **Someone deciding whether to adopt this pattern for a new project** —
  read `03-STACK-AND-RATIONALE.md` for the tradeoffs and open questions a
  team should expect to answer for itself before writing code.
