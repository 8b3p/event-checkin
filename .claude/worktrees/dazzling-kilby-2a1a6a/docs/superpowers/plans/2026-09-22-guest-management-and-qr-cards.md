# Guest Management & QR Cards Implementation Plan (Part 3 of the multi-event rebuild)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `ui/` layer on top of Part 1's already-built `guests` feature slice, so an owner can add/import/edit/delete guests for an event, generate and share each guest's QR invitation (a downloadable branded card image and a guest-facing link page), and export the guest list. Entirely in Arabic, RTL, mobile-first, on the shadcn/ui foundation Part 2 established. The door scanner and any check-in/check-out UI remain a separate, later plan — this plan does not add scanning, and correctly shows every guest as "not arrived yet" since nothing writes a scan record until that later plan exists.

**Architecture:** Same pattern as Part 2: Server Components call a use-case directly for reads; interactive Client Components get a thin `view-model/` hook wrapping `useActionState`, calling a Server Action that constructs use-cases via `make<Name>Repository()`. Two new pieces this plan introduces: a guest-facing route (`/i/[code]`) that is deliberately **not** behind `requireOwner()` — a guest's invitation link is their only credential, per spec §5 — and two Route Handlers that return binary responses (a PNG card image via `next/og`, and a ZIP of every guest's card) rather than rendering a page.

**Tech Stack:** Next.js 16 / React 19, shadcn/ui (Part 2), `qrcode` (already a dependency — generates the on-page/on-card QR as a data URL), `next/og` (`ImageResponse` — built into Next.js, no new dependency, for the downloadable card image), `jszip` (new dependency, for the bulk card download).

**Spec:** [docs/superpowers/specs/2026-09-22-multi-event-checkin-design.md](../specs/2026-09-22-multi-event-checkin-design.md) — sections 6 (guest management, CSV export), 7 (guest codes are global-unique, referenced not re-litigated here), 8 (QR guest cards & distribution), 10 (Localization & Mobile-First UI).
**Architecture:** [docs/architecture-docs/04-NEXTJS-ADAPTATION.md](../../architecture-docs/04-NEXTJS-ADAPTATION.md)
**Builds on:** [docs/superpowers/plans/2026-09-22-data-foundation-auth.md](2026-09-22-data-foundation-auth.md) (Part 1 — `features/guests` domain/infrastructure, merged) and [docs/superpowers/plans/2026-09-22-owner-auth-and-events-ui.md](2026-09-22-owner-auth-and-events-ui.md) (Part 2 — shadcn primitives, `Shell`, `Field`, `ErrorNote`, `EmptyState`, event pages, merged).

## Global Constraints

**Product (from the spec):**
- Arabic-only UI, RTL, Western-digit dates via `ar-u-nu-latn` — same as Part 2, applies to every new page in this plan too, including the guest-facing `/i/[code]` page.
- Guest codes are globally unique across all events (spec §4) — `GetGuestByCodeUseCase` (Part 1) takes only a code, no event id, by design. Don't "fix" this.
- No guest accounts — `/i/[code]` is intentionally public (no `requireOwner()`), matching spec §3's non-goal.
- QR card copy must be written for someone who has never used a QR code before (spec §8) — plain, short Arabic sentences, no jargon.
- No offline mode, no payments, no automated guest messaging (spec §3) — sharing stays manual (copy link/text, WhatsApp `wa.me` link, download image).

**Architecture (from `docs/architecture-docs/`):**
- Same layering as Part 2: `ui/` renders only, `view-model/` hooks wrap `useActionState`, Server Actions are the composition root via `make<Name>Repository()` factories.
- Route Handlers (the card image, the bulk ZIP, the CSV export) are also composition roots, same standing as a Server Action per `04-NEXTJS-ADAPTATION.md`.
- Every `Field htmlFor="X"` must wrap a child `id="X"` (shadcn `Label` requires explicit pairing).
- `shared/` must never import from `app/` — this plan's new files should follow the same rule Part 2's final review enforced for `Shell.tsx`.

---

## Task 1: Translate guest-domain error messages to Arabic

Part 1's `ImportGuestsUseCase` (the only guest use-case that throws) still has English error messages — nothing in Part 1 or Part 2 displayed them, so nothing caught it. This task's UI (Task 2) is the first thing that will.

**Files:**
- Modify: `features/guests/domain/use-cases/ImportGuestsUseCase.ts`
- Modify: `features/guests/domain/use-cases/guests-use-cases.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the same `execute()` signature — only the thrown message text changes. Task 2's `importGuestsAction` catches these and displays `error.message` directly.

- [ ] **Step 1: Translate the three thrown messages**

```ts
// features/guests/domain/use-cases/ImportGuestsUseCase.ts
import { generateCodes } from "@/shared/lib/codes";
import type { IGuestRepository } from "../IGuestRepository";

const MAX_LINES = 2000;
const MAX_SEATS = 50;

export type ImportGuestsResult = { created: number };

function parseSeats(raw: string | undefined): number {
  const seats = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(seats) || seats < 1) return 1;
  return Math.min(seats, MAX_SEATS);
}

/**
 * Parses one invitation per line as `name, seats, note` (tabs work too, for
 * a column pasted from a spreadsheet), generates a unique code for each,
 * and inserts them all in one batch.
 */
export class ImportGuestsUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  async execute(eventId: number, raw: string): Promise<ImportGuestsResult> {
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) throw new Error("الصق اسماً واحداً على الأقل.");
    if (lines.length > MAX_LINES) {
      throw new Error(`هذا أكثر من ${MAX_LINES} سطر — قسّمها على عدة مرات.`);
    }

    const parsed = lines.map((line) => {
      const [name, seats, note] = line.split(/\t|,/).map((part) => part?.trim());
      return { name, seats, note };
    });

    const bad = parsed.find((row) => !row.name);
    if (bad) throw new Error("أحد الأسطر لا يحتوي على اسم.");

    const codes = generateCodes(parsed.length);
    const created = await this.guestRepository.createMany(
      eventId,
      parsed.map((row, index) => ({
        name: row.name!,
        seats: parseSeats(row.seats),
        phone: null,
        note: row.note || null,
        code: codes[index],
      })),
    );

    return { created };
  }
}
```

- [ ] **Step 2: Update the test that asserts specific English text**

In `features/guests/domain/use-cases/guests-use-cases.test.ts`, find:

```ts
  it("rejects an import with no lines or a line with no name", async () => {
    const repo = new FakeGuestRepository();
    await expect(new ImportGuestsUseCase(repo).execute(1, "   \n  ")).rejects.toThrow("Paste at least one name.");
    await expect(new ImportGuestsUseCase(repo).execute(1, ", 2")).rejects.toThrow("no name");
  });
