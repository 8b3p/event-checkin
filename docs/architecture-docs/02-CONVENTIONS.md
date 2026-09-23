# Conventions

Pairs with [`01-ARCHITECTURE.md`](./01-ARCHITECTURE.md) (the layer rules)
and [`03-STACK-AND-RATIONALE.md`](./03-STACK-AND-RATIONALE.md) (which
concrete libraries fill the roles referenced here). Examples below use a
generic `Widget` domain entity — substitute your own.

Anything a team marks _(decide at kickoff)_ in its own copy of this
document is a real open decision, not a default to guess at silently —
resolve it explicitly and record why, so the next session doesn't
re-litigate it.

---

## Naming

| Artifact | Pattern | Example |
| --- | --- | --- |
| UI component | `PascalCase.tsx` | `WidgetCard.tsx` |
| View-model hook | `use<Name>ViewModel.ts` | `useWidgetCardViewModel.ts` |
| Use-case class | `<Verb><Noun>UseCase.ts` | `FetchWidgetsUseCase.ts` |
| Repository interface | `I<Name>Repository.ts` | `IWidgetRepository.ts` |
| Repository implementation | `<Name>Repository.ts` | `WidgetRepository.ts` |
| DI token | `TOKENS.<NOUN>` | `TOKENS.WIDGET_REPOSITORY` |
| Pure domain helper | `camelCase.ts` (+ `.test.ts`) | `resolveWidgetLabel.ts` |
| Demo/fixture data | `<noun>DemoItems.ts` in `domain/` | `widgetListDemoItems.ts` |

---

## Folder layout of a feature slice

```
features/<domain>/
├── domain/
│   ├── <Entity>.ts                     # entity types (prefer extending the generated API types)
│   ├── I<Name>Repository.ts            # repository interface
│   ├── <helper>.ts / <helper>.test.ts  # pure logic + unit tests
│   └── use-cases/
│       └── <Verb><Noun>UseCase.ts
├── infrastructure/
│   └── <Name>Repository.ts             # implements domain interface, calls the generated client
├── view-model/
│   └── use<Screen>ViewModel.ts
└── ui/
    ├── <Screen>Page.tsx
    └── <sub-components>.tsx
```

---

## DI container

Adding a repository or use-case:

1. **Token** — add to the token file:
   ```ts
   WIDGET_REPOSITORY: Symbol("IWidgetRepository"),
   FETCH_WIDGETS_USE_CASE: Symbol("FetchWidgetsUseCase"),
   ```
2. **Decorate** — mark the class injectable; tag every injected
   constructor parameter with its token explicitly (see
   `03-STACK-AND-RATIONALE.md` for why implicit type-based resolution
   cannot be relied on).
3. **Bind** — in the container's binding file:
   ```ts
   container.bind(TOKENS.WIDGET_REPOSITORY).to(WidgetRepository).inSingletonScope();
   container.bind(TOKENS.FETCH_WIDGETS_USE_CASE).to(FetchWidgetsUseCase).inTransientScope();
   ```
4. **Resolve** — only in a view-model hook:
   `container.get(TOKENS.FETCH_WIDGETS_USE_CASE)`.

Rules:

- Repositories are **singletons**; use-cases are **transient**.
- A repository holding mutable in-memory state (e.g. a mock or cached
  store) **must** be a singleton, or that state silently resets on every
  resolve.
- Never `new` a use-case or repository in a hook or component.
- Never resolve from the container inside a UI component.

---

## Use-case shape

```ts
import { inject, injectable } from "your-di-library";
import { TOKENS } from "@/shared/container/tokens";
import type { IWidgetRepository } from "../IWidgetRepository";
import type { Widget } from "@/api/generated/types.gen";

@injectable()
export class FetchWidgetsUseCase {
  constructor(
    @inject(TOKENS.WIDGET_REPOSITORY)
    private readonly widgetRepository: IWidgetRepository
  ) {}

  execute(): Promise<Widget[]> {
    return this.widgetRepository.fetchAll();
  }
}
```

One public method, `execute`. Orchestration and domain rules live here —
not in the repository, not in the hook.

---

## Repository shape

```ts
import { injectable } from "your-di-library";
import { listWidgets } from "@/api/generated/sdk.gen";
import type { IWidgetRepository } from "../domain/IWidgetRepository";
import type { Widget } from "@/api/generated/types.gen";

@injectable()
export class WidgetRepository implements IWidgetRepository {
  async fetchAll(): Promise<Widget[]> {
    const result = await listWidgets({ throwOnError: true });
    return result.data.data;
  }
}
```

- Unwrap the API response envelope here, once. Guard nullable/optional
  fields before returning.
- If the repository returns an extended or view-specific shape, map it
  here — not in the hook.

---

