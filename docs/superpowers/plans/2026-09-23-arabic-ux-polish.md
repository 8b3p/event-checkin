# Arabic UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three independent Arabic-language correctness/UX defects found in the final review of the guest-management plan: wrong pluralization for n=2 and n>=11, non-normalizing Arabic search, and a silently-swallowed guest-delete error.

**Architecture:** Two new pure-function helpers in `shared/lib/` (`pluralizeAr`, `normalizeAr`), each unit-tested like the existing `shared/lib/codes.ts` helpers, wired into the 7 call sites that currently duplicate pluralization ternaries and into `GuestManager.tsx`'s client-side search filter. The delete-guest server action is converted from a fire-and-forget `redirect`-only action to the same `useActionState` + `ErrorNote` pattern already used by `EditGuestForm`/`useEditGuestFormViewModel`, so a failed delete surfaces an error instead of silently returning to an unchanged list.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19 (`useActionState`), TypeScript, Vitest.

**Spec:** Final-review findings for `docs/superpowers/plans/2026-09-22-guest-management-and-qr-cards.md` (summarized in this plan's task descriptions — no separate spec file exists).

## Global Constraints

- Match existing code style exactly: no comments except where genuinely non-obvious (see `shared/lib/codes.ts` for the house style on when a comment earns its place).
- No new abstractions beyond what's needed — e.g. don't build a generic i18n/pluralization library, just the two functions asked for.
- Only `shared/lib/*.ts` (pure logic) gets unit tests in this codebase's convention — UI components (`.tsx`) and Next.js server actions (`actions.ts`) are not unit-tested here (verified: no `.test.tsx` files and no tests for any existing `actions.ts`). Don't introduce that pattern for this change; verify UI/action wiring via `npm run typecheck`, `npm run lint`, and manual browser testing instead.
- The three fixes are independent — implement, test, and commit each one separately — but all land in one PR.

---

### Task 1: `pluralizeAr` helper + wire into all 7 call sites

**Files:**
- Create: `shared/lib/pluralize-ar.ts`
- Test: `shared/lib/pluralize-ar.test.ts`
- Modify: `features/guests/ui/GuestListPage.tsx:22`
- Modify: `features/guests/ui/GuestManager.tsx:92`
- Modify: `features/guests/ui/GuestDetailPage.tsx:29`
- Modify: `features/guests/ui/ShareInvite.tsx:23`
- Modify: `app/i/[code]/page.tsx:63`
- Modify: `app/events/[id]/guests/[guestId]/card/render-card.tsx:168`
- Modify: `app/events/[id]/guests/actions.ts:61`

**Interfaces:**
- Produces: `pluralizeAr(n: number, forms: { one: string; two: string; few: string; many: string }): string` from `shared/lib/pluralize-ar.ts`. Rule: `n === 1` → `forms.one` (a complete phrase, no number prefixed — matches existing call sites which never prefix a number on the singular case). `n === 2` → `forms.two` (dual, also a complete phrase, no number prefixed). `n % 100` in `3..10` → `` `${n} ${forms.few}` ``. Everything else (0, 11-99, 100+) → `` `${n} ${forms.many}` ``.

- [ ] **Step 1: Write the failing test**

```typescript
// shared/lib/pluralize-ar.test.ts
import { describe, expect, it } from "vitest";
import { pluralizeAr } from "./pluralize-ar";

const FORMS = { one: "دعوة واحدة", two: "دعوتان", few: "دعوات", many: "دعوة" };

describe("pluralizeAr", () => {
  it("uses the one-form for 1, with no number prefixed", () => {
    expect(pluralizeAr(1, FORMS)).toBe("دعوة واحدة");
  });

  it("uses the dual form for 2, with no number prefixed", () => {
    expect(pluralizeAr(2, FORMS)).toBe("دعوتان");
  });

  it("uses the few-form with the number for 3-10", () => {
    expect(pluralizeAr(3, FORMS)).toBe("3 دعوات");
    expect(pluralizeAr(10, FORMS)).toBe("10 دعوات");
  });

  it("uses the many-form with the number for 11-99", () => {
    expect(pluralizeAr(11, FORMS)).toBe("11 دعوة");
    expect(pluralizeAr(50, FORMS)).toBe("50 دعوة");
    expect(pluralizeAr(99, FORMS)).toBe("99 دعوة");
  });

  it("uses the many-form for 0 and for round hundreds", () => {
    expect(pluralizeAr(0, FORMS)).toBe("0 دعوة");
    expect(pluralizeAr(100, FORMS)).toBe("100 دعوة");
  });

  it("uses the few-form again for 103-110 (n % 100 in 3-10)", () => {
    expect(pluralizeAr(103, FORMS)).toBe("103 دعوات");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/lib/pluralize-ar.test.ts`
Expected: FAIL — `Cannot find module './pluralize-ar'`

- [ ] **Step 3: Write the implementation**

```typescript
// shared/lib/pluralize-ar.ts
export type ArabicPluralForms = {
  one: string;
  two: string;
  few: string;
  many: string;
};

/**
 * Arabic numeral-noun agreement: 1 and 2 use standalone one/dual phrases
 * (the word itself carries the count, so no number is prefixed); 3-10 use
 * the plural form with the number prefixed; 11+ (and 0, and round
 * hundreds) revert to the singular-with-tanwin "many" form, still with the
 * number prefixed — the `% 100` check re-applies the 3-10 few-form inside
 * each hundred (e.g. 103 behaves like 3).
 */
export function pluralizeAr(n: number, forms: ArabicPluralForms): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;

  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/lib/pluralize-ar.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Wire into `GuestListPage.tsx`**

Replace lines 17-24 (the `hint` prop) in `features/guests/ui/GuestListPage.tsx`:

```tsx
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
// ...(alongside the other imports at the top of the file)

        <PageHeading
          title="الضيوف"
          hint={
            guests.length === 0
              ? "ابدأ بإضافة الأشخاص الذين تدعوهم."
              : `${pluralizeAr(guests.length, { one: "دعوة واحدة", two: "دعوتان", few: "دعوات", many: "دعوة" })} · ${pluralizeAr(seats, { one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعد" })}`
          }
        />
```

- [ ] **Step 6: Wire into `GuestManager.tsx`**

Replace line 92 in `features/guests/ui/GuestManager.tsx`:

```tsx
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
// ...(alongside the other imports)

                    <p className="truncate text-xs text-muted-foreground">
                      {pluralizeAr(guest.seats, { one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعد" })}
                      {guest.note ? ` · ${guest.note}` : ""}
                    </p>
```

- [ ] **Step 7: Wire into `GuestDetailPage.tsx`**

Replace line 29 in `features/guests/ui/GuestDetailPage.tsx`:

```tsx
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
// ...(alongside the other imports)

        <p className="mt-1 text-sm text-muted-foreground">
          {pluralizeAr(guest.seats, { one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعد" })}
          {guest.note ? ` · ${guest.note}` : ""}
        </p>
```

- [ ] **Step 8: Wire into `ShareInvite.tsx`**

Replace line 23 in `features/guests/ui/ShareInvite.tsx`:

```tsx
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
// ...(alongside the other imports)

  const seatsText = pluralizeAr(guest.seats, {
    one: "شخصاً واحداً",
    two: "شخصين",
    few: "أشخاص",
    many: "شخصاً",
  });
```

(These forms are accusative — `شخصين` not `شخصان` — because `seatsText` is the grammatical object of `يشمل` at its only call site, line 33: `` `يشمل ${seatsText}. بانتظاركم.` ``.)

- [ ] **Step 9: Wire into `app/i/[code]/page.tsx`**

Replace line 63:

```tsx
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
// ...(alongside the other imports)

          <p className="mt-1 text-sm text-muted-foreground">
            تشمل {pluralizeAr(guest.seats, { one: "شخصاً واحداً", two: "شخصين", few: "أشخاص", many: "شخصاً" })}
          </p>
```

- [ ] **Step 10: Wire into `render-card.tsx`**

Replace line 168 in `app/events/[id]/guests/[guestId]/card/render-card.tsx`:

```tsx
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
// ...(alongside the other imports)

  const seatsLabel = `تشمل ${pluralizeAr(guest.seats, { one: "شخصاً واحداً", two: "شخصين", few: "أشخاص", many: "شخصاً" })}`;
```

(`seatsLabel` still flows through the existing `toVisualOrder()` call at line 194 unchanged — that function already handles mixed Arabic-word/Western-digit strings, since the pre-existing `تشمل ${guest.seats} أشخاص` case was already mixed.)

- [ ] **Step 11: Wire into `actions.ts`**

Replace line 61 in `app/events/[id]/guests/actions.ts`:

```typescript
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
// ...(alongside the other imports)

  return {
    ok: `تمت إضافة ${pluralizeAr(created, { one: "دعوة واحدة", two: "دعوتان", few: "دعوات", many: "دعوة" })}.`,
  };
```

- [ ] **Step 12: Typecheck and full test run**

Run: `npm run typecheck && npx vitest run`
Expected: no type errors, all tests pass (including the new `pluralize-ar.test.ts`)

- [ ] **Step 13: Commit**

```bash
git add shared/lib/pluralize-ar.ts shared/lib/pluralize-ar.test.ts features/guests/ui/GuestListPage.tsx features/guests/ui/GuestManager.tsx features/guests/ui/GuestDetailPage.tsx features/guests/ui/ShareInvite.tsx "app/i/[code]/page.tsx" "app/events/[id]/guests/[guestId]/card/render-card.tsx" "app/events/[id]/guests/actions.ts"
git commit -m "fix: correct Arabic pluralization for n=2 and n>=11 across guest pages"
```

---

### Task 2: `normalizeAr` helper + wire into guest search

**Files:**
- Create: `shared/lib/normalize-ar.ts`
- Test: `shared/lib/normalize-ar.test.ts`
- Modify: `features/guests/ui/GuestManager.tsx:17-27`

**Interfaces:**
- Produces: `normalizeAr(text: string): string` from `shared/lib/normalize-ar.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// shared/lib/normalize-ar.test.ts
import { describe, expect, it } from "vitest";
import { normalizeAr } from "./normalize-ar";

describe("normalizeAr", () => {
  it("folds hamza-bearing alef variants to bare alef", () => {
    expect(normalizeAr("أحمد")).toBe(normalizeAr("احمد"));
    expect(normalizeAr("إحمد")).toBe(normalizeAr("احمد"));
    expect(normalizeAr("آحمد")).toBe(normalizeAr("احمد"));
  });

  it("folds teh marbuta to heh", () => {
    expect(normalizeAr("فاطمة")).toBe(normalizeAr("فاطمه"));
  });

  it("folds alef maksura to yeh", () => {
    expect(normalizeAr("ليلى")).toBe(normalizeAr("ليلي"));
  });

  it("strips tashkeel (diacritics)", () => {
    expect(normalizeAr("مُحَمَّد")).toBe(normalizeAr("محمد"));
  });

  it("normalizes Arabic-Indic digits to Western digits", () => {
    expect(normalizeAr("٢٠٢٤")).toBe("2024");
  });

  it("lowercases Latin text", () => {
    expect(normalizeAr("Ahmad")).toBe("ahmad");
  });

  it("leaves an already-normalized string unchanged", () => {
    expect(normalizeAr("احمد")).toBe("احمد");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/lib/normalize-ar.test.ts`
Expected: FAIL — `Cannot find module './normalize-ar'`

- [ ] **Step 3: Write the implementation**

```typescript
// shared/lib/normalize-ar.ts
const TASHKEEL = /[ً-ْٰ]/g;
const ALEF_VARIANTS = /[أإآٱ]/g;
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * Folds Arabic spelling variants that Arabic speakers treat as
 * interchangeable when typing — hamza-bearing alefs (أ/إ/آ/ٱ → ا),
 * teh marbuta vs. heh (ة → ه), alef maksura vs. yeh (ى → ي) — strips
 * diacritics (tashkeel), and maps Arabic-Indic digits to Western digits,
 * so guest search matches common name-spelling variants instead of only
 * exact matches.
 */
export function normalizeAr(text: string): string {
  return text
    .replace(TASHKEEL, "")
    .replace(ALEF_VARIANTS, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)))
    .toLowerCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/lib/normalize-ar.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Wire into `GuestManager.tsx` search**

Replace lines 1-27 in `features/guests/ui/GuestManager.tsx` (imports + the `visible` memo):

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/shared/component/ui/button";
import { Card } from "@/shared/component/ui/card";
import { EmptyState } from "@/shared/component/empty-state";
import { Input } from "@/shared/component/ui/input";
import { normalizeAr } from "@/shared/lib/normalize-ar";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import type { Guest } from "../domain/Guest";
import AddGuestForm from "./AddGuestForm";
import ImportGuestsForm from "./ImportGuestsForm";

export default function GuestManager({ eventId, guests }: { eventId: number; guests: Guest[] }) {
  const [panel, setPanel] = useState<"none" | "one" | "many">("none");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = normalizeAr(query.trim());
    if (!needle) return guests;

    return guests.filter(
      (guest) =>
        normalizeAr(guest.name).includes(needle) ||
        normalizeAr(guest.note ?? "").includes(needle) ||
        normalizeAr(guest.code).includes(needle),
    );
  }, [guests, query]);
```

(This edit also carries over the `pluralizeAr` import and usage from Task 1, Step 6, since both tasks touch this file's top — if Task 1 was completed first, only add the `normalizeAr` import line and replace the `visible` memo body, don't duplicate the `pluralizeAr` import.)

- [ ] **Step 6: Typecheck and full test run**

Run: `npm run typecheck && npx vitest run`
Expected: no type errors, all tests pass

- [ ] **Step 7: Manual verification in browser**

Start the dev server and open an event's guest list with guests named e.g. `أحمد` and `فاطمة`. Search `احمد` (no hamza) and confirm `أحمد` still appears; search `فاطمه` (heh) and confirm `فاطمة` still appears.

- [ ] **Step 8: Commit**

```bash
git add shared/lib/normalize-ar.ts shared/lib/normalize-ar.test.ts features/guests/ui/GuestManager.tsx
git commit -m "fix: normalize Arabic orthography variants in guest search"
```

---

### Task 3: Surface guest-delete failures instead of swallowing them

**Files:**
- Modify: `app/events/[id]/guests/[guestId]/actions.ts:49-69`
- Create: `features/guests/view-model/useDeleteGuestActionViewModel.ts`
- Modify: `features/guests/ui/DeleteGuestButton.tsx`

**Interfaces:**
- Consumes: `ErrorNote` from `shared/component/error-note.tsx` (existing, `{ children: ReactNode }`), `Button` from `shared/component/ui/button.tsx` (existing).
- Produces: `deleteGuestAction(prevState: DeleteGuestFormState, formData: FormData): Promise<DeleteGuestFormState>` where `DeleteGuestFormState = { error?: string }`, exported from `app/events/[id]/guests/[guestId]/actions.ts`. On success it still calls `redirect()` (throws, never returns a value) exactly like today. On a caught delete failure it now logs the error via `console.error` and returns `{ error: "..." }` instead of silently redirecting.
- Produces: `useDeleteGuestActionViewModel(): { error?: string; action: (formData: FormData) => void; pending: boolean }` from `features/guests/view-model/useDeleteGuestActionViewModel.ts`, mirroring `useEditGuestFormViewModel`.

This task has no unit test (per Global Constraints — server actions and UI components aren't unit-tested in this codebase); verification is `npm run typecheck`, `npm run lint`, and a manual browser check that forces the failure path.

- [ ] **Step 1: Convert `deleteGuestAction` to a `useActionState`-compatible action that surfaces errors**

Replace lines 49-69 in `app/events/[id]/guests/[guestId]/actions.ts`:

```typescript
export type DeleteGuestFormState = { error?: string };

export async function deleteGuestAction(
  _prev: DeleteGuestFormState,
  formData: FormData,
): Promise<DeleteGuestFormState> {
  await requireOwner();

  const eventId = Number(formData.get("eventId"));
  const id = Number(formData.get("id"));

  if (!Number.isInteger(eventId)) {
    redirect("/");
  }

  if (Number.isInteger(id)) {
    try {
      await new DeleteGuestUseCase(makeGuestRepository()).execute(eventId, id);
    } catch (error) {
      console.error(`Failed to delete guest ${id} in event ${eventId}:`, error);
      return { error: "تعذّر حذف الدعوة. حاول مرة أخرى." };
    }
  }

  revalidatePath(`/events/${eventId}/guests`);
  redirect(`/events/${eventId}/guests`);
}
```

- [ ] **Step 2: Verify the action file typechecks in isolation**

Run: `npm run typecheck`
Expected: no errors mentioning `actions.ts` (there will still be errors from Steps 3-4 not yet done if `DeleteGuestButton.tsx` hasn't been updated to match the new signature — that's expected until Step 4 below; if you run this after Step 1 alone, `DeleteGuestButton.tsx`'s `<form action={deleteGuestAction}>` will fail to typecheck since the signature changed from `(formData) => Promise<void>` to `(prevState, formData) => Promise<DeleteGuestFormState>` — this is expected and fixed by Step 4).

- [ ] **Step 3: Create the view-model**

```typescript
// features/guests/view-model/useDeleteGuestActionViewModel.ts
"use client";

import { useActionState } from "react";
import { deleteGuestAction, type DeleteGuestFormState } from "@/app/events/[id]/guests/[guestId]/actions";

export function useDeleteGuestActionViewModel() {
  const [state, action, pending] = useActionState<DeleteGuestFormState, FormData>(deleteGuestAction, {});
  return { error: state.error, action, pending };
}
```

- [ ] **Step 4: Update `DeleteGuestButton.tsx` to show the error and use the view-model**

Replace the full contents of `features/guests/ui/DeleteGuestButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ErrorNote } from "@/shared/component/error-note";
import { Button } from "@/shared/component/ui/button";
import { useDeleteGuestActionViewModel } from "../view-model/useDeleteGuestActionViewModel";

export default function DeleteGuestButton({ eventId, guestId }: { eventId: number; guestId: number }) {
  const [confirming, setConfirming] = useState(false);
  const { error, action, pending } = useDeleteGuestActionViewModel();

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        className="border-destructive text-destructive hover:bg-destructive/10"
        onClick={() => setConfirming(true)}
      >
        حذف الدعوة
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <form action={action} className="flex gap-2">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="id" value={guestId} />
        <Button type="submit" variant="destructive" className="flex-1" disabled={pending}>
          {pending ? "جارٍ الحذف…" : "تأكيد الحذف"}
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirming(false)} disabled={pending}>
          إلغاء
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck, lint, and full test run**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: no errors, all existing tests still pass (this task adds no new tests)

- [ ] **Step 6: Manual verification in browser**

Start the dev server, open a guest's detail page, click "حذف الدعوة" then "تأكيد الحذف" for a guest that deletes successfully — confirm it redirects to the guest list as before. Then temporarily make `DeleteGuestUseCase.execute` throw (e.g. add `throw new Error("test")` at the top of `features/guests/domain/use-cases/DeleteGuestUseCase.ts`, or stop the DB) and confirm: (a) the confirm button shows an Arabic error message instead of silently returning to an unchanged list, and (b) the error appears in the server console log. Revert the temporary throw afterward.

- [ ] **Step 7: Commit**

```bash
git add "app/events/[id]/guests/[guestId]/actions.ts" features/guests/view-model/useDeleteGuestActionViewModel.ts features/guests/ui/DeleteGuestButton.tsx
git commit -m "fix: surface guest-delete failures instead of silently swallowing them"
```

---

## Self-Review Notes

- **Spec coverage:** All three findings have a task. Task 1 covers all 7 named files (GuestListPage, GuestManager, GuestDetailPage, ShareInvite, app/i/[code]/page.tsx, render-card.tsx, actions.ts) plus the correct dual/many grammatical forms for each of the three noun families used (دعوة/مقعد/شخص). Task 2 covers hamza folding, ة/ه, ى/ي, tashkeel stripping, and Arabic-Indic digit normalization, applied to both the query and all three haystack fields (name, note, code). Task 3 logs the error server-side and gives user-visible feedback via the established `useActionState` + `ErrorNote` convention, matching `EditGuestForm`.
- **Type consistency:** `DeleteGuestFormState` name and shape (`{ error?: string }`) is used identically in `actions.ts` and the view-model. `pluralizeAr`/`normalizeAr` signatures are identical between their definition, tests, and every call site above.
- **Note on GuestManager.tsx overlap:** Tasks 1 and 2 both touch `features/guests/ui/GuestManager.tsx`'s top section. Step 5 of Task 2 says explicitly how to reconcile if Task 1 already landed first — do Task 1 before Task 2 to avoid merge friction, or apply both edits together if executing in one sitting.