```

Replace with bare `.rejects.toThrow()` (no text match), matching how every other already-translated use-case in this codebase (auth, events) asserts these:

```ts
  it("rejects an import with no lines or a line with no name", async () => {
    const repo = new FakeGuestRepository();
    await expect(new ImportGuestsUseCase(repo).execute(1, "   \n  ")).rejects.toThrow();
    await expect(new ImportGuestsUseCase(repo).execute(1, ", 2")).rejects.toThrow();
  });
```

- [ ] **Step 3: Run and confirm pass**

Run: `npm test -- guests-use-cases`
Expected: all tests pass (same count as before — no new tests, only translated messages and one loosened assertion).

- [ ] **Step 4: Commit**

```bash
git add features/guests/domain/use-cases/ImportGuestsUseCase.ts features/guests/domain/use-cases/guests-use-cases.test.ts
git commit -m "Translate ImportGuestsUseCase error messages to Arabic"
```

---

## Task 2: Guest list page — list, search, add, import

**Files:**
- Create: `app/events/[id]/guests/page.tsx`
- Create: `app/events/[id]/guests/actions.ts`
- Create: `features/guests/ui/GuestListPage.tsx`
- Create: `features/guests/ui/GuestManager.tsx`
- Create: `features/guests/ui/AddGuestForm.tsx`
- Create: `features/guests/ui/ImportGuestsForm.tsx`
- Create: `features/guests/view-model/useAddGuestFormViewModel.ts`
- Create: `features/guests/view-model/useImportGuestsFormViewModel.ts`
- Modify: `features/events/ui/EventSettingsPage.tsx` (add a link to the guest list)

**Interfaces:**
- Consumes: `requireOwner()`, `GetEventUseCase`, `makeEventRepository()` (Part 2/Part 1); `ListGuestsForEventUseCase`, `CreateGuestUseCase` (+ its `AddGuestInput` type), `ImportGuestsUseCase`, `makeGuestRepository()` (Part 1, Task 1's Arabic messages); `Shell`, `PageHeading`, `Field`, `ErrorNote`, `EmptyState` (Part 2 `shared/component/*`); `Button`, `Card`, `CardContent`, `Input`, `Textarea` (Part 2 shadcn primitives).
- Produces: `addGuestAction`, `importGuestsAction`, `GuestFormState` (`app/events/[id]/guests/actions.ts`) — Task 3 does **not** reuse this file (guest *detail* actions get their own file, scoped under `[guestId]/`), so nothing later in this plan extends it further.

Search is client-side (fetch every guest for the event once, filter in the browser) — matching the original single-event app's pattern, appropriate at guest-list scale, and avoiding a server round-trip per keystroke. This task deliberately does **not** show an arrived/not-arrived status or filter: `features/check-in`'s `ListGuestsWithStatusUseCase` exists and could supply it, but nothing can write a scan record until a later, separate plan builds the door scanner — every guest would show "not arrived" unconditionally, which is accurate but not useful UI to ship now. That status/filter belongs with the plan that makes it meaningful.

- [ ] **Step 1: Add guest Server Actions for this event**

```ts
// app/events/[id]/guests/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { CreateGuestUseCase } from "@/features/guests/domain/use-cases/CreateGuestUseCase";
import { ImportGuestsUseCase } from "@/features/guests/domain/use-cases/ImportGuestsUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";

export type GuestFormState = { error?: string; ok?: string };

const MAX_SEATS = 50;

function parseSeats(raw: string): number {
  const seats = Number.parseInt(raw, 10);
  if (!Number.isFinite(seats) || seats < 1) return 1;
  return Math.min(seats, MAX_SEATS);
}

export async function addGuestAction(_prev: GuestFormState, formData: FormData): Promise<GuestFormState> {
  await requireOwner();

  const eventId = Number(formData.get("eventId"));
  if (!Number.isInteger(eventId)) return { error: "لم يتم العثور على الفعالية." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "أضف اسماً للدعوة." };

  try {
    await new CreateGuestUseCase(makeGuestRepository()).execute({
      eventId,
      name,
      seats: parseSeats(String(formData.get("seats") ?? "1")),
      phone: String(formData.get("phone") ?? "").trim() || null,
      note: String(formData.get("note") ?? "").trim() || null,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." };
  }

  revalidatePath(`/events/${eventId}/guests`);
  return { ok: `تمت إضافة ${name}.` };
}

export async function importGuestsAction(_prev: GuestFormState, formData: FormData): Promise<GuestFormState> {
  await requireOwner();

  const eventId = Number(formData.get("eventId"));
  if (!Number.isInteger(eventId)) return { error: "لم يتم العثور على الفعالية." };

  const bulk = String(formData.get("bulk") ?? "");

  let created: number;
  try {
    const result = await new ImportGuestsUseCase(makeGuestRepository()).execute(eventId, bulk);
    created = result.created;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." };
  }

  revalidatePath(`/events/${eventId}/guests`);
  return { ok: created === 1 ? "تمت إضافة دعوة واحدة." : `تمت إضافة ${created} دعوات.` };
}
```

- [ ] **Step 2: Build the guest list route**

```tsx
// app/events/[id]/guests/page.tsx
import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { ListGuestsForEventUseCase } from "@/features/guests/domain/use-cases/ListGuestsForEventUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";
import GuestListPage from "@/features/guests/ui/GuestListPage";

export const dynamic = "force-dynamic";

export default async function EventGuestsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const guests = await new ListGuestsForEventUseCase(makeGuestRepository()).execute(eventId);

  return <GuestListPage event={event} guests={guests} />;
}
```

- [ ] **Step 3: Build the guest list page shell and manager**

```tsx
// features/guests/ui/GuestListPage.tsx
import Link from "next/link";
import { Shell, PageHeading } from "@/shared/component/Shell";
import type { Event } from "@/features/events/domain/Event";
import type { Guest } from "../domain/Guest";
import GuestManager from "./GuestManager";

export default function GuestListPage({ event, guests }: { event: Event; guests: Guest[] }) {
  const seats = guests.reduce((total, guest) => total + guest.seats, 0);

  return (
    <Shell>
      <Link href={`/events/${event.id}`} className="text-sm text-muted-foreground hover:text-foreground">
        ‹ رجوع إلى {event.name}
      </Link>

      <div className="mt-3">
        <PageHeading
          title="الضيوف"
          hint={
            guests.length === 0
              ? "ابدأ بإضافة الأشخاص الذين تدعوهم."
              : `${guests.length === 1 ? "دعوة واحدة" : `${guests.length} دعوات`} · ${seats === 1 ? "مقعد واحد" : `${seats} مقاعد`}`
          }
        />
      </div>

      <GuestManager eventId={event.id} guests={guests} />
    </Shell>
  );
}
```

```tsx
// features/guests/ui/GuestManager.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/shared/component/ui/button";
import { Card } from "@/shared/component/ui/card";
import { EmptyState } from "@/shared/component/empty-state";
import { Input } from "@/shared/component/ui/input";
import type { Guest } from "../domain/Guest";
import AddGuestForm from "./AddGuestForm";
import ImportGuestsForm from "./ImportGuestsForm";

export default function GuestManager({ eventId, guests }: { eventId: number; guests: Guest[] }) {
  const [panel, setPanel] = useState<"none" | "one" | "many">("none");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return guests;

    return guests.filter(
      (guest) =>
        guest.name.toLowerCase().includes(needle) ||
        (guest.note ?? "").toLowerCase().includes(needle) ||
        guest.code.toLowerCase().includes(needle),
    );
  }, [guests, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={panel === "one" ? "default" : "outline"}
          onClick={() => setPanel(panel === "one" ? "none" : "one")}
        >
          إضافة دعوة
        </Button>
        <Button
          variant={panel === "many" ? "default" : "outline"}
          onClick={() => setPanel(panel === "many" ? "none" : "many")}
        >
          لصق قائمة
        </Button>
      </div>

      {panel === "one" ? <AddGuestForm eventId={eventId} onDone={() => setPanel("none")} /> : null}
      {panel === "many" ? <ImportGuestsForm eventId={eventId} onDone={() => setPanel("none")} /> : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث بالاسم أو الملاحظة أو الرمز"
            className="max-w-xs"
          />
          <p className="ms-auto text-sm text-muted-foreground tabular">
            {visible.length} من {guests.length}
          </p>
        </div>

        {guests.length === 0 ? (
          <EmptyState
            title="لا توجد دعوات بعد"
            body="أضف دعوة واحدة، أو الصق قائمتك الكاملة دفعة واحدة — اسم واحد في كل سطر."
          />
        ) : visible.length === 0 ? (
          <EmptyState title="لا توجد نتائج" body="جرّب بحثاً مختلفاً." />
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((guest) => (
              <li key={guest.id}>
                <Link
                  href={`/events/${eventId}/guests/${guest.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{guest.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {guest.seats === 1 ? "مقعد واحد" : `${guest.seats} مقاعد`}
                      {guest.note ? ` · ${guest.note}` : ""}
                    </p>
                  </div>
                  <span aria-hidden className="text-muted-foreground">
                    ‹
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
```

Note the trailing `‹` (not `›`) as the list-row disclosure chevron — in this RTL page "forward/into" points left, and `‹` (U+2039, Bidi-mirrored) renders as the correct left-pointing chevron here, matching the mirrored `‹` already used for "back" links elsewhere in this codebase.

- [ ] **Step 4: Build the add-guest form**

```tsx
// features/guests/ui/AddGuestForm.tsx
"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import { useAddGuestFormViewModel } from "../view-model/useAddGuestFormViewModel";

export default function AddGuestForm({ eventId, onDone }: { eventId: number; onDone: () => void }) {
  const { error, ok, action, pending } = useAddGuestFormViewModel();

  return (
    <Card>
      <CardContent className="space-y-4">
        <form action={action} className="space-y-4">
          <input type="hidden" name="eventId" value={eventId} />

          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="الاسم" htmlFor="name">
              <Input id="name" name="name" placeholder="عائلة آل فلان" required autoFocus />
            </Field>
            <Field label="عدد المقاعد" htmlFor="seats">
              <Input id="seats" name="seats" type="number" min={1} max={50} defaultValue={1} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الهاتف" htmlFor="phone" hint="اختياري — يفيد عند إرسال الدعوة.">
              <Input id="phone" name="phone" placeholder="+971 ..." dir="ltr" />
            </Field>
            <Field label="ملاحظة" htmlFor="note" hint="اختياري.">
              <Input id="note" name="note" placeholder="جهة العروس" />
            </Field>
          </div>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {ok ? <p className="text-sm text-good-ink">{ok}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الإضافة…" : "إضافة"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              تم
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

```ts
// features/guests/view-model/useAddGuestFormViewModel.ts
"use client";

import { useActionState } from "react";
import { addGuestAction, type GuestFormState } from "@/app/events/[id]/guests/actions";

export function useAddGuestFormViewModel() {
  const [state, action, pending] = useActionState<GuestFormState, FormData>(addGuestAction, {});
  return { error: state.error, ok: state.ok, action, pending };
}
```

- [ ] **Step 5: Build the paste-import form**

```tsx
// features/guests/ui/ImportGuestsForm.tsx
"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Textarea } from "@/shared/component/ui/textarea";
import { useImportGuestsFormViewModel } from "../view-model/useImportGuestsFormViewModel";

export default function ImportGuestsForm({ eventId, onDone }: { eventId: number; onDone: () => void }) {
  const { error, ok, action, pending } = useImportGuestsFormViewModel();

  return (
    <Card>
      <CardContent className="space-y-4">
        <form action={action} className="space-y-4">
          <input type="hidden" name="eventId" value={eventId} />

          <Field
            label="قائمتك"
            htmlFor="bulk"
            hint="دعوة واحدة في كل سطر. أضف عدد المقاعد وملاحظة بعد فاصلة إن أردت."
          >
            <Textarea
              id="bulk"
              name="bulk"
              rows={8}
              autoFocus
              className="font-mono text-xs"
              dir="ltr"
              placeholder={"عائلة آل فلان، 4، جهة العروس\nسارة حسن، 2\nجون سميث"}
            />
          </Field>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {ok ? <p className="text-sm text-good-ink">{ok}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الإضافة…" : "إضافة الجميع"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              تم
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

Note `dir="ltr"` on the paste-list textarea — pasted spreadsheet content commonly mixes Latin names/numbers, and a textarea is where `dir` matters most for comfortable editing; if an owner's list is entirely Arabic names, RTL text still displays correctly inside an `ltr`-directioned container (Unicode bidi handles this per-character), so nothing is lost.

```ts
// features/guests/view-model/useImportGuestsFormViewModel.ts
"use client";

import { useActionState } from "react";
import { importGuestsAction, type GuestFormState } from "@/app/events/[id]/guests/actions";

export function useImportGuestsFormViewModel() {
  const [state, action, pending] = useActionState<GuestFormState, FormData>(importGuestsAction, {});
  return { error: state.error, ok: state.ok, action, pending };
}
```

- [ ] **Step 6: Link to the guest list from event settings**

In `features/events/ui/EventSettingsPage.tsx`, add a link to the guest list. Find the back-link at the top:

```tsx
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ‹ رجوع إلى الفعاليات
      </Link>
```

Add a guests link right after it (same line style, separated visually):

```tsx
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ‹ رجوع إلى الفعاليات
        </Link>
        <Link href={`/events/${event.id}/guests`} className="text-sm font-medium text-primary hover:underline">
          الضيوف ›
        </Link>
      </div>
```

Remove the standalone back-`Link` that was there before (it's now inside this `div`, not duplicated).

- [ ] **Step 7: Verify and run the full test suite**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^(features/guests|app/events/\[id\]/guests)"`
Expected: no output.

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 8: Commit**

```bash
git add app/events/\[id\]/guests/page.tsx app/events/\[id\]/guests/actions.ts features/guests/ui/GuestListPage.tsx features/guests/ui/GuestManager.tsx features/guests/ui/AddGuestForm.tsx features/guests/ui/ImportGuestsForm.tsx features/guests/view-model/useAddGuestFormViewModel.ts features/guests/view-model/useImportGuestsFormViewModel.ts features/events/ui/EventSettingsPage.tsx
git commit -m "Add the guest list page: search, add one, paste-import"
```

---

## Task 3: Guest detail page — edit, delete, share the invitation

**Files:**
- Create: `app/events/[id]/guests/[guestId]/page.tsx`
- Create: `app/events/[id]/guests/[guestId]/actions.ts`
- Create: `features/guests/ui/GuestDetailPage.tsx`
- Create: `features/guests/ui/EditGuestForm.tsx`
- Create: `features/guests/ui/DeleteGuestButton.tsx`
- Create: `features/guests/ui/ShareInvite.tsx`
- Create: `features/guests/view-model/useEditGuestFormViewModel.ts`

**Interfaces:**
- Consumes: `requireOwner()`, `GetEventUseCase`, `makeEventRepository()`; `GetGuestUseCase`, `UpdateGuestUseCase`, `DeleteGuestUseCase`, `makeGuestRepository()` (Part 1 — note `GetGuestUseCase`/`UpdateGuestUseCase`/`DeleteGuestUseCase` all take `(eventId, id, ...)`, not just `(id, ...)`, per Part 1's final-review fix); `inviteUrl` (`@/shared/lib/codes`); the `qrcode` npm package.
- Produces: `updateGuestAction`, `deleteGuestAction`, `EditGuestFormState` (`app/events/[id]/guests/[guestId]/actions.ts`) — scoped to this route only, no other task extends this file.

- [ ] **Step 1: Add guest-detail Server Actions**

```ts
// app/events/[id]/guests/[guestId]/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DeleteGuestUseCase } from "@/features/guests/domain/use-cases/DeleteGuestUseCase";
import { UpdateGuestUseCase } from "@/features/guests/domain/use-cases/UpdateGuestUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";

export type EditGuestFormState = { error?: string; ok?: string };

const MAX_SEATS = 50;

function parseSeats(raw: string): number {
  const seats = Number.parseInt(raw, 10);
  if (!Number.isFinite(seats) || seats < 1) return 1;
  return Math.min(seats, MAX_SEATS);
}

export async function updateGuestAction(
  _prev: EditGuestFormState,
  formData: FormData,
): Promise<EditGuestFormState> {
  await requireOwner();

  const eventId = Number(formData.get("eventId"));
  const id = Number(formData.get("id"));
  if (!Number.isInteger(eventId) || !Number.isInteger(id)) return { error: "لم يتم العثور على الدعوة." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "أضف اسماً للدعوة." };

  try {
    await new UpdateGuestUseCase(makeGuestRepository()).execute(eventId, id, {
      name,
      seats: parseSeats(String(formData.get("seats") ?? "1")),
      phone: String(formData.get("phone") ?? "").trim() || null,
      note: String(formData.get("note") ?? "").trim() || null,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." };
  }

  revalidatePath(`/events/${eventId}/guests`);
  revalidatePath(`/events/${eventId}/guests/${id}`);
  return { ok: "تم الحفظ." };
}

export async function deleteGuestAction(formData: FormData): Promise<void> {
  await requireOwner();

  const eventId = Number(formData.get("eventId"));
  const id = Number(formData.get("id"));

  if (Number.isInteger(eventId) && Number.isInteger(id)) {
    await new DeleteGuestUseCase(makeGuestRepository()).execute(eventId, id);
  }

  revalidatePath(`/events/${eventId}/guests`);
  redirect(`/events/${eventId}/guests`);
}
```

- [ ] **Step 2: Build the guest detail route**

```tsx
// app/events/[id]/guests/[guestId]/page.tsx
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { GetGuestUseCase } from "@/features/guests/domain/use-cases/GetGuestUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { inviteUrl } from "@/shared/lib/codes";
import { requireOwner } from "@/shared/lib/guard";
import GuestDetailPage from "@/features/guests/ui/GuestDetailPage";

export const dynamic = "force-dynamic";

export default async function EventGuestDetailPage({
  params,
}: {
  params: Promise<{ id: string; guestId: string }>;
}) {
  await requireOwner();
  const { id, guestId } = await params;

  const eventId = Number(id);
  const numericGuestId = Number(guestId);
  if (!Number.isInteger(eventId) || !Number.isInteger(numericGuestId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const guest = await new GetGuestUseCase(makeGuestRepository()).execute(eventId, numericGuestId);
  if (!guest) notFound();

  const url = inviteUrl(guest.code);
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 720 });

  return <GuestDetailPage event={event} guest={guest} url={url} qr={qr} />;
}
```

- [ ] **Step 3: Build the guest detail page shell**

```tsx
// features/guests/ui/GuestDetailPage.tsx
import Link from "next/link";
import { Shell } from "@/shared/component/Shell";
import type { Event } from "@/features/events/domain/Event";
import type { Guest } from "../domain/Guest";
import DeleteGuestButton from "./DeleteGuestButton";
import EditGuestForm from "./EditGuestForm";
import ShareInvite from "./ShareInvite";

export default function GuestDetailPage({
  event,
  guest,
  url,
  qr,
}: {
  event: Event;
  guest: Guest;
  url: string;
  qr: string;
}) {
  return (
    <Shell>
      <Link href={`/events/${event.id}/guests`} className="text-sm text-muted-foreground hover:text-foreground">
        ‹ رجوع إلى الضيوف
      </Link>

      <div className="mb-6 mt-3">
        <h1 className="display text-3xl text-foreground">{guest.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {guest.seats === 1 ? "مقعد واحد" : `${guest.seats} مقاعد`}
          {guest.note ? ` · ${guest.note}` : ""}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ShareInvite guest={guest} event={event} url={url} qr={qr} />

        <div className="space-y-5">
          <EditGuestForm eventId={event.id} guest={guest} />

          <div className="rounded-(--radius-card) border border-border bg-card p-5">
            <p className="mb-3 text-sm font-semibold text-foreground">حذف هذه الدعوة</p>
            <p className="mb-3 text-sm text-muted-foreground">هذا سيحذف الدعوة نهائياً.</p>
            <DeleteGuestButton eventId={event.id} guestId={guest.id} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
```

- [ ] **Step 4: Build the edit form**

```tsx
// features/guests/ui/EditGuestForm.tsx
"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import type { Guest } from "../domain/Guest";
import { useEditGuestFormViewModel } from "../view-model/useEditGuestFormViewModel";

export default function EditGuestForm({ eventId, guest }: { eventId: number; guest: Guest }) {
  const { error, ok, action, pending } = useEditGuestFormViewModel();

  return (
    <Card>
      <CardHeader>
        <CardTitle>التفاصيل</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="id" value={guest.id} />

          <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
            <Field label="الاسم" htmlFor="name">
              <Input id="name" name="name" defaultValue={guest.name} required />
            </Field>
            <Field label="المقاعد" htmlFor="seats">
              <Input id="seats" name="seats" type="number" min={1} max={50} defaultValue={guest.seats} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الهاتف" htmlFor="phone">
              <Input id="phone" name="phone" defaultValue={guest.phone ?? ""} placeholder="+971 ..." dir="ltr" />
            </Field>
            <Field label="ملاحظة" htmlFor="note">
              <Input id="note" name="note" defaultValue={guest.note ?? ""} placeholder="جهة العروس" />
            </Field>
          </div>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {ok ? <p className="text-sm text-good-ink">{ok}</p> : null}

          <Button type="submit" disabled={pending}>
            {pending ? "جارٍ الحفظ…" : "حفظ التغييرات"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

```ts
// features/guests/view-model/useEditGuestFormViewModel.ts
"use client";

import { useActionState } from "react";
import { updateGuestAction, type EditGuestFormState } from "@/app/events/[id]/guests/[guestId]/actions";

export function useEditGuestFormViewModel() {
  const [state, action, pending] = useActionState<EditGuestFormState, FormData>(updateGuestAction, {});
  return { error: state.error, ok: state.ok, action, pending };
}
```

- [ ] **Step 5: Build the delete button, with the same two-step confirm pattern Part 2 used for archiving an event**

```tsx
// features/guests/ui/DeleteGuestButton.tsx
"use client";

import { useState } from "react";
import { Button } from "@/shared/component/ui/button";
import { deleteGuestAction } from "@/app/events/[id]/guests/[guestId]/actions";

export default function DeleteGuestButton({ eventId, guestId }: { eventId: number; guestId: number }) {
  const [confirming, setConfirming] = useState(false);

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
    <form action={deleteGuestAction} className="flex gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="id" value={guestId} />
      <Button type="submit" variant="destructive" className="flex-1">
        تأكيد الحذف
      </Button>
      <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirming(false)}>
        إلغاء
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Build the share panel**

```tsx
// features/guests/ui/ShareInvite.tsx
"use client";

import { useState } from "react";
import { Button } from "@/shared/component/ui/button";
import { Card, CardHeader, CardTitle } from "@/shared/component/ui/card";
import type { Event } from "@/features/events/domain/Event";
import type { Guest } from "../domain/Guest";

function buildMessage(guest: Guest, event: Event, url: string): string {
  const when = event.eventDate
    ? new Date(`${event.eventDate}T00:00:00`).toLocaleDateString("ar-u-nu-latn", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const occasion = [`أنت مدعو إلى ${event.name}`, when ? ` يوم ${when}` : "", event.venue ? ` في ${event.venue}` : ""].join(
    "",
  );

  const seatsText = guest.seats === 1 ? "شخصاً واحداً" : `${guest.seats} أشخاص`;

  return [
    `${guest.name}،`,
    "",
    `${occasion}.`,
    "",
    "هذا الرابط هو دعوتك. افتحه وأظهر رمز QR عند الباب:",
    url,
    "",
    `يشمل ${seatsText}. بانتظاركم.`,
  ].join("\n");
}

export default function ShareInvite({
  guest,
  event,
  url,
  qr,
}: {
  guest: Guest;
  event: Event;
  url: string;
  qr: string;
}) {
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const message = buildMessage(guest, event, url);

  async function copy(what: "link" | "message") {
    try {
      await navigator.clipboard.writeText(what === "link" ? url : message);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("انسخ هذا:", what === "link" ? url : message);
    }
  }

  const whatsapp = `https://wa.me/${(guest.phone ?? "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(message)}`;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>دعوتهم</CardTitle>
      </CardHeader>

      <div className="flex flex-col items-center border-y border-border bg-muted px-5 py-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr}
          alt={`رمز QR لـ ${guest.name}`}
          className="h-56 w-56 rounded-xl border border-border bg-white p-3"
        />
        <p dir="ltr" className="mt-4 font-mono text-sm tracking-[0.2em] text-muted-foreground">
          {guest.code}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">يمكن قراءته عند الباب إذا تعذّر مسح الشاشة.</p>
      </div>

      <div className="space-y-3 p-5">
        <p dir="ltr" className="rounded-lg bg-muted px-3 py-2 text-start font-mono text-xs break-all text-muted-foreground">
          {url}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => copy("message")}>{copied === "message" ? "تم النسخ" : "نسخ نص الدعوة"}</Button>
          <Button variant="outline" onClick={() => copy("link")}>
            {copied === "link" ? "تم النسخ" : "نسخ الرابط"}
          </Button>
          <a
            href={qr}
            download={`دعوة-${guest.code}.png`}
            className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            تحميل QR
          </a>
          {guest.phone ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
            >
              إرسال عبر واتساب
            </a>
          ) : null}
        </div>

        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground">
            معاينة الرسالة ‹
          </summary>
          <pre dir="rtl" className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            {message}
          </pre>
        </details>
      </div>
    </Card>
  );
}
```

- [ ] **Step 7: Verify and run the full test suite**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^(features/guests|app/events/\[id\]/guests)"`
Expected: no output.

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 8: Commit**

```bash
git add app/events/\[id\]/guests/\[guestId\]/page.tsx app/events/\[id\]/guests/\[guestId\]/actions.ts features/guests/ui/GuestDetailPage.tsx features/guests/ui/EditGuestForm.tsx features/guests/ui/DeleteGuestButton.tsx features/guests/ui/ShareInvite.tsx features/guests/view-model/useEditGuestFormViewModel.ts
git commit -m "Add the guest detail page: edit, delete, share the invitation"
```

---

## Task 4: Guest invitation page (`/i/[code]`)

Guest-facing, public (no `requireOwner()`), replacing the old single-event version. This is the page a guest opens from the link the owner sends them.

**Files:**
- Create: `app/i/[code]/page.tsx` (replaces old content)
- Create: `app/i/[code]/not-found.tsx` (replaces old content)

**Interfaces:**
- Consumes: `GetGuestByCodeUseCase`, `makeGuestRepository()` (Part 1); `GetEventUseCase`, `makeEventRepository()` (Part 1); `normaliseScan`, `inviteUrl` (`@/shared/lib/codes`); the `qrcode` npm package.
- Produces: nothing consumed elsewhere — this is a leaf page.

- [ ] **Step 1: Build the not-found page in Arabic**

```tsx
// app/i/[code]/not-found.tsx
export default function InviteNotFound() {
  return (
    <main dir="rtl" className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 text-center">
      <h1 className="display text-3xl text-foreground">هذه الدعوة غير صالحة</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        قد يكون الرابط غير صحيح، أو تم حذف الدعوة. تواصل مع من أرسلها إليك.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Build the invite page**

```tsx
// app/i/[code]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { GetGuestByCodeUseCase } from "@/features/guests/domain/use-cases/GetGuestByCodeUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { inviteUrl, normaliseScan } from "@/shared/lib/codes";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const normalised = normaliseScan(code);
  const guest = normalised ? await new GetGuestByCodeUseCase(makeGuestRepository()).execute(normalised) : null;
  const event = guest ? await new GetEventUseCase(makeEventRepository()).execute(guest.eventId) : null;

  return {
    title: event ? `أنت مدعو — ${event.name}` : "دعوة",
    robots: { index: false, follow: false },
  };
}

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const normalised = normaliseScan(code);
  const guest = normalised ? await new GetGuestByCodeUseCase(makeGuestRepository()).execute(normalised) : null;
  if (!guest) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(guest.eventId);
  if (!event) notFound();

  const qr = await QRCode.toDataURL(inviteUrl(guest.code), { errorCorrectionLevel: "M", margin: 1, width: 900 });

  const when = event.eventDate
    ? new Date(`${event.eventDate}T00:00:00`).toLocaleDateString("ar-u-nu-latn", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <main dir="rtl" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <article className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border bg-accent px-6 py-8 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-accent-foreground">أنت مدعو</p>
          <h1 className="display mt-3 text-4xl leading-tight text-foreground">{event.name}</h1>
          {when ? <p className="mt-3 text-sm text-accent-foreground">{when}</p> : null}
          {event.venue ? <p className="text-sm text-accent-foreground">{event.venue}</p> : null}
        </div>

        <div className="px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">هذه الدعوة لـ</p>
          <p className="display mt-1 text-2xl text-foreground">{guest.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {guest.seats === 1 ? "تشمل شخصاً واحداً" : `تشمل ${guest.seats} أشخاص`}
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="رمز QR الخاص بدخولك"
            className="mx-auto mt-6 h-64 w-64 rounded-xl border border-border bg-white p-3"
          />

          <p dir="ltr" className="mt-4 font-mono text-sm tracking-[0.2em] text-muted-foreground">
            {guest.code}
          </p>
          <p className="mx-auto mt-4 max-w-xs text-sm text-muted-foreground">
            أظهر هذه الشاشة عند الباب. التقط لقطة شاشة إن لم يكن لديك إنترنت عند الوصول.
          </p>
        </div>
      </article>

      <p className="mt-6 text-center text-xs text-muted-foreground">احتفظ بهذا الرابط لنفسك — إنه ما يتيح لك الدخول.</p>
    </main>
  );
}
```

Note this page sets `dir="rtl"` directly on its own `<main>` rather than relying on `<html dir="rtl">` alone — harmless duplication, and makes the page correct even if it's ever embedded or previewed outside the root layout (e.g. a metadata crawler, a future email-preview tool).

- [ ] **Step 3: Verify and run the full test suite**

Run: `npx tsc --noEmit -p . 2>&1 | grep "^app/i/"`
Expected: no output.

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 4: Commit**

```bash
git add app/i/\[code\]/page.tsx app/i/\[code\]/not-found.tsx
git commit -m "Add the Arabic guest invitation page"
```

---

## Task 5: QR guest card image (`next/og`)

A downloadable, branded PNG: event name, guest name, QR code, plain-language Arabic instructions for someone who has never used a QR code (spec §8). This is the highest-uncertainty task in this plan — Satori (the renderer behind `next/og`'s `ImageResponse`) needs an Arabic-covering font loaded explicitly, and its Arabic text shaping should be verified visually, not assumed.

**Files:**
- Create: `app/events/[id]/guests/[guestId]/card/render-card.ts`
- Create: `app/events/[id]/guests/[guestId]/card/route.tsx`
- Modify: `features/guests/ui/ShareInvite.tsx` (add a "download card" link)

**Interfaces:**
- Consumes: `GetEventUseCase`, `makeEventRepository()`; `GetGuestUseCase`, `makeGuestRepository()`; `inviteUrl` (`@/shared/lib/codes`); the `qrcode` npm package.
- Produces: `renderGuestCardImage(event, guest): Promise<ImageResponse>` (`render-card.ts`) — Task 6's bulk ZIP route imports and reuses this exact function, so the card image is generated in exactly one place.

- [ ] **Step 1: Write the shared card-rendering function**

```tsx
// app/events/[id]/guests/[guestId]/card/render-card.tsx
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import type { Event } from "@/features/events/domain/Event";
import type { Guest } from "@/features/guests/domain/Guest";
import { inviteUrl } from "@/shared/lib/codes";

const CARD_WIDTH = 1000;
const CARD_HEIGHT = 1400;

/**
 * Fetches Cairo from Google Fonts and returns only the @font-face block that
 * covers Arabic (unicode-range starting at U+06xx) — the unrestricted CSS2
 * response has one @font-face per script subset (latin, latin-ext, arabic,
 * ...), and Satori needs the specific font FILE bytes for the glyphs it will
 * actually render, not the whole family.
 */
