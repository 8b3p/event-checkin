# Owner Auth & Event Management UI Implementation Plan (Part 2 of the multi-event rebuild)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `ui/` and `view-model/` layers on top of Part 1's `auth` and `events` feature slices, so an owner can sign up, log in, and fully manage their event list (create/edit/duplicate/archive) — entirely in Arabic, RTL, mobile-first, on shadcn/ui design-system primitives. Guest management, QR cards, and the door scanner are separate, later plans (this plan does not touch guests or scanning).

**Architecture:** Server Components read data by calling a use-case directly and passing the result to a feature's `ui/` component (no `view-model/` hook needed — there's no client/server boundary to cross, per `04-NEXTJS-ADAPTATION.md`). Interactive Client Components (forms) get a thin `view-model/` hook wrapping `useActionState`, which calls a Server Action; the Server Action is the composition root, constructing use-cases via each feature's `infrastructure/factory.ts` — exactly the pattern Part 1 built for. Design-system primitives come from shadcn/ui (Radix UI underneath, generated as source files into `shared/component/ui/`) — this is a closer fit to the architecture doc's own reference stack ("a headless/unstyled primitive library behind a local wrapper set") than the hand-rolled primitives an earlier draft of this plan used. This plan also touches a handful of already-merged Part 1 domain files to add input validation and switch their error messages to Arabic (validation was never built in Part 1 — only CRUD passthroughs — because nothing consumed it yet; this plan is where it's first needed).

**Tech Stack:** Next.js 16 / React 19, Tailwind CSS v4, shadcn/ui + Radix UI (Button, Input, Label, Textarea, Card, Badge, Alert), `next/font/google` (Cairo), Server Actions + `useActionState` (not `react-hook-form`/`zod` — see Task 1's addition to `04-NEXTJS-ADAPTATION.md` for why; this also means shadcn's `Form`/`FormField` components, which are built for `react-hook-form`, are not used — a plain custom `Field` wrapper fills that role instead).

**Spec:** [docs/superpowers/specs/2026-09-22-multi-event-checkin-design.md](../specs/2026-09-22-multi-event-checkin-design.md) — sections 5 (Auth & Access), 6 (Owner Dashboard, event-list/settings portions only), 10 (Localization & Mobile-First UI).
**Architecture:** [docs/architecture-docs/04-NEXTJS-ADAPTATION.md](../../architecture-docs/04-NEXTJS-ADAPTATION.md)
**Builds on:** [docs/superpowers/plans/2026-09-22-data-foundation-auth.md](2026-09-22-data-foundation-auth.md) (Part 1, merged) — this plan consumes its `features/auth` and `features/events` domain/infrastructure layers without modifying their interfaces, only adding validation inside a few use-cases' `execute()` bodies.

## Global Constraints

**Product (from the spec):**
- Arabic-only UI, no language toggle — hardcoded Arabic strings throughout (spec §10).
- RTL layout: `dir="rtl"` on `<html>`, Tailwind logical properties (`ms-`/`me-`/`ps-`/`pe-`, never `ml-`/`mr-`/`pl-`/`pr-`).
- An Arabic-supporting typeface replaces the current Georgia/Inter pairing.
- Numerals: Western digits (0-9) throughout, including dates — verified via the `ar-u-nu-latn` locale tag wherever a date is formatted for display.
- Mobile-first, not just the door scanner: single-column layouts, 44px-minimum touch targets, primary actions reachable with a thumb.
- One owner account, many events (spec §2, §5) — already enforced at the domain layer by Part 1.

**Architecture (from `docs/architecture-docs/`):**
- `ui/` components render only; no business logic, no direct repository/use-case calls, no container resolution.
- `view-model/` hooks are the only layer that bridges to a Server Action; for a server-rendered read with no interactivity, a Server Component calls the use-case directly instead (documented exception, no hook needed).
- Server Actions are this project's composition root: they construct use-cases via `make<Name>Repository()` factories, never `new` a repository directly outside a factory.
- Forms use Next.js Server Actions + `useActionState`, not `react-hook-form`/`zod` (recorded as a decision in Task 1).
- Domain validation lives as guard clauses at the top of the relevant use-case's `execute()`, thrown as `Error` with the Arabic message meant for display — not in the UI layer, not in a separate schema file.
- Design-system primitives (`shared/component/ui/*`) are shadcn/ui-generated (Radix UI + Tailwind); feature code never imports Radix directly, only through `shared/component/ui/*` or a composed wrapper in `shared/component/*` — matching `01-ARCHITECTURE.md`'s "feature code never imports the primitive library directly."

---

## Task 1: shadcn/ui setup + RTL/Arabic/mobile-first foundation

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css` (font vars, plus Step 6's hand-authored color block — see that step for why it's hand-authored rather than CLI-merged)
- Create: `components.json`
- Create: `shared/component/ui/button.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, `card.tsx`, `badge.tsx`, `alert.tsx` (via the shadcn CLI)
- Create: `shared/component/field.tsx`, `shared/component/error-note.tsx`, `shared/component/empty-state.tsx`
- Create: `shared/component/Shell.tsx`
- Delete: `components/ui.tsx`, `components/shell.tsx`
- Modify: `docs/architecture-docs/04-NEXTJS-ADAPTATION.md`
- Modify: `package.json` (the shadcn CLI adds `cn` and `radix-ui`; you separately add `class-variance-authority` by hand in Step 5 — see that step for why)

**Interfaces:**
- Produces: `Button`, `Input`, `Label`, `Textarea`, `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`), `Badge`, `Alert`/`AlertDescription` from `@/shared/component/ui/*` (shadcn-generated, one file per component — import each from its own path, e.g. `@/shared/component/ui/button`, not a single barrel file). `Field` from `@/shared/component/field`, `ErrorNote` from `@/shared/component/error-note`, `EmptyState` from `@/shared/component/empty-state` — custom composed components shadcn doesn't provide. `Shell`, `PageHeading` from `@/shared/component/Shell` — redesigned: no `coupleNames`/`current`/nav-array props (those belonged to the old single-event dashboard), just `children`. Every later task in this plan imports from these paths.

This task does not touch `app/` beyond `layout.tsx`/`globals.css` — every `app/` page still importing `@/components/ui` or `@/components/shell` (setup, login, settings, guests, and everything else) breaks the moment this task deletes those files. That's expected and temporary: Tasks 3–6 of this same plan rewire setup/login/events; `guests`/`scan`/`door`/`i`/`api/checkin` stay broken past this plan, same as they were after Part 1 — later plans rewire those.

- [ ] **Step 1: Switch the root layout to Arabic/RTL with an Arabic-supporting font**

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "الباب — تسجيل حضور الفعاليات",
  description: "أرسل لضيوفك رمز QR بدلاً من دعوة ورقية، وسجّل حضورهم عند الباب.",
};