## View-model hook shape

```ts
import { container } from "@/shared/container";
import { TOKENS } from "@/shared/container/tokens";
import type { FetchWidgetsUseCase } from "../domain/use-cases/FetchWidgetsUseCase";

export function useWidgetListViewModel() {
  // server state via the chosen data-fetching library:
  const query = /* useQuery-style hook */ {
    queryKey: ["widgets"],
    queryFn: () => container.get<FetchWidgetsUseCase>(TOKENS.FETCH_WIDGETS_USE_CASE).execute(),
  };

  return {
    widgets: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
```

- The hook returns view-ready data and handlers. No markup, no styling.

---

## TypeScript

- **No `any`.** Anywhere.
- Never access an error property on an `unknown` catch value directly —
  route it through one shared `formatUnknownError(err, fallback)` helper.
- Never redefine a type that already exists in the generated API types —
  extend it.
- Strict mode on, everywhere, with no per-file opt-outs.

---

## UI & styling

- Design-system primitives live in one shared location. Feature code
  imports from there (or from shared composed-component wrappers) —
  **never** directly from the underlying primitive/component library.
  This is what lets the design system evolve, or the underlying primitive
  library get swapped, without touching every feature.
- One utility-class styling approach + design tokens (CSS variables or
  equivalent), applied consistently. Avoid mixing styling paradigms
  (utility classes in some places, component-scoped stylesheets in
  others) — pick one per project and enforce it.
- Merge/compose class names through one small shared helper, not ad hoc
  string concatenation scattered through components.
- One icon library, used exclusively — mixing icon sets is a design-system
  leak, not a neutral choice.
- Route cross-cutting UI concerns (toasts, dialogs, confirm prompts)
  through one shared service wrapper each, never by calling the
  underlying library directly from feature code — the wrapper is the
  seam that lets you change the underlying library once, centrally.
- If the app is RTL-capable / localised: use logical properties (start/end,
  not left/right) throughout, and derive direction-sensitive UI (which
  side a drawer opens from, etc.) from the active locale rather than
  hardcoding a direction.

---

## Data fetching

- All server reads/writes go through a use-case resolved from the
  container, called inside a view-model hook.
- Never fetch directly inside a UI-layer effect. Use the chosen
  query/caching library, invoked from `view-model/`.
- Never call the generated API client's functions outside
  `infrastructure/`.

---

## Forms

- One form-state library + one schema-validation library, paired through
  their official resolver/adapter (e.g. a form library's zod/yup
  resolver) — not hand-rolled validation, and not a second form-state
  implementation living alongside the first.
- Schemas are defined in `domain/` (or the view-model layer, if a project
  chooses to keep schemas closer to the form), so validation rules are
  colocated with domain rules rather than scattered across UI files.
- **Never bind a controlled design-system primitive (e.g. a
  Radix-style `Select`) straight to a form library's field-registration
  API** if the primitive doesn't expose the plain DOM input contract that
  API expects — go through a wrapper component built for that purpose.
- If a project has already standardized on one form pattern, a new
  feature adopts it rather than introducing a second. Two live
  form-state implementations in the same codebase is a maintenance trap
  worth guarding against with an automated check, not just a convention
  (see **Testing** below).

---

## Testing

- **Domain layer:** unit tests for every use-case with real logic and
  every pure helper. No framework, no mocks beyond hand-written fakes
  for repository interfaces.
- **View-model layer:** tests wherever the mapping or derived state is
  non-trivial — a pure pass-through hook doesn't need its own test, a
  hook that transforms, filters, or combines results does.
- **UI layer:** component tests for interactive components, rendered
  against a hand-built view-model return value.
- **End-to-end:** covers critical user-facing flows across the whole
  stack, not a substitute for the layer-specific tests above.
- A feature slice isn't "done" until its domain tests pass and the
  project's static checks (typecheck, lint, format, coverage) are green.
  If a project enforces 100% coverage, treat a coverage gap as a missing
  test, never as a reason to add an exclusion or lower the bar — an
  exclusion is how real bugs stop being caught.

---

## Docs governance

If a project is deliberately designed to survive many independent
sessions (human or agent) without a shared memory of what was decided and
why, don't just write this down once — enforce it:

- Keep every binding rule discoverable from one indexed entry point
  (a root docs README), not buried in a chat log or a single person's
  memory.
- For any rule worth enforcing rather than just documenting (a single
  form standard, a layering boundary, a naming pattern), back it with an
  automated check — a lint rule, an architecture-boundary test, or a
  structural test asserting the invariant — so drift fails a build
  instead of surviving as an unreviewed diff.
- Record non-obvious decisions (see `03-STACK-AND-RATIONALE.md` for the
  format) at the point they're made, not reconstructed later from memory.