async function loadCairoArabicFont(weight: 400 | 700): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Cairo:wght@${weight}&display=swap`;
  const css = await fetch(cssUrl, { headers: { "User-Agent": "Mozilla/5.0" } }).then((res) => res.text());

  const blocks = css.split("@font-face").slice(1);
  const arabicBlock = blocks.find((block) => /unicode-range:[^;]*U\+06/.test(block));
  if (!arabicBlock) throw new Error("Could not find an Arabic-subset @font-face block in Cairo's CSS.");

  const fontUrlMatch = arabicBlock.match(/src: url\(([^)]+)\)/);
  if (!fontUrlMatch) throw new Error("Could not find a font file URL in the Arabic @font-face block.");

  const fontResponse = await fetch(fontUrlMatch[1]);
  return fontResponse.arrayBuffer();
}

export async function renderGuestCardImage(event: Event, guest: Guest): Promise<ImageResponse> {
  const [qr, regular, bold] = await Promise.all([
    QRCode.toDataURL(inviteUrl(guest.code), { errorCorrectionLevel: "M", margin: 1, width: 720 }),
    loadCairoArabicFont(400),
    loadCairoArabicFont(700),
  ]);

  const seatsLabel = guest.seats === 1 ? "تشمل شخصاً واحداً" : `تشمل ${guest.seats} أشخاص`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fbf8f4",
          fontFamily: "Cairo",
          padding: "64px",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#6f6357" }}>{event.name}</div>

        <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: "#1c1917", marginTop: 24 }}>
          {guest.name}
        </div>

        <div style={{ display: "flex", fontSize: 24, color: "#6f6357", marginTop: 12 }}>{seatsLabel}</div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr}
          width={480}
          height={480}
          style={{ marginTop: 40, borderRadius: 24, border: "1px solid #e8e1d6", backgroundColor: "#ffffff" }}
        />

        <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: "#6f6357", marginTop: 24 }}>
          {guest.code}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, gap: 8 }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#79490f" }}>
            أظهر هذه الصورة عند الباب
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#6f6357" }}>لقطة شاشة تكفي، لا حاجة لتطبيق</div>
        </div>
      </div>
    ),
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fonts: [
        { name: "Cairo", data: regular, weight: 400, style: "normal" },
        { name: "Cairo", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
```