export const viewport: Viewport = {
  themeColor: "#fbf8f4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Point the design tokens' font variables at Cairo**

In `app/globals.css`, inside the `@theme { ... }` block, replace these two lines (they currently reference the old `--font-serif`/`--font-inter` variables the old `layout.tsx` defined, which no longer exist after Step 1):

```css
  --font-display: var(--font-cairo), "Segoe UI", Tahoma, sans-serif;
  --font-sans: var(--font-cairo), "Segoe UI", Tahoma, sans-serif;
```

Leave every other line in `globals.css` (the color tokens, `.tabular`, `.display`, the scanner-specific `#wc-reader` rules) untouched for now — Step 5 below edits some of the color-related lines shadcn's CLI adds, nothing else.

- [ ] **Step 3: Write the shadcn config**

```json
// components.json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/shared/component",
    "utils": "@/shared/lib/utils",
    "ui": "@/shared/component/ui",
    "lib": "@/shared/lib",
    "hooks": "@/shared/hook"
  },
  "iconLibrary": "lucide"
}
```

`"config": ""` is correct for Tailwind v4 (this project has no `tailwind.config.ts` — it's pure CSS-based config via `@import "tailwindcss"` and `@theme` in `app/globals.css`, which is what `"css"` above points at). The `ui`/`components` aliases route shadcn's generated files into `shared/component/` per this project's architecture, not the tool's own default `components/ui/`.

- [ ] **Step 4: Write the shadcn config, no local utils.ts**

The CLI version this project resolves (`npx shadcn@latest`, currently `shadcn@4.21.0`) generates components that `import { cn } from "cn"` — a real npm package — rather than reading the `utils` alias in `components.json` and generating a local `cn()` helper. Don't create `shared/lib/utils.ts` — there's nothing for it to do that the `cn` package doesn't already provide, and every future `npx shadcn@latest add <name>` in this repo would regenerate files pointing at `cn` regardless, so a hand-written alternative would just be dead code. Leave the `utils` alias in `components.json` (Step 3) as-is — harmless, unused by this CLI version, and cheap to have ready if a future CLI version reads it again.

- [ ] **Step 5: Install the primitives this plan's forms need**

```bash
npx shadcn@latest add button input label textarea card badge alert
```

This writes `shared/component/ui/button.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, `card.tsx`, `badge.tsx`, `alert.tsx`, and adds `cn` and `radix-ui` (a consolidated package, not individual `@radix-ui/react-*` packages) to `package.json`. It does **not** add `class-variance-authority`, even though `button.tsx`, `badge.tsx`, and `alert.tsx` all import it (`import { cva, type VariantProps } from "class-variance-authority"`) — this is a gap in what the CLI installs, not something you did wrong. Install it explicitly:

```bash
npm install class-variance-authority
```

This CLI version also does not merge any CSS custom properties into `app/globals.css` — Step 6 below hand-authors that block instead of editing one the CLI wrote.

If `npm install` reports a peer-dependency conflict (Radix packages occasionally lag a fresh React major version), re-run with `npm install --legacy-peer-deps` and continue — this is a known, acceptable workaround, not a sign something is wrong.

- [ ] **Step 6: Hand-author shadcn's color variables, reconciled with the existing palette**

`app/globals.css`'s `@theme { ... }` block already has a deliberately warm, WCAG-contrast-considered palette (`--color-canvas`, `--color-ink`, `--color-accent`, `--color-accent-soft`, `--color-accent-ink`, `--color-muted`, etc.). Two of those names collide with names shadcn's generated components reference (via Tailwind classes like `bg-accent`, `hover:bg-muted`) for a **different** meaning than this project's existing tokens: this project's `--color-accent*` is a "brand mark" concept (documented in the file's own comment: "the mark colour, >=3:1 contrast"), while shadcn's `accent` is a subtle hover-background tint — same name, different job. Similarly this project's `--color-muted` is a *text* color, while shadcn's `muted` is a *background* tint.

Rather than keep two same-named CSS custom properties resolving to different values (impossible — it's one property), remove the two colliding tokens and let shadcn's same-named slots take over their old values under shadcn's own naming. First, confirm nothing in this project still needs the old bare names:

```bash
grep -rn "text-accent\b\|bg-accent\b\|border-accent\b\|text-muted\b\|bg-muted\b" app components shared 2>/dev/null
```

Expected: no matches (this repo's only prior use of bare `text-accent`, in `app/setup/page.tsx`, was already changed to `text-primary` in the plan you're reading from — Task 3 rewrites that file to match). If the grep finds something, stop and report BLOCKED — that means something depends on the old names in a way this task didn't anticipate.

Then, in `app/globals.css`'s `@theme { ... }` block:

1. **Delete** these three existing lines: `--color-accent: #b0701c;`, `--color-accent-soft: #f7ead6;`, `--color-accent-ink: #79490f;`.
2. **Delete** this existing line: `--color-muted: #6f6357;`.
3. **Add** this block in their place (comment included, so a future reader knows why these hex values don't trace back to a currently-visible source token):

```css
  /* shadcn/ui semantic tokens. Hand-authored, not CLI-injected — this
     CLI version (shadcn@4.21.0) merges no CSS into the target file. The
     hex values below are exactly the old --color-accent/--color-accent-soft/
     --color-accent-ink/--color-muted values this block replaced (see
     04-NEXTJS-ADAPTATION.md for the full explanation of the naming
     collision that forced the removal). */
  --color-background: var(--color-canvas);
  --color-foreground: var(--color-ink);
  --color-card: var(--color-surface);
  --color-card-foreground: var(--color-ink);
  --color-popover: var(--color-surface);
  --color-popover-foreground: var(--color-ink);
  --color-primary: #79490f;
  --color-primary-foreground: #ffffff;
  --color-secondary: var(--color-raised);
  --color-secondary-foreground: var(--color-ink);
  --color-muted: var(--color-raised);
  --color-muted-foreground: #6f6357;
  --color-accent: #f7ead6;
  --color-accent-foreground: #79490f;
  --color-destructive: var(--color-bad);
  --color-destructive-foreground: #ffffff;
  --color-border: var(--color-line);
  --color-input: var(--color-line);
  --color-ring: #b0701c;
```

4. Check whether any of the seven generated files reference `var(--radius)`:

```bash
grep -rn "var(--radius)" shared/component/ui/
```

If it finds matches, also add `--radius: 0.875rem;` to the same block (matches the existing `--radius-card: 14px` already in the file). If it finds nothing, skip it — don't add a token nothing reads.

Don't touch `.dark` anywhere in the file — nothing in this app toggles a `dark` class, and there is no `.dark` block to touch anyway since this CLI version injected none.

- [ ] **Step 7: Build the composed pieces shadcn doesn't provide**

`Field` pairs a `Label` with its input and an optional hint — shadcn's own `Form`/`FormField` do this too, but they're built specifically for `react-hook-form`, which this project isn't using (see Step 9's decision note), so a plain version:

```tsx
// shared/component/field.tsx
import type { ReactNode } from "react";
import { Label } from "@/shared/component/ui/label";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
```

Every `<Input>`/`<Textarea>` used inside a `<Field>` needs an `id` matching `htmlFor` — `shadcn`'s `Label` is a standalone Radix element, not a wrapping `<label>`, so the pairing is explicit, not implicit.

```tsx
// shared/component/error-note.tsx
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/shared/component/ui/alert";

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
```

```tsx
// shared/component/empty-state.tsx
import type { ReactNode } from "react";

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="display text-xl text-foreground">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 8: Relocate and redesign the app shell for the multi-event structure, in Arabic, with logical properties**

The old `Shell` took `coupleNames`/`current`/a hardcoded nav array — all single-event assumptions. The new one is a minimal top bar (app name, sign out) built on the shadcn `Button`; event-specific navigation is contextual per page (a "‹ back" link), built in later tasks, not a global nav array that would need to scale to N events.

```tsx
// shared/component/Shell.tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/auth-actions";
import { Button } from "@/shared/component/ui/button";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-6 px-5">
          <Link href="/" className="display shrink-0 text-xl text-foreground">
            الباب
          </Link>

          <form action={logoutAction} className="ms-auto">
            <Button type="submit" variant="ghost" size="sm">
              تسجيل الخروج
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}

export function PageHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-3xl text-foreground">{title}</h1>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}
```

Note `ms-auto` (margin-inline-start: auto), not `ml-auto` — the old `Shell` used `ml-auto`, which would push the sign-out button to the visually-wrong side once the page flips to RTL. This is the one direction-sensitive class you write by hand in this file; separately, audit the seven files `shadcn add` generated in Step 5 for any `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-` classes (`grep -rEn "\b(ml|mr|pl|pr|left|right)-" shared/component/ui/`) — shadcn's registry isn't RTL-audited, so a generated component using a physical-direction utility is possible even though none of Button/Input/Label/Textarea/Card/Badge/Alert are expected to (they're simple, non-positional components). If the grep finds something, replace it with the logical equivalent (`ms-`/`me-`/`ps-`/`pe-`) before moving on.

- [ ] **Step 9: Delete the old files**

```bash
git rm components/ui.tsx components/shell.tsx
```

(`components/arrivals-chart.tsx` stays — it's untouched, dormant until a later plan builds a dashboard that uses it.)

- [ ] **Step 10: Record the shadcn and forms decisions**

Append this section to the end of `docs/architecture-docs/04-NEXTJS-ADAPTATION.md`:

```markdown

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
```

- [ ] **Step 11: Verify the new files typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep "shared/component"`
Expected: no output (the new files are self-contained — nothing consumes them yet, so this only catches syntax/type errors within them).

- [ ] **Step 12: Commit**

```bash
git add components.json shared/component app/layout.tsx app/globals.css package.json package-lock.json docs/architecture-docs/04-NEXTJS-ADAPTATION.md
git commit -m "Add shadcn/ui design-system primitives and Arabic/RTL/mobile-first shell"
```

---

## Task 2: Domain validation and Arabic error messages

Part 1 built `CreateEventUseCase`/`UpdateEventUseCase` as bare passthroughs — no validation existed because no UI called them yet. This task adds the validation the original single-event app had (name required, door code minimum length) as guard clauses, and switches every user-facing error message these use-cases (and the owner-account ones) throw to Arabic, since nothing translates them later — the thrown message *is* what gets displayed, per Task 1's forms decision.

**Files:**
- Modify: `features/auth/domain/use-cases/CreateOwnerUseCase.ts`
- Modify: `features/auth/domain/use-cases/ChangeOwnerPasswordUseCase.ts`
- Modify: `features/auth/domain/use-cases/auth-use-cases.test.ts`
- Modify: `features/events/domain/use-cases/CreateEventUseCase.ts`
- Modify: `features/events/domain/use-cases/UpdateEventUseCase.ts`
- Modify: `features/events/domain/use-cases/DuplicateEventUseCase.ts`
- Modify: `features/events/domain/use-cases/events-use-cases.test.ts`

**Interfaces:**
- Consumes: nothing new — same `IOwnerRepository`/`IEventRepository` interfaces from Part 1, unchanged.
- Produces: the same `execute()` signatures as before (no signature changes, only added validation inside the method bodies) — Task 3's Server Actions rely on catching a thrown `Error` and using `error.message` directly as the Arabic string to show the user.

- [ ] **Step 1: Update CreateOwnerUseCase's error messages to Arabic**

```ts
// features/auth/domain/use-cases/CreateOwnerUseCase.ts
import bcrypt from "bcryptjs";
import type { IOwnerRepository } from "../IOwnerRepository";

export type CreateOwnerInput = { email: string; password: string };

export class CreateOwnerUseCase {
  constructor(private readonly ownerRepository: IOwnerRepository) {}

  async execute(input: CreateOwnerInput): Promise<void> {
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("البريد الإلكتروني غير صحيح.");
    }
    if (input.password.length < 8) {
      throw new Error("استخدم كلمة مرور من 8 أحرف على الأقل.");
    }
    if ((await this.ownerRepository.get()) !== null) {
      throw new Error("يوجد حساب مالك بالفعل.");
    }

    await this.ownerRepository.create({ email, passwordHash: await bcrypt.hash(input.password, 12) });
  }
}
```

- [ ] **Step 2: Update ChangeOwnerPasswordUseCase's error messages to Arabic**

```ts
// features/auth/domain/use-cases/ChangeOwnerPasswordUseCase.ts
import bcrypt from "bcryptjs";
import type { IOwnerRepository } from "../IOwnerRepository";

export class ChangeOwnerPasswordUseCase {
  constructor(private readonly ownerRepository: IOwnerRepository) {}

  async execute(currentPassword: string, newPassword: string): Promise<void> {
    const owner = await this.ownerRepository.get();
    if (!owner) throw new Error("لا يوجد حساب مالك بعد.");
    if (!(await bcrypt.compare(currentPassword, owner.passwordHash))) {
      throw new Error("كلمة المرور الحالية غير صحيحة.");
    }
    if (newPassword.length < 8) {
      throw new Error("استخدم كلمة مرور جديدة من 8 أحرف على الأقل.");
    }

    await this.ownerRepository.updatePassword(await bcrypt.hash(newPassword, 12));
  }
}
```

- [ ] **Step 3: Fix the one test that asserts CreateOwnerUseCase's exact error text**

In `features/auth/domain/use-cases/auth-use-cases.test.ts`, find this assertion inside the `"rejects creating a second owner account"` test:

```ts
    await expect(
      new CreateOwnerUseCase(repo).execute({ email: "other@example.com", password: "supersecret" }),
    ).rejects.toThrow("An owner account already exists.");
```

Replace the string with the new Arabic message:

```ts
    await expect(
      new CreateOwnerUseCase(repo).execute({ email: "other@example.com", password: "supersecret" }),
    ).rejects.toThrow("يوجد حساب مالك بالفعل.");
```

Every other `.rejects.toThrow()` call in that file (and in `ChangeOwnerPasswordUseCase`'s tests) asserts no specific text, so nothing else in that file needs changing.

- [ ] **Step 4: Run the auth domain tests and confirm they still pass**

Run: `npm test -- auth-use-cases`
Expected: 10 passed.

- [ ] **Step 5: Write the failing tests for CreateEventUseCase/UpdateEventUseCase validation**

Append these two `it` blocks to `features/events/domain/use-cases/events-use-cases.test.ts`, inside the existing `describe("event use-cases", ...)` block (after the `"stores a lowercase door code as uppercase..."` test):

```ts
  it("rejects an empty name or a too-short door code on create", async () => {
    const repo = new FakeEventRepository();
    await expect(new CreateEventUseCase(repo).execute({ ...BASE, name: "   " })).rejects.toThrow();
    await expect(new CreateEventUseCase(repo).execute({ ...BASE, doorCode: "ab" })).rejects.toThrow();
  });

  it("rejects an empty name or a too-short door code on update", async () => {
    const repo = new FakeEventRepository();
    const created = await repo.create(BASE);
    await expect(new UpdateEventUseCase(repo).execute(created.id, { ...BASE, name: "  " })).rejects.toThrow();
    await expect(new UpdateEventUseCase(repo).execute(created.id, { ...BASE, doorCode: "ab" })).rejects.toThrow();
  });
```

- [ ] **Step 6: Run and confirm failure**

Run: `npm test -- events-use-cases`
Expected: FAIL — `CreateEventUseCase`/`UpdateEventUseCase` don't yet validate, so `.rejects.toThrow()` finds nothing thrown.

- [ ] **Step 7: Add the validation to CreateEventUseCase and UpdateEventUseCase**

```ts
// features/events/domain/use-cases/CreateEventUseCase.ts
import type { Event, EventInput } from "../Event";
import type { IEventRepository } from "../IEventRepository";

export class CreateEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  execute(input: EventInput): Promise<Event> {
    const name = input.name.trim();
    const doorCode = input.doorCode.trim().toUpperCase();

    if (!name) throw new Error("أضف اسماً للفعالية.");
    if (doorCode.length < 4) throw new Error("يجب أن يتكون رمز الباب من 4 أحرف على الأقل.");

    return this.eventRepository.create({ ...input, name, doorCode });
  }
}
```

```ts
// features/events/domain/use-cases/UpdateEventUseCase.ts
import type { EventInput } from "../Event";
import type { IEventRepository } from "../IEventRepository";

export class UpdateEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  execute(id: number, input: EventInput): Promise<void> {
    const name = input.name.trim();
    const doorCode = input.doorCode.trim().toUpperCase();

    if (!name) throw new Error("أضف اسماً للفعالية.");
    if (doorCode.length < 4) throw new Error("يجب أن يتكون رمز الباب من 4 أحرف على الأقل.");

    return this.eventRepository.update(id, { ...input, name, doorCode });
  }
}
```

- [ ] **Step 8: Run and confirm pass**

Run: `npm test -- events-use-cases`
Expected: 8 passed.

- [ ] **Step 9: Translate DuplicateEventUseCase's error and route it through CreateEventUseCase**

`DuplicateEventUseCase` currently calls `this.eventRepository.create(...)` directly, which means it skips the validation and door-code-uppercasing you just added to `CreateEventUseCase`. Route it through `CreateEventUseCase` instead so duplication gets the same guarantees as a normal create, and translate the not-found error:

```ts
// features/events/domain/use-cases/DuplicateEventUseCase.ts
import type { Event } from "../Event";
import type { IEventRepository } from "../IEventRepository";
import { CreateEventUseCase } from "./CreateEventUseCase";

/** Clones an event's settings, not its guests, with a fresh door code and no date — spec §6. */
export class DuplicateEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  async execute(id: number, newDoorCode: string): Promise<Event> {
    const source = await this.eventRepository.getById(id);
    if (!source) throw new Error("لم يتم العثور على الفعالية.");

    return new CreateEventUseCase(this.eventRepository).execute({
      name: source.name,
      eventDate: null,
      venue: source.venue,
      description: source.description,
      doorCode: newDoorCode,
      capacity: source.capacity,
    });
  }
}
```

- [ ] **Step 10: Run the full suite and confirm nothing broke**

Run: `npm test`
Expected: all test files pass (the existing `"duplicates an event's settings..."` test is unaffected — `"PALM-COPY"` uppercases to itself, and the source event's name/door code were already valid).

- [ ] **Step 11: Commit**

```bash
git add features/auth/domain/use-cases/CreateOwnerUseCase.ts features/auth/domain/use-cases/ChangeOwnerPasswordUseCase.ts features/auth/domain/use-cases/auth-use-cases.test.ts features/events/domain/use-cases/CreateEventUseCase.ts features/events/domain/use-cases/UpdateEventUseCase.ts features/events/domain/use-cases/DuplicateEventUseCase.ts features/events/domain/use-cases/events-use-cases.test.ts
git commit -m "Add event validation and translate domain error messages to Arabic"
```

---

## Task 3: Auth UI — setup, login, logout

Replaces the old single-event `/setup` (which asked for couple names, venue, and a door code — all now event-level, not owner-level) with an owner-only signup, and `/login`. `doorLoginAction` is deliberately not rebuilt here: `/door` and the scanner are a later plan's scope, and Part 1's `requireDoor()` now returns an `eventId`, which means the door-login flow needs an event to resolve against — a design question for that later plan, not this one. `app/door/door-form.tsx` (which currently imports `doorLoginAction`) stays broken along with the rest of `app/guests`, `app/scan`, `app/door`, `app/i`, `app/api/checkin` until then.

This task's Server Actions and view-model hooks are thin (catch a domain error, map it to display state) with no independent logic of their own — per `02-CONVENTIONS.md`'s testing guidance ("a pure pass-through hook doesn't need its own test"), they're verified via the typecheck below and the end-to-end browser walkthrough at the end of this plan, not dedicated unit tests. The domain logic they call (`CreateOwnerUseCase`, `AuthenticateOwnerUseCase`) is already tested in Part 1 and Task 2.

**Files:**
- Create: `app/setup/actions.ts` (replaces old content)
- Create: `app/setup/page.tsx` (replaces old content)
- Create: `features/auth/ui/SetupForm.tsx`
- Create: `features/auth/view-model/useSetupFormViewModel.ts`
- Create: `app/auth-actions.ts` (replaces old content)
- Create: `app/login/page.tsx` (replaces old content)
- Create: `features/auth/ui/LoginForm.tsx`
- Create: `features/auth/view-model/useLoginFormViewModel.ts`
- Delete: `app/login/login-form.tsx` (superseded by `features/auth/ui/LoginForm.tsx`)

**Interfaces:**
- Consumes: `CreateOwnerUseCase`, `CheckSetupStatusUseCase`, `AuthenticateOwnerUseCase` (Part 1 domain, Task 2 for Arabic messages); `makeOwnerRepository()` (Part 1 infrastructure); `setSessionCookie`, `clearSessionCookie`, `getSession` (Part 1 `shared/lib/session-cookie.ts`); `Button` (`@/shared/component/ui/button`), `Card`/`CardContent` (`@/shared/component/ui/card`), `Input` (`@/shared/component/ui/input`), `Field` (`@/shared/component/field`), `ErrorNote` (`@/shared/component/error-note`) — all Task 1.
- Produces: `setupAction`, `SetupState` (`app/setup/actions.ts`); `ownerLoginAction`, `logoutAction`, `AuthState` (`app/auth-actions.ts`) — consumed by their respective view-model hooks in this task, and `logoutAction` also by `Shell` (Task 1).

- [ ] **Step 1: Rewrite the setup Server Action — owner-only, no event fields**

```ts
// app/setup/actions.ts
"use server";

import { redirect } from "next/navigation";
import { CheckSetupStatusUseCase } from "@/features/auth/domain/use-cases/CheckSetupStatusUseCase";
import { CreateOwnerUseCase } from "@/features/auth/domain/use-cases/CreateOwnerUseCase";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import { setSessionCookie } from "@/shared/lib/session-cookie";

export type SetupState = { error?: string };

export async function setupAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const ownerRepository = makeOwnerRepository();
  if (await new CheckSetupStatusUseCase(ownerRepository).execute()) redirect("/login");

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await new CreateOwnerUseCase(ownerRepository).execute({ email, password });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." };
  }

  await setSessionCookie({ role: "owner" });
  redirect("/");
}
```

- [ ] **Step 2: Rewrite the setup page**

```tsx
// app/setup/page.tsx
import { redirect } from "next/navigation";
import { CheckSetupStatusUseCase } from "@/features/auth/domain/use-cases/CheckSetupStatusUseCase";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import SetupForm from "@/features/auth/ui/SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const isSetUp = await new CheckSetupStatusUseCase(makeOwnerRepository()).execute();
  if (isSetUp) redirect("/login");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-12">
      <div className="mb-8 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">التشغيل الأول</p>
        <h1 className="display mt-2 text-4xl text-foreground">مرحباً بك في الباب</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
          أنشئ حسابك الآن، ثم أضف فعالياتك من لوحة التحكم.
        </p>
      </div>
      <SetupForm />
    </main>
  );
}
```

- [ ] **Step 3: Build the setup form and its view-model hook**

```tsx
// features/auth/ui/SetupForm.tsx
"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import { useSetupFormViewModel } from "../view-model/useSetupFormViewModel";

export default function SetupForm() {
  const { error, action, pending } = useSetupFormViewModel();

  return (
    <form action={action}>
      <Card>
        <CardContent className="space-y-4">
          <Field label="البريد الإلكتروني" htmlFor="email" hint="ستستخدمه لتسجيل الدخول.">
            <Input id="email" name="email" type="email" placeholder="you@example.com" required autoFocus dir="ltr" />
          </Field>

          <Field label="كلمة المرور" htmlFor="password" hint="8 أحرف على الأقل.">
            <Input id="password" name="password" type="password" minLength={8} required dir="ltr" />
          </Field>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "جارٍ الإنشاء…" : "إنشاء الحساب"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
```

Note `dir="ltr"` on the email/password inputs — these hold inherently Latin-script values, and pinning their direction keeps the cursor and placeholder behaving correctly inside an otherwise-RTL page. This pattern repeats for every email/password/door-code field in this plan.

```ts
// features/auth/view-model/useSetupFormViewModel.ts
"use client";

import { useActionState } from "react";
import { setupAction, type SetupState } from "@/app/setup/actions";

export function useSetupFormViewModel() {
  const [state, action, pending] = useActionState<SetupState, FormData>(setupAction, {});
  return { error: state.error, action, pending };
}
```

- [ ] **Step 4: Rewrite the owner-facing auth actions — drop doorLoginAction**

```ts
// app/auth-actions.ts
"use server";

import { redirect } from "next/navigation";
import { AuthenticateOwnerUseCase } from "@/features/auth/domain/use-cases/AuthenticateOwnerUseCase";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import { clearSessionCookie, setSessionCookie } from "@/shared/lib/session-cookie";

export type AuthState = { error?: string };

export async function ownerLoginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const session = await new AuthenticateOwnerUseCase(makeOwnerRepository()).execute(email, password);
  if (!session) {
    return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  }

  await setSessionCookie(session);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
```

- [ ] **Step 5: Rewrite the login page**

```tsx
// app/login/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckSetupStatusUseCase } from "@/features/auth/domain/use-cases/CheckSetupStatusUseCase";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import { getSession } from "@/shared/lib/session-cookie";
import LoginForm from "@/features/auth/ui/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const isSetUp = await new CheckSetupStatusUseCase(makeOwnerRepository()).execute();
  if (!isSetUp) redirect("/setup");
  if ((await getSession())?.role === "owner") redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-12">
      <div className="mb-8 text-center">
        <h1 className="display text-4xl text-foreground">أهلاً بعودتك</h1>
        <p className="mt-2 text-sm text-muted-foreground">سجّل الدخول لإدارة فعالياتك.</p>
      </div>

      <LoginForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        هل تعمل على الباب الليلة؟{" "}
        <Link href="/door" className="font-medium text-primary underline underline-offset-4">
          افتح الماسح
        </Link>
      </p>
    </main>
  );
}
```

(The `/door` link stays even though that page is currently broken — it matches the spec's two-ways-in design, and it'll work again once a later plan rebuilds it.)

- [ ] **Step 6: Build the login form and its view-model hook**

```tsx
// features/auth/ui/LoginForm.tsx
"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import { useLoginFormViewModel } from "../view-model/useLoginFormViewModel";

export default function LoginForm() {
  const { error, action, pending } = useLoginFormViewModel();

  return (
    <form action={action}>
      <Card>
        <CardContent className="space-y-4">
          <Field label="البريد الإلكتروني" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus dir="ltr" />
          </Field>
          <Field label="كلمة المرور" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
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

```ts
// features/auth/view-model/useLoginFormViewModel.ts
"use client";

import { useActionState } from "react";
import { ownerLoginAction, type AuthState } from "@/app/auth-actions";

export function useLoginFormViewModel() {
  const [state, action, pending] = useActionState<AuthState, FormData>(ownerLoginAction, {});
  return { error: state.error, action, pending };
}
```

- [ ] **Step 7: Delete the superseded old login form**

```bash
git rm app/login/login-form.tsx
```

- [ ] **Step 8: Verify and run the full test suite**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^(features/auth|app/setup|app/login|app/auth-actions)"`
Expected: no output.

Run: `npm test`
Expected: all test files pass (this task added no new test files — the full suite existing from Task 2 stays green).

- [ ] **Step 9: Commit**

```bash
git add app/setup/actions.ts app/setup/page.tsx features/auth/ui/SetupForm.tsx features/auth/view-model/useSetupFormViewModel.ts app/auth-actions.ts app/login/page.tsx features/auth/ui/LoginForm.tsx features/auth/view-model/useLoginFormViewModel.ts
git commit -m "Add Arabic setup/login UI on shadcn primitives, drop unused doorLoginAction for now"
```

---

## Task 4: Event list (home) page

**Files:**
- Create: `app/page.tsx` (replaces old dashboard content)
- Create: `features/events/ui/EventListPage.tsx`
- `app/settings/` is NOT deleted in this task (Task 6 replaces it) — leave it alone here.

**Interfaces:**
- Consumes: `requireOwner()` (Part 1 `shared/lib/guard.ts`); `ListEventsUseCase` (Part 1 events domain); `makeEventRepository()` (Part 1 events infrastructure); `GetEventStatsUseCase` (Part 1 check-in domain — already built, unused by any UI until now); `makeScanRepository()` (Part 1 check-in infrastructure); `Event`, `EventStatus` (Part 1 `features/events/domain/Event.ts`); `EventStats` (Part 1 `features/check-in/domain/ScanEvent.ts`); `Shell`, `PageHeading` (Task 1 `@/shared/component/Shell`); `EmptyState` (`@/shared/component/empty-state`); `Badge` (`@/shared/component/ui/badge`); `Button` (`@/shared/component/ui/button`); `Card` (`@/shared/component/ui/card`).
- Produces: `EventListPage` component and its `EventWithStats` type — this is the new home page every other page in this plan links back to.

- [ ] **Step 1: Rewrite the home page as the event list, with per-event quick stats**

```tsx
// app/page.tsx
import { requireOwner } from "@/shared/lib/guard";
import { GetEventStatsUseCase } from "@/features/check-in/domain/use-cases/GetEventStatsUseCase";
import { ListEventsUseCase } from "@/features/events/domain/use-cases/ListEventsUseCase";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import EventListPage, { type EventWithStats } from "@/features/events/ui/EventListPage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireOwner();

  const events = await new ListEventsUseCase(makeEventRepository()).execute();
  const scanRepository = makeScanRepository();
  const eventsWithStats: EventWithStats[] = await Promise.all(
    events.map(async (event) => ({
      event,
      stats: await new GetEventStatsUseCase(scanRepository).execute(event.id),
    })),
  );

  return <EventListPage events={eventsWithStats} />;
}
```

- [ ] **Step 2: Build the event list page component**

Archived events are filtered out of the default view here — per spec §6, archiving should move an event out of the list, and `IEventRepository.list()` deliberately returns every event regardless of status (the repository doesn't know what a caller wants to show); the UI layer is where that filtering belongs. Event status doesn't map onto shadcn's default `Badge` variants (`default`/`secondary`/`destructive`/`outline` — none of them is "success green"), so the "live" case overrides the badge's color via `className` using this project's existing `--color-good-*` tokens, which coexist with shadcn's own variable set (see Task 1, Step 6).

```tsx
// features/events/ui/EventListPage.tsx
import Link from "next/link";
import { Shell, PageHeading } from "@/shared/component/Shell";
import { EmptyState } from "@/shared/component/empty-state";
import { Badge } from "@/shared/component/ui/badge";
import { Button } from "@/shared/component/ui/button";
import { Card } from "@/shared/component/ui/card";
import type { EventStats } from "@/features/check-in/domain/ScanEvent";
import type { Event } from "../domain/Event";

export type EventWithStats = { event: Event; stats: EventStats };

function formatEventDate(eventDate: string | null): string | null {
  if (!eventDate) return null;
  return new Date(`${eventDate}T00:00:00`).toLocaleDateString("ar-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function EventStatusBadge({ status }: { status: Event["status"] }) {
  if (status === "live") {
    return <Badge className="border-transparent bg-good-soft text-good-ink">نشطة</Badge>;
  }
  return <Badge variant="secondary">{status === "draft" ? "مسودة" : "مؤرشفة"}</Badge>;
}

export default function EventListPage({ events }: { events: EventWithStats[] }) {
  const visible = events.filter(({ event }) => event.status !== "archived");

  return (
    <Shell>
      <PageHeading
        title="الفعاليات"
        action={
          <Button asChild>
            <Link href="/events/new">فعالية جديدة</Link>
          </Button>
        }
      />

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            title="لا توجد فعاليات بعد"
            body="أنشئ أول فعالية لك، وستحصل كل دعوة فيها على رمز QR خاص بها."
            action={
              <Button asChild>
                <Link href="/events/new">فعالية جديدة</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(({ event, stats }) => {
            const when = formatEventDate(event.eventDate);

            return (
              <Link key={event.id} href={`/events/${event.id}`} className="block">
                <Card className="h-full p-5 transition-colors hover:bg-muted">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="display text-lg text-foreground">{event.name}</h2>
                    <EventStatusBadge status={event.status} />
                  </div>
                  {when ? <p className="mt-1 text-sm text-muted-foreground">{when}</p> : null}
                  {event.venue ? <p className="text-sm text-muted-foreground">{event.venue}</p> : null}

                  <p className="mt-4 text-sm text-muted-foreground tabular">
                    {stats.seatsInside} من {stats.seatsInvited} حضروا
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
```

- [ ] **Step 3: Verify and run the full test suite**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^(features/events/ui|app/page.tsx)"`
Expected: no output.

Run: `npm test`
Expected: all test files pass (no new test files this task — same reasoning as Task 3: this is presentational, verified by typecheck and the end-to-end walkthrough at the end of this plan).

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx features/events/ui/EventListPage.tsx
git commit -m "Add the event list as the new Arabic home page, with per-event quick stats"
```

---

## Task 5: Create event flow

**Files:**
- Create: `app/events/new/page.tsx`
- Create: `app/events/actions.ts`
- Create: `features/events/ui/CreateEventForm.tsx`
- Create: `features/events/view-model/useCreateEventFormViewModel.ts`

**Interfaces:**
- Consumes: `requireOwner()`; `CreateEventUseCase` (Task 2's validated version); `makeEventRepository()`; `generateDoorCode()` (Part 1 `shared/lib/codes.ts`); `Shell`, `PageHeading` (Task 1); `Field` (`@/shared/component/field`); `ErrorNote` (`@/shared/component/error-note`); `Button` (`@/shared/component/ui/button`); `Card`/`CardContent` (`@/shared/component/ui/card`); `Input` (`@/shared/component/ui/input`); `Textarea` (`@/shared/component/ui/textarea`).
- Produces: `createEventAction`, `EventFormState` (`app/events/actions.ts`) — Task 6 also imports from this same file (`updateEventAction`, `archiveEventAction`, `duplicateEventAction` are added there in Task 6, not this one; this task only adds `createEventAction`).

- [ ] **Step 1: Create the Server Actions file for events, starting with create**

```ts
// app/events/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CreateEventUseCase } from "@/features/events/domain/use-cases/CreateEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";

export type EventFormState = { error?: string; ok?: string };

function parseCapacity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readEventInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    eventDate: String(formData.get("eventDate") ?? "").trim() || null,
    venue: String(formData.get("venue") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    doorCode: String(formData.get("doorCode") ?? ""),
    capacity: parseCapacity(String(formData.get("capacity") ?? "")),
  };
}

export async function createEventAction(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  await requireOwner();

  let eventId: number;
  try {
    const event = await new CreateEventUseCase(makeEventRepository()).execute(readEventInput(formData));
    eventId = event.id;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." };
  }

  revalidatePath("/");
  redirect(`/events/${eventId}`);
}
```

- [ ] **Step 2: Build the new-event page**

```tsx
// app/events/new/page.tsx
import { Shell, PageHeading } from "@/shared/component/Shell";
import { generateDoorCode } from "@/shared/lib/codes";
import { requireOwner } from "@/shared/lib/guard";
import CreateEventForm from "@/features/events/ui/CreateEventForm";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  await requireOwner();

  return (
    <Shell>
      <PageHeading title="فعالية جديدة" />
      <CreateEventForm suggestedDoorCode={generateDoorCode()} />
    </Shell>
  );
}
```

- [ ] **Step 3: Build the create-event form and its view-model hook**

```tsx
// features/events/ui/CreateEventForm.tsx
"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import { Textarea } from "@/shared/component/ui/textarea";
import { useCreateEventFormViewModel } from "../view-model/useCreateEventFormViewModel";

export default function CreateEventForm({ suggestedDoorCode }: { suggestedDoorCode: string }) {
  const { error, action, pending } = useCreateEventFormViewModel();

  return (
    <form action={action}>
      <Card>
        <CardContent className="space-y-4">
          <Field label="اسم الفعالية" htmlFor="name">
            <Input id="name" name="name" placeholder="مثال: حفل زفاف ليلى وعمر" required autoFocus />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التاريخ" htmlFor="eventDate">
              <Input id="eventDate" name="eventDate" type="date" />
            </Field>
            <Field label="المكان" htmlFor="venue">
              <Input id="venue" name="venue" placeholder="اسم القاعة" />
            </Field>
          </div>

          <Field label="الوصف" htmlFor="description" hint="اختياري.">
            <Textarea id="description" name="description" rows={3} />
          </Field>

          <Field label="رمز الباب" htmlFor="doorCode" hint="شاركه مع فريق الاستقبال عند بدء الفعالية.">
            <Input
              id="doorCode"
              name="doorCode"
              defaultValue={suggestedDoorCode}
              minLength={4}
              required
              dir="ltr"
              className="tabular uppercase"
            />
          </Field>

          <Field label="السعة القصوى" htmlFor="capacity" hint="اختياري.">
            <Input id="capacity" name="capacity" type="number" min={1} inputMode="numeric" />
          </Field>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <Button type="submit" disabled={pending}>
            {pending ? "جارٍ الإنشاء…" : "إنشاء"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
```

```ts
// features/events/view-model/useCreateEventFormViewModel.ts
"use client";

import { useActionState } from "react";
import { createEventAction, type EventFormState } from "@/app/events/actions";

export function useCreateEventFormViewModel() {
  const [state, action, pending] = useActionState<EventFormState, FormData>(createEventAction, {});
  return { error: state.error, action, pending };
}
```

- [ ] **Step 4: Verify and run the full test suite**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^(features/events|app/events)"`
Expected: no output.

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 5: Commit**

```bash
git add app/events/new/page.tsx app/events/actions.ts features/events/ui/CreateEventForm.tsx features/events/view-model/useCreateEventFormViewModel.ts
git commit -m "Add the create-event flow, in Arabic with a suggested door code"
```

---

## Task 6: Event settings — edit, archive, duplicate

Replaces `app/settings/` entirely (that route was single-event; every event now has its own settings page at `/events/[id]`).

**Files:**
- Create: `app/events/[id]/page.tsx`
- Modify: `app/events/actions.ts` (add `updateEventAction`, `archiveEventAction`, `duplicateEventAction`)
- Create: `features/events/ui/EventSettingsPage.tsx`
- Create: `features/events/ui/EventSettingsForm.tsx`
- Create: `features/events/view-model/useEventSettingsFormViewModel.ts`
- Create: `features/events/ui/DuplicateEventButton.tsx`
- Create: `features/events/ui/ArchiveEventButton.tsx`
- Delete: `app/settings/page.tsx`, `app/settings/event-form.tsx`, `app/settings/password-form.tsx`, `app/settings/actions.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `requireOwner()`; `GetEventUseCase`, `UpdateEventUseCase` (Task 2's validated version), `ArchiveEventUseCase`, `DuplicateEventUseCase` (Task 2's version); `makeEventRepository()`; `generateDoorCode()`; `Shell`, `PageHeading` (Task 1); `Field`, `ErrorNote`; `Button`, `Card`/`CardContent`/`CardHeader`/`CardTitle`, `Input`, `Textarea` (Task 1's shadcn primitives); `EventFormState`, `createEventAction` (Task 5's `app/events/actions.ts`, extended here).
- Produces: `updateEventAction`, `archiveEventAction`, `duplicateEventAction` added to `app/events/actions.ts` — nothing outside this task consumes them (this plan's last task).

- [ ] **Step 1: Add update/archive/duplicate actions to app/events/actions.ts**

Add these three functions to the end of `app/events/actions.ts` (the file Task 5 created with `createEventAction`, `readEventInput`, `parseCapacity`, `EventFormState` — reuse `readEventInput` and `EventFormState`, don't redefine them):

```ts
import { ArchiveEventUseCase } from "@/features/events/domain/use-cases/ArchiveEventUseCase";
import { DuplicateEventUseCase } from "@/features/events/domain/use-cases/DuplicateEventUseCase";
import { UpdateEventUseCase } from "@/features/events/domain/use-cases/UpdateEventUseCase";
import { generateDoorCode } from "@/shared/lib/codes";

export async function updateEventAction(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  await requireOwner();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "لم يتم العثور على الفعالية." };

  try {
    await new UpdateEventUseCase(makeEventRepository()).execute(id, readEventInput(formData));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." };
  }

  revalidatePath("/");
  revalidatePath(`/events/${id}`);
  return { ok: "تم الحفظ." };
}

export async function archiveEventAction(formData: FormData): Promise<void> {
  await requireOwner();

  const id = Number(formData.get("id"));
  if (Number.isInteger(id)) await new ArchiveEventUseCase(makeEventRepository()).execute(id);

  revalidatePath("/");
  redirect("/");
}

export async function duplicateEventAction(formData: FormData): Promise<void> {
  await requireOwner();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) redirect("/");

  const copy = await new DuplicateEventUseCase(makeEventRepository()).execute(id, generateDoorCode());

  revalidatePath("/");
  redirect(`/events/${copy.id}`);
}
```

Add the three new imports (`ArchiveEventUseCase`, `DuplicateEventUseCase`, `UpdateEventUseCase`, `generateDoorCode`) to the top of the file alongside the existing ones from Task 5 — don't duplicate the `CreateEventUseCase`, `makeEventRepository`, `requireOwner`, `redirect`, `revalidatePath` imports already there.

Note `updateEventAction` does **not** redirect — it returns `{ ok: "تم الحفظ." }` so the owner stays on the same page with an inline confirmation, matching the original single-event app's settings-save UX. `createEventAction` (Task 5) and `duplicateEventAction` do redirect, since "create/duplicate then view the result" is the natural flow for those.

- [ ] **Step 2: Build the event settings route**

```tsx
// app/events/[id]/page.tsx
import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";
import EventSettingsPage from "@/features/events/ui/EventSettingsPage";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const event = await new GetEventUseCase(makeEventRepository()).execute(Number(id));
  if (!event) notFound();

  return <EventSettingsPage event={event} />;
}
```

- [ ] **Step 3: Build the event settings page, form, and action buttons**

```tsx
// features/events/ui/EventSettingsPage.tsx
import Link from "next/link";
import { Shell, PageHeading } from "@/shared/component/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/component/ui/card";
import type { Event } from "../domain/Event";
import ArchiveEventButton from "./ArchiveEventButton";
import DuplicateEventButton from "./DuplicateEventButton";
import EventSettingsForm from "./EventSettingsForm";

export default function EventSettingsPage({ event }: { event: Event }) {
  return (
    <Shell>
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ‹ رجوع إلى الفعاليات
      </Link>

      <div className="mt-3">
        <PageHeading title={event.name} hint={event.venue ?? undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <EventSettingsForm event={event} />

        <Card>
          <CardHeader>
            <CardTitle>إجراءات أخرى</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <DuplicateEventButton eventId={event.id} />
            <ArchiveEventButton eventId={event.id} />
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
```

```tsx
// features/events/ui/EventSettingsForm.tsx
"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import { Textarea } from "@/shared/component/ui/textarea";
import type { Event } from "../domain/Event";
import { useEventSettingsFormViewModel } from "../view-model/useEventSettingsFormViewModel";

export default function EventSettingsForm({ event }: { event: Event }) {
  const { error, ok, action, pending } = useEventSettingsFormViewModel();

  return (
    <Card>
      <CardHeader>
        <CardTitle>تفاصيل الفعالية</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={event.id} />

          <Field label="اسم الفعالية" htmlFor="name">
            <Input id="name" name="name" defaultValue={event.name} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التاريخ" htmlFor="eventDate">
              <Input id="eventDate" name="eventDate" type="date" defaultValue={event.eventDate ?? ""} />
            </Field>
            <Field label="المكان" htmlFor="venue">
              <Input id="venue" name="venue" defaultValue={event.venue ?? ""} />
            </Field>
          </div>

          <Field label="الوصف" htmlFor="description" hint="اختياري.">
            <Textarea id="description" name="description" rows={3} defaultValue={event.description ?? ""} />
          </Field>

          <Field label="رمز الباب" htmlFor="doorCode" hint="شاركه مع فريق الاستقبال.">
            <Input
              id="doorCode"
              name="doorCode"
              defaultValue={event.doorCode}
              minLength={4}
              required
              dir="ltr"
              className="tabular uppercase"
            />
          </Field>

          <Field label="السعة القصوى" htmlFor="capacity" hint="اختياري.">
            <Input
              id="capacity"
              name="capacity"
              type="number"
              min={1}
              inputMode="numeric"
              defaultValue={event.capacity ?? ""}
            />
          </Field>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {ok ? <p className="text-sm text-good-ink">{ok}</p> : null}

          <Button type="submit" disabled={pending}>
            {pending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

```ts
// features/events/view-model/useEventSettingsFormViewModel.ts
"use client";

import { useActionState } from "react";
import { updateEventAction, type EventFormState } from "@/app/events/actions";

export function useEventSettingsFormViewModel() {
  const [state, action, pending] = useActionState<EventFormState, FormData>(updateEventAction, {});
  return { error: state.error, ok: state.ok, action, pending };
}
```

```tsx
// features/events/ui/DuplicateEventButton.tsx
"use client";

import { Button } from "@/shared/component/ui/button";
import { duplicateEventAction } from "@/app/events/actions";

export default function DuplicateEventButton({ eventId }: { eventId: number }) {
  return (
    <form action={duplicateEventAction}>
      <input type="hidden" name="id" value={eventId} />
      <Button type="submit" variant="outline" className="w-full">
        نسخ هذه الفعالية
      </Button>
    </form>
  );
}
```

```tsx
// features/events/ui/ArchiveEventButton.tsx
"use client";

import { useState } from "react";
import { Button } from "@/shared/component/ui/button";
import { archiveEventAction } from "@/app/events/actions";

export default function ArchiveEventButton({ eventId }: { eventId: number }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full border-destructive text-destructive hover:bg-destructive/10"
        onClick={() => setConfirming(true)}
      >
        أرشفة هذه الفعالية
      </Button>
    );
  }

  return (
    <form action={archiveEventAction} className="flex gap-2">
      <input type="hidden" name="id" value={eventId} />
      <Button type="submit" variant="destructive" className="flex-1">
        تأكيد الأرشفة
      </Button>
      <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirming(false)}>
        إلغاء
      </Button>
    </form>
  );
}
```

`ArchiveEventButton`'s `useState` is local UI-only toggle state (is the confirm step showing), not business logic — it stays directly in the `ui/` component rather than a view-model hook, the same way any purely presentational interaction state would in a React app; the *action* it eventually submits still goes through the Server Action composition root, same as every other mutation in this plan. `variant="destructive"` is a built-in shadcn `Button` variant — no custom "danger" tone needed here, unlike the event-status badge.

- [ ] **Step 4: Delete the old single-event settings route**

```bash
git rm app/settings/page.tsx app/settings/event-form.tsx app/settings/password-form.tsx app/settings/actions.ts
```

(This leaves `ChangeOwnerPasswordUseCase`, built in Part 1, with no UI consumer yet — password change deserves its own small page, but nothing in this plan's scope needs it yet. That's a known, deliberate gap for a later small task, not an oversight.)

- [ ] **Step 5: Update the README's screen table**

In `README.md`, replace the "The five screens" table and its surrounding two sentences with:

```markdown
## The screens so far

| Screen | Who | What it does |
|---|---|---|
| `/setup` | you, once | Create your owner account |
| `/login` | you | Sign in |
| `/` | you | Your list of events, with quick stats |
| `/events/new` | you | Create a new event |
| `/events/[id]` | you | That event's details, door code, duplicate/archive |

Guest management, QR invitations, and the door scanner are being rebuilt for
multiple events and aren't wired up yet — that's the next plan.
```

- [ ] **Step 6: Verify and run the full test suite**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^(features/events|app/events)"`
Expected: no output.

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 7: Commit**

```bash
git add app/events/[id]/page.tsx app/events/actions.ts features/events/ui/EventSettingsPage.tsx features/events/ui/EventSettingsForm.tsx features/events/view-model/useEventSettingsFormViewModel.ts features/events/ui/DuplicateEventButton.tsx features/events/ui/ArchiveEventButton.tsx README.md
git commit -m "Add event settings (edit/archive/duplicate), remove old single-event settings route"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage for this slice:** spec §5 (auth) via Task 3. Spec §6's event-list/event-settings portions via Tasks 4 and 6 (guest management and QR cards from §6/§8 are explicitly out of scope — a later plan). Spec §10 (Arabic/RTL/mobile-first) via Task 1's font/direction/logical-property foundation, applied consistently in every subsequent task's copy and markup.
- **Known gaps, deliberately left open:** password-change UI (Task 6's note); door login (Task 3's note) — both flagged inline where they arise, not silently dropped.
- **Type consistency check performed:** `EventFormState` (`{error?, ok?}`) is defined once in Task 5's `app/events/actions.ts` and reused — not redefined — by Task 6's additions to the same file and by both view-model hooks that consume it (`useCreateEventFormViewModel` only reads `.error`; `useEventSettingsFormViewModel` reads both `.error` and `.ok`, both valid against the one shared type). `Event`/`EventStats` field names used in `EventListPage`/`EventSettingsForm` match `features/events/domain/Event.ts` and `features/check-in/domain/ScanEvent.ts` exactly (no renamed fields). Every `<Field>` usage across Tasks 3, 5, 6 pairs an explicit `id` on its `Input`/`Textarea` with the matching `htmlFor` on `Field` — checked one by one, since `shadcn`'s `Label` (unlike the earlier hand-rolled version) doesn't implicitly associate by wrapping.
- **Verification strategy:** UI-layer tasks (3, 4, 5, 6) rely on scoped typecheck + the full existing Part 1/Task 2 test suite staying green, not new automated tests — per `02-CONVENTIONS.md`'s own carve-out for pass-through view-model hooks and the practical reality that these are thin, mostly-markup files. The gap this leaves (does the actual rendered flow work?) is closed by the end-to-end pass below, not skipped. Task 1's CSS-variable reconciliation (Step 6) is the one step in this whole plan with genuine "did the tool do what I expect" uncertainty — its own step calls that out explicitly rather than assuming a clean merge.

## End-to-end verification (done once, after all tasks — not a dispatched task)

The controller (not a subagent) should walk through this in a browser before considering the plan done:

1. `docker compose up -d` (if not already running), `npm run dev`.
2. Visit `/` — should redirect to `/setup` (no owner yet).
3. Fill the setup form with a bad email → see the Arabic error, inline, page doesn't navigate away.
4. Fill it correctly → land on `/` showing "لا توجد فعاليات بعد" (empty state).
5. Click "فعالية جديدة" → fill the create form, including a lowercase door code → submit → land on that event's settings page, confirm the door code displays uppercase.
6. Go back to `/` → the new event's card shows, with Western-digit stats ("0 من 0 حضروا") and the Arabic date formatted correctly.
7. Edit the event's name on its settings page → save → confirm "تم الحفظ." shows inline and the change persists on reload.
8. Duplicate the event → confirm a second event appears with the same name, a different door code, no date.
9. Archive one of the two → confirm it disappears from the home list.
10. Resize to a mobile viewport (or use the browser's device toolbar) — confirm the layout stays single-column, text doesn't overflow, and RTL reads right-to-left throughout (form labels, the shell's sign-out button on the left edge since it's `ms-auto` in RTL, card content alignment, button/badge colors matching the warm palette rather than shadcn's neutral defaults).
11. Sign out → confirm redirect to `/login` → sign back in → confirm landing on `/` with the events still there.

## Next

A later plan builds guest management and QR cards (spec §6's guest list, §7's search/quick-add, §8) — `features/guests/ui`/`view-model` on top of Part 1's already-built `features/guests` domain/infrastructure, plus `next/og` for the QR card image, and more shadcn components as needed (`npx shadcn@latest add <name>`, same pattern as Task 1). Another later plan covers the door scanner (spec §7's scan flow, the `CheckInGuestUseCase`/`CheckOutGuestUseCase` decision logic Part 1 deliberately deferred, manual search check-in, and walk-in quick-add) — that one also needs to resolve how an owner opens a specific event's scanner, a design question this plan's Task 3 explicitly punted.