- [ ] **Step 2: Build the card image route**

```tsx
// app/events/[id]/guests/[guestId]/card/route.tsx
import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { GetGuestUseCase } from "@/features/guests/domain/use-cases/GetGuestUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";
import { renderGuestCardImage } from "./render-card";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; guestId: string }> }) {
  await requireOwner();
  const { id, guestId } = await params;

  const eventId = Number(id);
  const numericGuestId = Number(guestId);
  if (!Number.isInteger(eventId) || !Number.isInteger(numericGuestId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const guest = await new GetGuestUseCase(makeGuestRepository()).execute(eventId, numericGuestId);
  if (!guest) notFound();

  return renderGuestCardImage(event, guest);
}
```

- [ ] **Step 3: Add a download-card link to the share panel**

In `features/guests/ui/ShareInvite.tsx`, add a new `<a>` alongside the existing "تحميل QR" link (inside the same `<div className="flex flex-wrap gap-2">`), linking to the new route:

```tsx
          <a
            href={`/events/${event.id}/guests/${guest.id}/card`}
            download={`دعوة-${guest.code}.png`}
            className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            تحميل البطاقة
          </a>
```

`ShareInvite` already receives `event` as a prop (Task 3, Step 6) — no new prop needed.

- [ ] **Step 4: Verify — this step needs a real visual check, not just a typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^(features/guests|app/events/\[id\]/guests)"`
Expected: no output.

Then, with the dev server running and signed in as the owner with at least one guest that has an Arabic name, fetch the card route directly (e.g. `curl -b <session-cookie> http://localhost:3000/events/1/guests/1/card -o /tmp/card.png` or open the URL in a browser tab while signed in) and inspect the resulting PNG:

1. Does it produce a valid PNG at all (not an error page)?
2. Does the Arabic text (event name, guest name, instructions) render as connected, correctly-shaped Arabic letterforms — not disconnected/isolated letter forms, not boxes/tofu, not reversed character order?
3. Is the QR code crisp and scannable (open it with a phone camera and confirm it resolves to the invite URL)?

If Arabic text renders broken (disconnected letters, wrong shaping, or missing glyphs) after confirming the font actually loaded (log `regular.byteLength`/`bold.byteLength` temporarily and confirm they're non-zero — a silent empty-buffer fetch failure is the most likely root cause, not Satori itself), **stop and report BLOCKED** with a description of exactly what's wrong, rather than guessing at a fix — this is exactly the kind of external-rendering-behavior uncertainty that's worth a second opinion before spending more rounds on it.

Run: `npm test`
Expected: all test files pass (no new test files this task — image rendering has no automated coverage here; the visual check above is the verification).

- [ ] **Step 5: Commit**

```bash
git add app/events/\[id\]/guests/\[guestId\]/card/render-card.tsx app/events/\[id\]/guests/\[guestId\]/card/route.tsx features/guests/ui/ShareInvite.tsx
git commit -m "Add the downloadable QR guest card image via next/og"
```

---

## Task 6: CSV guest list export and bulk QR card download

**Files:**
- Create: `app/events/[id]/guests/export/route.ts`
- Create: `app/events/[id]/guests/cards/route.ts`
- Modify: `features/guests/ui/GuestManager.tsx` (add export/bulk-download links)
- Modify: `package.json` (add `jszip`)

**Interfaces:**
- Consumes: `ListGuestsForEventUseCase`, `makeGuestRepository()`; `GetEventUseCase`, `makeEventRepository()`; `renderGuestCardImage` (Task 5's `render-card.tsx`); `jszip` (new dependency).
- Produces: nothing consumed elsewhere — both are leaf Route Handlers.

- [ ] **Step 1: Install jszip**

```bash
npm install jszip
```

- [ ] **Step 2: Build the CSV export route**

```ts
// app/events/[id]/guests/export/route.ts
import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { ListGuestsForEventUseCase } from "@/features/guests/domain/use-cases/ListGuestsForEventUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const guests = await new ListGuestsForEventUseCase(makeGuestRepository()).execute(eventId);

  const header = ["الاسم", "المقاعد", "الهاتف", "ملاحظة", "الرمز", "النوع"];
  const rows = guests.map((guest) => [
    guest.name,
    String(guest.seats),
    guest.phone ?? "",
    guest.note ?? "",
    guest.code,
    guest.source === "invited" ? "مدعو" : "بدون دعوة مسبقة",
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvField).join(",")).join("\n");
  // A UTF-8 BOM so Excel (still the most common opener) detects Arabic text as UTF-8 instead of guessing a local codepage.
  const bom = "﻿";

  return new Response(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="guests-${event.id}.csv"`,
    },
  });
}
```

Guest list only, not the scan log — spec §6 mentions exporting the scan log too, but there's no scan data to export until a later, separate plan builds the door scanner; exporting a permanently-empty second section now would be dead weight. That plan can add a scan-log export once there's something in it.

- [ ] **Step 3: Build the bulk card-download route**

```ts
// app/events/[id]/guests/cards/route.ts
import JSZip from "jszip";
import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { ListGuestsForEventUseCase } from "@/features/guests/domain/use-cases/ListGuestsForEventUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";
import { renderGuestCardImage } from "../[guestId]/card/render-card";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const guests = await new ListGuestsForEventUseCase(makeGuestRepository()).execute(eventId);
  if (guests.length === 0) notFound();

  const zip = new JSZip();
  for (const guest of guests) {
    const image = await renderGuestCardImage(event, guest);
    const buffer = await image.arrayBuffer();
    zip.file(`${guest.name}-${guest.code}.png`, buffer);
  }

  const archive = await zip.generateAsync({ type: "uint8array" });

  return new Response(archive, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="بطاقات-${event.id}.zip"`,
    },
  });
}
```

Cards are generated sequentially (one `await` at a time in the loop), not in parallel — each call fetches the Cairo font over the network, and firing dozens of concurrent font fetches for a large guest list risks hitting Google Fonts' rate limiting or exhausting outbound connections. Sequential is slower but reliable; if this proves too slow in practice for very large guest lists, that's a real, measurable problem to optimize later, not one to guess at now.

- [ ] **Step 4: Add export/bulk-download links to the guest manager**

In `features/guests/ui/GuestManager.tsx`, add two links inside the existing header row (the `<div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">` inside the `<Card>`), after the search `<Input>` and before the count `<p>`:

```tsx
          <a
            href={`/events/${eventId}/guests/export`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            تصدير CSV
          </a>
          <a
            href={`/events/${eventId}/guests/cards`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            تحميل كل البطاقات
          </a>
```

Both are plain `<a>` tags (not `Button`/`LinkButton`) — they trigger a file download via the browser's native navigation, not a client-side action, so no `useActionState`/Server Action wiring is needed.

- [ ] **Step 5: Verify and run the full test suite**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "^(features/guests|app/events/\[id\]/guests)"`
Expected: no output.

Run: `npm test`
Expected: all test files pass.

Manually confirm both routes work: sign in, open an event with at least one guest, visit `/events/<id>/guests/export` (downloads a CSV, opens correctly in a spreadsheet app with Arabic text intact) and `/events/<id>/guests/cards` (downloads a ZIP containing one PNG per guest).

- [ ] **Step 6: Commit**

```bash
git add app/events/\[id\]/guests/export/route.ts app/events/\[id\]/guests/cards/route.ts features/guests/ui/GuestManager.tsx package.json package-lock.json
git commit -m "Add CSV guest list export and bulk QR card download"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage for this slice:** spec §6's guest list/add/import/CSV export via Tasks 1, 2, 6. Spec §8's QR card + distribution via Tasks 3, 5. The guest-facing invitation page via Task 4. Manual search check-in, walk-in quick-add, and any check-in/check-out status display are explicitly out of scope — a later, separate plan (the door scanner), which is also the only place `features/check-in`'s `ListGuestsWithStatusUseCase` becomes useful.
- **Known gap, deliberately left open:** scan-log CSV export (spec §6 mentions it) has no data to export until the door-scanner plan exists — noted in Task 6, not silently dropped.
- **Type consistency check performed:** `GuestFormState` (Task 2) and `EditGuestFormState` (Task 3) are two distinct types in two distinct files — deliberately not shared, since Task 2's actions take an `eventId` alone and Task 3's take both `eventId` and `id`; conflating them would let a wrong-shaped state leak between unrelated forms. Every `GetGuestUseCase`/`UpdateGuestUseCase`/`DeleteGuestUseCase` call in this plan passes `(eventId, id, ...)`, matching Part 1's final-review fix — checked each call site individually against the current signatures, not assumed from memory of the original Part 1 build.
- **`renderGuestCardImage` is the single source of truth for card rendering** — Task 5 builds it, Task 6's bulk-ZIP route imports and reuses the exact same function rather than duplicating the Satori JSX or the font-loading logic. If the card's design ever changes, there is exactly one place to change it.

## End-to-end verification (done once, after all tasks — not a dispatched task)

The controller should walk through this in a browser before considering the plan done:

1. Open an existing event (from Part 2) with no guests yet — confirm the empty state on `/events/<id>/guests`.
2. Add one guest via the form — confirm it appears in the list, confirm the Arabic "تمت الإضافة" confirmation.
3. Paste a multi-line list via "لصق قائمة" — confirm all of them appear, confirm the count updates.
4. Search by a partial name, a note fragment, and a guest's code — confirm the visible count narrows correctly each time.
5. Open a guest's detail page — confirm the QR renders, confirm "نسخ الرابط"/"نسخ نص الدعوة" actually copy (check the clipboard), confirm "تحميل QR" and "تحميل البطاقة" both download a file.
6. Edit the guest's name — confirm "تم الحفظ." shows inline and the change persists.
7. Delete a guest (two-step confirm) — confirm it's gone from the list.
8. Open the invite link (`/i/<code>`) for a remaining guest **in a private/incognito window** (not signed in as owner) — confirm it loads without requiring login, confirm the Arabic instructions and QR render correctly, confirm a bad code shows the Arabic not-found page.
9. Download the card image directly and **visually inspect the Arabic text rendering** per Task 5's own verification step — this is worth re-checking end-to-end even if Task 5's own check passed, since fonts sometimes render differently once real (not test) guest/event names are involved.
10. Download the CSV — open it in a spreadsheet app, confirm Arabic text displays correctly (not mojibake), confirm all guests are present.
11. Download the bulk ZIP — confirm it contains one correctly-named PNG per guest.
12. Resize to a mobile viewport — confirm the guest list, detail page, and invite page all stay usable and readable at phone width.

## Next

A later, separate plan covers the door scanner: the actual `CheckInGuestUseCase`/`CheckOutGuestUseCase` decision logic (admit/already-inside/override) Part 1 deliberately deferred, built against `IScanRepository`/`IGuestRepository`; manual search check-in (reusing `ListGuestsWithStatusUseCase`, unused until now); walk-in quick-add; and the still-open design question from Part 2 about how an owner opens a specific event's scanner. Once that plan lands, this plan's guest list becomes a natural place to surface arrival status — worth revisiting `GuestManager`'s filter UI at that point rather than guessing at it now.
