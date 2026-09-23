# Data Foundation & Auth Implementation Plan (Part 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-event SQLite data layer with a multi-event Postgres schema, organized as the feature-sliced 4-layer architecture this project follows — see `docs/architecture-docs/`. Build the `events`, `guests`, `check-in`, and `auth` feature slices' `domain/` and `infrastructure/` layers (no `ui/` or `view-model/` yet — there's nothing to render until Parts 2/3), plus the shared DB and session plumbing every feature depends on.

**Architecture:** Each business domain gets its own `features/<domain>/{domain,infrastructure}` split: `domain/` holds entity types, a repository **interface**, and `<Verb><Noun>UseCase` classes (framework-free, testable with hand-written fakes); `infrastructure/` holds the Drizzle-backed repository **implementation** and its own integration test against a real local Postgres. There is no DI container — repositories and use-cases are constructed directly at the composition root (a Server Action or Route Handler, in Parts 2/3), via a small `make<Name>Repository()` factory per feature. Full rationale: `docs/architecture-docs/04-NEXTJS-ADAPTATION.md`. This plan ends at `domain/`+`infrastructure/` for every feature — no pages, no Server Actions, no `ui/`/`view-model/` — so `npm run build` is not expected to fully succeed until Part 3 lands (the existing `app/` pages still import the now-deleted `lib/db.ts` until they're rewired). `npm run typecheck -- features shared` and `npm test` are the completion bar for this plan.

**Tech Stack:** Next.js 16 / React 19 (existing), Postgres via `pg` + Drizzle ORM, Vitest for tests, Docker Compose for a local Postgres, bcryptjs + jose (existing deps) for auth.

**Spec:** [docs/superpowers/specs/2026-09-22-multi-event-checkin-design.md](../specs/2026-09-22-multi-event-checkin-design.md)
**Architecture:** [docs/architecture-docs/01-ARCHITECTURE.md](../../architecture-docs/01-ARCHITECTURE.md), [02-CONVENTIONS.md](../../architecture-docs/02-CONVENTIONS.md), [04-NEXTJS-ADAPTATION.md](../../architecture-docs/04-NEXTJS-ADAPTATION.md)

## Global Constraints

**Product (from the spec):**
- One owner account (email + password), many events — not multi-tenant SaaS (spec §2, §5).
- Every `guests` row belongs to exactly one `event_id`; every `scan_events` row belongs to exactly one `guest_id`. No query may return guests or scans across event boundaries (spec §4).
- `scan_events` is append-only. A guest's current status is *derived* (sum of `in` seats minus sum of `out` seats), never stored as a mutable flag (spec §4).
- `scan_events.method` is `'qr'` or `'manual'`. `scan_events.override` is a separate flag. `guests.source` is `'invited'` or `'walk_in'` (spec §4, §7).
- Door access is one shared code per event, resolved at login time — no named staff accounts (spec §5, non-goals).
- No offline mode, no guest accounts, no payments, no automated guest messaging (spec §3).

**Architecture (from `docs/architecture-docs/`):**
- Feature-sliced by business domain: `features/{auth,events,guests,check-in}/`. No `features/dashboard/` or route-named slices.
- `domain/` is framework-free: no Next.js imports (`next/headers`, `next/navigation`), no Drizzle imports. Entity types, `I<Name>Repository` interfaces, `<Verb><Noun>UseCase` classes with one public `execute()`.
- `infrastructure/` implements the `domain/` interface via Drizzle. Nothing outside `infrastructure/` imports Drizzle or the schema directly.
- No DI container. Composition happens at the call site via a `make<Name>Repository()` factory — see `04-NEXTJS-ADAPTATION.md`.
- Domain tests use hand-written fake repositories, no database. Infrastructure tests run as integration tests against a real local Postgres (deliberate divergence from "mock the transport," recorded in `04-NEXTJS-ADAPTATION.md`).
- Cross-feature domain dependencies go through the other feature's repository **interface**, never its implementation.

---

## Task 1: Local Postgres, dependency swap, and test runner

**Files:**
- Create: `docker-compose.yml`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `DATABASE_URL` env var convention every later task's `getDb()` relies on. `npm test` / `npm run test:watch` commands. `npm run db:push` command. The `@` path alias resolved inside Vitest (matching the app's existing `tsconfig.json` `@/*` alias), so test files can `import ... from "@/shared/..."` the same way app code does.

- [ ] **Step 1: Add the local Postgres service**

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: door
      POSTGRES_PASSWORD: door
      POSTGRES_DB: door_dev
    ports:
      - "5432:5432"
    volumes:
      - door-postgres:/var/lib/postgresql/data

volumes:
  door-postgres:
```

- [ ] **Step 2: Start it and confirm it's reachable**

Run: `docker compose up -d`
Expected: `docker compose ps` shows the `postgres` service as `running (healthy)` or `Up`.

- [ ] **Step 3: Swap dependencies in package.json**

Remove `better-sqlite3` and `@types/better-sqlite3`. Add:

```json
{
  "dependencies": {
    "pg": "8.13.1",
    "drizzle-orm": "0.36.4"
  },
  "devDependencies": {
    "@types/pg": "8.11.10",
    "drizzle-kit": "0.28.1",
    "vitest": "2.1.8",
    "dotenv": "16.4.7"
  }
}
```

Add scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "db:push": "drizzle-kit push"
  }
}
```

Run: `npm install`
Expected: installs cleanly, `better-sqlite3` no longer in `node_modules`.

- [ ] **Step 4: Point env config at Postgres**

Replace the `DATABASE_PATH` block in `.env.example`:

```
# Postgres connection string. Local dev uses the Docker Compose service:
DATABASE_URL=postgres://door:door@localhost:5432/door_dev
```

Copy `.env.example` to `.env`. Confirm `.env` is already git-ignored (it is — see `.gitignore`).

- [ ] **Step 5: Add the Vitest config with the @ alias, and the setup file**

```ts
// vitest.config.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      "@": dirname,
    },
  },
});
```

```ts
// vitest.setup.ts
import "dotenv/config";
```

- [ ] **Step 6: Verify the test runner and alias work with a throwaway test**

Create a temporary file `shared/sanity.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("sanity", () => {
  it("runs and resolves the @ alias", async () => {
    const mod = await import("@/vitest.setup");
    expect(mod).toBeDefined();
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 passed test. Delete `shared/sanity.test.ts` and the (now-empty) `shared/` directory afterward — it was only to confirm the runner and alias work.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml vitest.config.ts vitest.setup.ts package.json package-lock.json .env.example
git commit -m "Swap SQLite for Postgres deps, add Vitest with the @ alias and local dev Postgres"
```

---

## Task 2: Shared DB infrastructure

**Files:**
- Create: `shared/infrastructure/db/schema.ts`
- Create: `drizzle.config.ts`
- Create: `shared/infrastructure/db/client.ts`
- Create: `shared/infrastructure/db/test-helpers.ts`
- Test: `shared/infrastructure/db/test-helpers.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` from Task 1.
- Produces: `getDb()` — every feature's `infrastructure/` repository calls this. Exported tables `owner`, `events`, `guests`, `scanEvents` and enums `eventStatusEnum`, `guestSourceEnum`, `scanDirectionEnum`, `scanMethodEnum`. `resetDb()` — every later integration test's `beforeEach`.

This is genuinely shared, cross-domain infrastructure — `guests` references `events`, `scan_events` references `guests` — so it lives in `shared/`, not inside any one feature, per `04-NEXTJS-ADAPTATION.md`.

- [ ] **Step 1: Write the schema**

```ts
// shared/infrastructure/db/schema.ts
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const eventStatusEnum = pgEnum("event_status", ["draft", "live", "archived"]);
export const guestSourceEnum = pgEnum("guest_source", ["invited", "walk_in"]);
export const scanDirectionEnum = pgEnum("scan_direction", ["in", "out"]);
export const scanMethodEnum = pgEnum("scan_method", ["qr", "manual"]);

/** Single row: the one dashboard login. Not per-event — see spec §5. */
export const owner = pgTable("owner", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  eventDate: text("event_date"),
  venue: text("venue"),
  description: text("description"),
  doorCode: text("door_code").notNull().unique(),
  capacity: integer("capacity"),
  status: eventStatusEnum("status").notNull().default("live"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guests = pgTable(
  "guests",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    seats: integer("seats").notNull().default(1),
    phone: text("phone"),
    note: text("note"),
    code: text("code").notNull().unique(),
    source: guestSourceEnum("source").notNull().default("invited"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_guests_event").on(table.eventId)],
);

export const scanEvents = pgTable(
  "scan_events",
  {
    id: serial("id").primaryKey(),
    guestId: integer("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    direction: scanDirectionEnum("direction").notNull(),
    method: scanMethodEnum("method").notNull(),
    seats: integer("seats").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    scannedBy: text("scanned_by").notNull(),
    override: boolean("override").notNull().default(false),
  },
  (table) => [
    index("idx_scan_events_guest").on(table.guestId),
    index("idx_scan_events_at").on(table.at),
  ],
);
```

- [ ] **Step 2: Add the Drizzle Kit config**

```ts
// drizzle.config.ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./shared/infrastructure/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
```

- [ ] **Step 3: Add the lazy DB client**

```ts
// shared/infrastructure/db/client.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is missing. Copy .env.example to .env and set it.",
      );
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

export function getDb() {
  return drizzle(pool ?? getPool(), { schema });
}
```

- [ ] **Step 4: Push the schema to the local database**

Run: `npm run db:push`
Expected: Drizzle Kit reports it created `owner`, `events`, `guests`, `scan_events` (and the four enum types) with no errors. Accept any create-table prompts — there's no existing data to conflict with.

- [ ] **Step 5: Write the failing test for the reset helper**

```ts
// shared/infrastructure/db/test-helpers.test.ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "./client";
import { owner } from "./schema";
import { resetDb } from "./test-helpers";

describe("resetDb", () => {
  beforeEach(resetDb);

  it("wipes rows inserted by a previous call", async () => {
    await getDb().insert(owner).values({ email: "a@example.com", passwordHash: "x" });
    await resetDb();

    const rows = await getDb().select().from(owner).where(eq(owner.email, "a@example.com"));
    expect(rows).toHaveLength(0);
  });

  it("resets auto-increment ids", async () => {
    const [first] = await getDb()
      .insert(owner)
      .values({ email: "a@example.com", passwordHash: "x" })
      .returning({ id: owner.id });
    await resetDb();

    const [second] = await getDb()
      .insert(owner)
      .values({ email: "b@example.com", passwordHash: "x" })
      .returning({ id: owner.id });

    expect(second.id).toBe(first.id);
  });
});
```

- [ ] **Step 6: Run and confirm failure**

Run: `npm test -- test-helpers`
Expected: FAIL — `resetDb` not exported / module not found.

- [ ] **Step 7: Implement resetDb**

```ts
// shared/infrastructure/db/test-helpers.ts
import { sql } from "drizzle-orm";
import { getDb } from "./client";

/**
 * Wipes every application table. Call in beforeEach so tests never see
 * leftover rows from a previous test. TRUNCATE ... CASCADE also clears
 * guests/scan_events via their foreign keys.
 */
export async function resetDb(): Promise<void> {
  await getDb().execute(
    sql`TRUNCATE TABLE scan_events, guests, events, owner RESTART IDENTITY CASCADE`,
  );
}
```

- [ ] **Step 8: Run and confirm pass**

Run: `npm test -- test-helpers`
Expected: 2 passed.

- [ ] **Step 9: Commit**

```bash
git add shared/infrastructure/db/schema.ts shared/infrastructure/db/client.ts shared/infrastructure/db/test-helpers.ts shared/infrastructure/db/test-helpers.test.ts drizzle.config.ts
git commit -m "Add shared Drizzle schema, DB client, and test reset helper"
```

---

## Task 3: Shared code-generation helpers

**Files:**
- Create: `shared/lib/codes.ts`
- Test: `shared/lib/codes.test.ts`
- Delete: `lib/codes.ts`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces: `generateCode()`, `generateCodes(count)`, `generateDoorCode()`, `normaliseScan(raw)`, `inviteUrl(code)`. Used across features (`guests` for guest codes, `events` for door codes, and Parts 2/3 for the scanner and invite pages) — hence `shared/lib/`, not any one feature's `domain/`, per `04-NEXTJS-ADAPTATION.md`.

This is a straight relocation of the existing `lib/codes.ts` (unchanged logic) plus one addition, `generateDoorCode`. The existing file has no tests; add coverage for all of it while it's being touched.

- [ ] **Step 1: Write the failing tests**

```ts
// shared/lib/codes.test.ts
import { describe, expect, it } from "vitest";
import { generateCode, generateCodes, generateDoorCode, normaliseScan } from "./codes";

describe("generateCode / generateCodes", () => {
  it("generates a 10-character code from the safe alphabet", () => {
    const code = generateCode();
    expect(code).toHaveLength(10);
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/);
  });

  it("generateCodes returns the requested count, all unique", () => {
    const codes = generateCodes(50);
    expect(codes).toHaveLength(50);
    expect(new Set(codes).size).toBe(50);
  });
});

describe("generateDoorCode", () => {
  it("generates a shorter, typeable code from the same safe alphabet", () => {
    const code = generateDoorCode();
    expect(code.length).toBeGreaterThanOrEqual(4);
    expect(code.length).toBeLessThanOrEqual(6);
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/);
  });
});

describe("normaliseScan", () => {
  it("accepts a bare code in any case", () => {
    expect(normaliseScan("abc23456j9")).toBe("ABC23456J9");
  });

  it("extracts the code from a full invite URL", () => {
    expect(normaliseScan("https://example.com/i/ABC23456J9")).toBe("ABC23456J9");
  });

  it("rejects the wrong length", () => {
    expect(normaliseScan("ABC")).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- shared/lib/codes`
Expected: FAIL — module `./codes` not found.

- [ ] **Step 3: Implement (relocate + add generateDoorCode)**

```ts
// shared/lib/codes.ts
import { randomBytes } from "node:crypto";

/**
 * Alphabet with the characters people misread removed (0/O, 1/I/L).
 * Codes end up in QR images but also get read aloud at the door when a
 * phone screen is too cracked or too dim to scan.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 10;
const DOOR_CODE_LENGTH = 5;

export function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/** Generates `count` codes that are unique within the batch. */
export function generateCodes(count: number): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateCode());
  return [...codes];
}

/** Shorter than a guest code — a human types this once to start a shift, not per guest. */
export function generateDoorCode(): string {
  const bytes = randomBytes(DOOR_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < DOOR_CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/**
 * The door scanner may read a full invite URL, a bare code, or a code a
 * staff member typed in lowercase. Reduce all of those to the stored form.
 */
export function normaliseScan(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const fromUrl = text.match(/\/i\/([A-Za-z0-9]+)/);
  const candidate = (fromUrl ? fromUrl[1] : text).toUpperCase();

  if (candidate.length !== CODE_LENGTH) return null;
  if (![...candidate].every((char) => ALPHABET.includes(char))) return null;

  return candidate;
}

export function inviteUrl(code: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/i/${code}`;
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npm test -- shared/lib/codes`
Expected: 6 passed.

- [ ] **Step 5: Delete the old file and commit**

```bash
git rm lib/codes.ts
git add shared/lib/codes.ts shared/lib/codes.test.ts
git commit -m "Move code generation to shared/lib, add generateDoorCode and tests"
```

---

## Task 4: Events feature — domain layer

**Files:**
- Create: `features/events/domain/Event.ts`
- Create: `features/events/domain/IEventRepository.ts`
- Create: `features/events/domain/use-cases/ListEventsUseCase.ts`
- Create: `features/events/domain/use-cases/GetEventUseCase.ts`
- Create: `features/events/domain/use-cases/CreateEventUseCase.ts`
- Create: `features/events/domain/use-cases/UpdateEventUseCase.ts`
- Create: `features/events/domain/use-cases/ArchiveEventUseCase.ts`
- Create: `features/events/domain/use-cases/DuplicateEventUseCase.ts`
- Test: `features/events/domain/use-cases/events-use-cases.test.ts`

**Interfaces:**
- Consumes: nothing (framework-free).
- Produces: `Event`, `EventStatus`, `EventInput` types; `IEventRepository` interface (`list`, `getById`, `getByDoorCode`, `create`, `update`, `archive`) — Task 6's infrastructure implements this, and Task 7's `AuthenticateDoorUseCase` (auth feature) depends on it directly for `getByDoorCode`. The six use-case classes — consumed by Part 2's event list/settings pages.

- [ ] **Step 1: Write the entity, the repository interface, and a hand-written fake to test against**

```ts
// features/events/domain/Event.ts
export type EventStatus = "draft" | "live" | "archived";

export type Event = {
  id: number;
  name: string;
  eventDate: string | null;
  venue: string | null;
  description: string | null;
  doorCode: string;
  capacity: number | null;
  status: EventStatus;
  createdAt: Date;
};

export type EventInput = {
  name: string;
  eventDate: string | null;
  venue: string | null;
  description: string | null;
  doorCode: string;
  capacity: number | null;
};
```

```ts
// features/events/domain/IEventRepository.ts
import type { Event, EventInput } from "./Event";

export interface IEventRepository {
  list(): Promise<Event[]>;
  getById(id: number): Promise<Event | null>;
  getByDoorCode(doorCode: string): Promise<Event | null>;
  create(input: EventInput): Promise<Event>;
  update(id: number, input: EventInput): Promise<void>;
  archive(id: number): Promise<void>;
}
```

- [ ] **Step 2: Write the failing tests for all six use-cases, against a fake repository**

```ts
// features/events/domain/use-cases/events-use-cases.test.ts
import { describe, expect, it } from "vitest";
import type { Event, EventInput } from "../Event";
import type { IEventRepository } from "../IEventRepository";
import { ArchiveEventUseCase } from "./ArchiveEventUseCase";
import { CreateEventUseCase } from "./CreateEventUseCase";
import { DuplicateEventUseCase } from "./DuplicateEventUseCase";
import { GetEventUseCase } from "./GetEventUseCase";
import { ListEventsUseCase } from "./ListEventsUseCase";
import { UpdateEventUseCase } from "./UpdateEventUseCase";

class FakeEventRepository implements IEventRepository {
  private rows: Event[] = [];
  private nextId = 1;

  async list(): Promise<Event[]> {
    return [...this.rows].sort((a, b) => b.id - a.id);
  }

  async getById(id: number): Promise<Event | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async getByDoorCode(doorCode: string): Promise<Event | null> {
    return this.rows.find((row) => row.doorCode === doorCode) ?? null;
  }

  async create(input: EventInput): Promise<Event> {
    const event: Event = { id: this.nextId++, ...input, status: "live", createdAt: new Date() };
    this.rows.push(event);
    return event;
  }

  async update(id: number, input: EventInput): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, input);
  }

  async archive(id: number): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.status = "archived";
  }
}

const BASE: EventInput = {
  name: "Layla & Omar",
  eventDate: "2026-11-01",
  venue: "The Palm Hall",
  description: null,
  doorCode: "PALM1",
  capacity: 200,
};

describe("event use-cases", () => {
  it("creates and lists events, newest first", async () => {
    const repo = new FakeEventRepository();
    const first = await new CreateEventUseCase(repo).execute(BASE);
    const second = await new CreateEventUseCase(repo).execute({ ...BASE, name: "Sara's Birthday", doorCode: "SARA1" });

    const events = await new ListEventsUseCase(repo).execute();
    expect(events.map((e) => e.id)).toEqual([second.id, first.id]);
    expect(first.status).toBe("live");
  });

  it("gets an event by id", async () => {
    const repo = new FakeEventRepository();
    const created = await repo.create(BASE);
    expect((await new GetEventUseCase(repo).execute(created.id))?.name).toBe("Layla & Omar");
    expect(await new GetEventUseCase(repo).execute(999999)).toBeNull();
  });

  it("updates an event", async () => {
    const repo = new FakeEventRepository();
    const created = await repo.create(BASE);
    await new UpdateEventUseCase(repo).execute(created.id, { ...BASE, name: "Reception", doorCode: "PALM2" });

    const updated = await repo.getById(created.id);
    expect(updated?.name).toBe("Reception");
    expect(updated?.doorCode).toBe("PALM2");
  });

  it("archives an event", async () => {
    const repo = new FakeEventRepository();
    const created = await repo.create(BASE);
    await new ArchiveEventUseCase(repo).execute(created.id);
    expect((await repo.getById(created.id))?.status).toBe("archived");
  });

  it("duplicates an event's settings with a new door code and no date", async () => {
    const repo = new FakeEventRepository();
    const created = await repo.create(BASE);
    const copy = await new DuplicateEventUseCase(repo).execute(created.id, "PALM-COPY");

    expect(copy.id).not.toBe(created.id);
    expect(copy.name).toBe(created.name);
    expect(copy.venue).toBe(created.venue);
    expect(copy.doorCode).toBe("PALM-COPY");
    expect(copy.eventDate).toBeNull();
    expect(copy.status).toBe("live");
  });

  it("throws duplicating a nonexistent event", async () => {
    const repo = new FakeEventRepository();
    await expect(new DuplicateEventUseCase(repo).execute(999999, "X")).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npm test -- events-use-cases`
Expected: FAIL — the use-case modules don't exist yet.

- [ ] **Step 4: Implement the six use-cases**

```ts
// features/events/domain/use-cases/ListEventsUseCase.ts
import type { Event } from "../Event";
import type { IEventRepository } from "../IEventRepository";

export class ListEventsUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  execute(): Promise<Event[]> {
    return this.eventRepository.list();
  }
}
```

```ts
// features/events/domain/use-cases/GetEventUseCase.ts
import type { Event } from "../Event";
import type { IEventRepository } from "../IEventRepository";

export class GetEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  execute(id: number): Promise<Event | null> {
    return this.eventRepository.getById(id);
  }
}
```

```ts
// features/events/domain/use-cases/CreateEventUseCase.ts
import type { Event, EventInput } from "../Event";
import type { IEventRepository } from "../IEventRepository";

export class CreateEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  execute(input: EventInput): Promise<Event> {
    return this.eventRepository.create(input);
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
    return this.eventRepository.update(id, input);
  }
}
```

```ts
// features/events/domain/use-cases/ArchiveEventUseCase.ts
import type { IEventRepository } from "../IEventRepository";

export class ArchiveEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  execute(id: number): Promise<void> {
    return this.eventRepository.archive(id);
  }
}
```

```ts
// features/events/domain/use-cases/DuplicateEventUseCase.ts
import type { Event } from "../Event";
import type { IEventRepository } from "../IEventRepository";

/** Clones an event's settings, not its guests, with a fresh door code and no date — spec §6. */
export class DuplicateEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  async execute(id: number, newDoorCode: string): Promise<Event> {
    const source = await this.eventRepository.getById(id);
    if (!source) throw new Error("Event not found.");

    return this.eventRepository.create({
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

- [ ] **Step 5: Run and confirm pass**

Run: `npm test -- events-use-cases`
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add features/events/domain
git commit -m "Add events feature domain layer: entity, repository interface, use-cases"
```

---

## Task 5: Events feature — infrastructure layer

**Files:**
- Create: `features/events/infrastructure/EventRepository.ts`
- Create: `features/events/infrastructure/factory.ts`
- Test: `features/events/infrastructure/EventRepository.test.ts`

**Interfaces:**
- Consumes: `IEventRepository`, `Event`, `EventInput` (Task 4); `getDb()`, `events` table, `resetDb()` (Task 2).
- Produces: `EventRepository` class implementing `IEventRepository`. `makeEventRepository(): IEventRepository` — the composition-root factory Parts 2/3's Server Actions and the auth feature's `AuthenticateDoorUseCase` (Task 7) use.

- [ ] **Step 1: Write the failing integration tests**

```ts
// features/events/infrastructure/EventRepository.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { EventRepository } from "./EventRepository";

const BASE = {
  name: "Layla & Omar",
  eventDate: "2026-11-01",
  venue: "The Palm Hall",
  description: null,
  doorCode: "PALM1",
  capacity: 200,
};

describe("EventRepository (integration)", () => {
  beforeEach(resetDb);

  it("persists and retrieves an event through Postgres", async () => {
    const repo = new EventRepository();
    const created = await repo.create(BASE);

    expect(created.status).toBe("live");
    expect((await repo.getById(created.id))?.name).toBe("Layla & Omar");
    expect((await repo.getByDoorCode("PALM1"))?.id).toBe(created.id);
    expect(await repo.getByDoorCode("NOPE")).toBeNull();
  });

  it("lists newest first, updates, and archives", async () => {
    const repo = new EventRepository();
    const first = await repo.create(BASE);
    const second = await repo.create({ ...BASE, doorCode: "PALM2" });

    const listed = await repo.list();
    expect(listed.map((e) => e.id)).toEqual([second.id, first.id]);

    await repo.update(first.id, { ...BASE, name: "Reception", doorCode: "PALM1" });
    expect((await repo.getById(first.id))?.name).toBe("Reception");

    await repo.archive(first.id);
    expect((await repo.getById(first.id))?.status).toBe("archived");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- EventRepository`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repository and its factory**

```ts
// features/events/infrastructure/EventRepository.ts
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/shared/infrastructure/db/client";
import { events } from "@/shared/infrastructure/db/schema";
import type { Event, EventInput } from "../domain/Event";
import type { IEventRepository } from "../domain/IEventRepository";

function toEvent(row: typeof events.$inferSelect): Event {
  return {
    id: row.id,
    name: row.name,
    eventDate: row.eventDate,
    venue: row.venue,
    description: row.description,
    doorCode: row.doorCode,
    capacity: row.capacity,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export class EventRepository implements IEventRepository {
  async list(): Promise<Event[]> {
    const rows = await getDb().select().from(events).orderBy(desc(events.createdAt));
    return rows.map(toEvent);
  }

  async getById(id: number): Promise<Event | null> {
    const rows = await getDb().select().from(events).where(eq(events.id, id)).limit(1);
    return rows[0] ? toEvent(rows[0]) : null;
  }

  async getByDoorCode(doorCode: string): Promise<Event | null> {
    const rows = await getDb().select().from(events).where(eq(events.doorCode, doorCode)).limit(1);
    return rows[0] ? toEvent(rows[0]) : null;
  }

  async create(input: EventInput): Promise<Event> {
    const rows = await getDb()
      .insert(events)
      .values({ ...input, status: "live" })
      .returning();
    return toEvent(rows[0]);
  }

  async update(id: number, input: EventInput): Promise<void> {
    await getDb().update(events).set(input).where(eq(events.id, id));
  }

  async archive(id: number): Promise<void> {
    await getDb().update(events).set({ status: "archived" }).where(eq(events.id, id));
  }
}
```

```ts
// features/events/infrastructure/factory.ts
import type { IEventRepository } from "../domain/IEventRepository";
import { EventRepository } from "./EventRepository";

export function makeEventRepository(): IEventRepository {
  return new EventRepository();
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npm test -- EventRepository`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add features/events/infrastructure
git commit -m "Add events feature infrastructure: Drizzle repository and factory"
```

---

## Task 6: Guests feature — domain layer

**Files:**
- Create: `features/guests/domain/Guest.ts`
- Create: `features/guests/domain/IGuestRepository.ts`
- Create: `features/guests/domain/use-cases/ListGuestsForEventUseCase.ts`
- Create: `features/guests/domain/use-cases/GetGuestUseCase.ts`
- Create: `features/guests/domain/use-cases/GetGuestByCodeUseCase.ts`
- Create: `features/guests/domain/use-cases/CreateGuestUseCase.ts`
- Create: `features/guests/domain/use-cases/ImportGuestsUseCase.ts`
- Create: `features/guests/domain/use-cases/UpdateGuestUseCase.ts`
- Create: `features/guests/domain/use-cases/DeleteGuestUseCase.ts`
- Test: `features/guests/domain/use-cases/guests-use-cases.test.ts`

**Interfaces:**
- Consumes: `generateCode`, `generateCodes` (Task 3, shared/lib).
- Produces: `Guest`, `GuestSource`, `CreateGuestInput`, `UpdateGuestInput`, `BulkGuestRow` types; `IGuestRepository` interface (`listForEvent`, `getById`, `getByCode`, `create`, `createMany`, `update`, `delete`) — Task 8's infrastructure implements this. The seven use-cases — consumed by Part 2's guest management pages and Part 2's `/i/[code]` invite page (`GetGuestByCodeUseCase`).

- [ ] **Step 1: Write the entity and the repository interface**

```ts
// features/guests/domain/Guest.ts
export type GuestSource = "invited" | "walk_in";

export type Guest = {
  id: number;
  eventId: number;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  code: string;
  source: GuestSource;
  createdAt: Date;
};

/** Low-level shape the repository persists — code/source are explicit here since a
 * repository is source-agnostic; the CreateGuestUseCase (below) decides them for
 * the common "owner adds an invited guest" path. */
export type CreateGuestInput = {
  eventId: number;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  code: string;
  source: GuestSource;
};

export type UpdateGuestInput = {
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
};

export type BulkGuestRow = {
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  code: string;
};
```

```ts
// features/guests/domain/IGuestRepository.ts
import type { BulkGuestRow, CreateGuestInput, Guest, UpdateGuestInput } from "./Guest";

export interface IGuestRepository {
  listForEvent(eventId: number): Promise<Guest[]>;
  getById(id: number): Promise<Guest | null>;
  getByCode(code: string): Promise<Guest | null>;
  create(input: CreateGuestInput): Promise<Guest>;
  createMany(eventId: number, rows: BulkGuestRow[]): Promise<number>;
  update(id: number, input: UpdateGuestInput): Promise<void>;
  delete(id: number): Promise<void>;
}
```

- [ ] **Step 2: Write the failing tests for all seven use-cases, against a fake repository**

```ts
// features/guests/domain/use-cases/guests-use-cases.test.ts
import { describe, expect, it } from "vitest";
import type { BulkGuestRow, CreateGuestInput, Guest, UpdateGuestInput } from "../Guest";
import type { IGuestRepository } from "../IGuestRepository";
import { CreateGuestUseCase } from "./CreateGuestUseCase";
import { DeleteGuestUseCase } from "./DeleteGuestUseCase";
import { GetGuestByCodeUseCase } from "./GetGuestByCodeUseCase";
import { GetGuestUseCase } from "./GetGuestUseCase";
import { ImportGuestsUseCase } from "./ImportGuestsUseCase";
import { ListGuestsForEventUseCase } from "./ListGuestsForEventUseCase";
import { UpdateGuestUseCase } from "./UpdateGuestUseCase";

class FakeGuestRepository implements IGuestRepository {
  rows: Guest[] = [];
  private nextId = 1;

  async listForEvent(eventId: number): Promise<Guest[]> {
    return this.rows.filter((row) => row.eventId === eventId);
  }

  async getById(id: number): Promise<Guest | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async getByCode(code: string): Promise<Guest | null> {
    return this.rows.find((row) => row.code === code) ?? null;
  }

  async create(input: CreateGuestInput): Promise<Guest> {
    const guest: Guest = { id: this.nextId++, ...input, createdAt: new Date() };
    this.rows.push(guest);
    return guest;
  }

  async createMany(eventId: number, rows: BulkGuestRow[]): Promise<number> {
    for (const row of rows) {
      this.rows.push({ id: this.nextId++, eventId, ...row, source: "invited", createdAt: new Date() });
    }
    return rows.length;
  }

  async update(id: number, input: UpdateGuestInput): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, input);
  }

  async delete(id: number): Promise<void> {
    this.rows = this.rows.filter((row) => row.id !== id);
  }
}

describe("guest use-cases", () => {
  it("creates an invited guest with a generated code", async () => {
    const repo = new FakeGuestRepository();
    const guest = await new CreateGuestUseCase(repo).execute({
      eventId: 1,
      name: "Sara Ahmed",
      seats: 2,
      phone: null,
      note: null,
    });

    expect(guest.code).toHaveLength(10);
    expect(guest.source).toBe("invited");
  });

  it("lists guests scoped to one event, gets by id and by code", async () => {
    const repo = new FakeGuestRepository();
    await repo.create({ eventId: 1, name: "A", seats: 1, phone: null, note: null, code: "CODEA1", source: "invited" });
    const guestB = await repo.create({ eventId: 2, name: "B", seats: 1, phone: null, note: null, code: "CODEB1", source: "invited" });

    const listed = await new ListGuestsForEventUseCase(repo).execute(1);
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("A");

    expect((await new GetGuestUseCase(repo).execute(guestB.id))?.name).toBe("B");
    expect((await new GetGuestByCodeUseCase(repo).execute("CODEB1"))?.id).toBe(guestB.id);
    expect(await new GetGuestByCodeUseCase(repo).execute("NOPE")).toBeNull();
  });

  it("imports guests from pasted lines, one per line as name, seats, note", async () => {
    const repo = new FakeGuestRepository();
    const result = await new ImportGuestsUseCase(repo).execute(
      1,
      "One, 1\nTwo, 3, vegan\nThree",
    );

    expect(result.created).toBe(3);
    const guests = await repo.listForEvent(1);
    expect(guests.map((g) => g.name)).toEqual(["One", "Two", "Three"]);
    expect(guests[1]).toMatchObject({ seats: 3, note: "vegan" });
    expect(guests[2]).toMatchObject({ seats: 1, note: null });
    expect(new Set(guests.map((g) => g.code)).size).toBe(3);
  });

  it("rejects an import with no lines or a line with no name", async () => {
    const repo = new FakeGuestRepository();
    await expect(new ImportGuestsUseCase(repo).execute(1, "   \n  ")).rejects.toThrow("Paste at least one name.");
    await expect(new ImportGuestsUseCase(repo).execute(1, ", 2")).rejects.toThrow("no name");
  });

  it("updates and deletes a guest", async () => {
    const repo = new FakeGuestRepository();
    const guest = await repo.create({ eventId: 1, name: "Sara", seats: 1, phone: null, note: null, code: "UPD0001", source: "invited" });

    await new UpdateGuestUseCase(repo).execute(guest.id, { name: "Sara Ahmed", seats: 2, phone: "0500000000", note: "front row" });
    expect(await repo.getById(guest.id)).toMatchObject({ name: "Sara Ahmed", seats: 2 });

    await new DeleteGuestUseCase(repo).execute(guest.id);
    expect(await repo.getById(guest.id)).toBeNull();
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npm test -- guests-use-cases`
Expected: FAIL — the use-case modules don't exist yet.

- [ ] **Step 4: Implement the seven use-cases**

```ts
// features/guests/domain/use-cases/ListGuestsForEventUseCase.ts
import type { Guest } from "../Guest";
import type { IGuestRepository } from "../IGuestRepository";

export class ListGuestsForEventUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute(eventId: number): Promise<Guest[]> {
    return this.guestRepository.listForEvent(eventId);
  }
}
```

```ts
// features/guests/domain/use-cases/GetGuestUseCase.ts
import type { Guest } from "../Guest";
import type { IGuestRepository } from "../IGuestRepository";

export class GetGuestUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute(id: number): Promise<Guest | null> {
    return this.guestRepository.getById(id);
  }
}
```

```ts
// features/guests/domain/use-cases/GetGuestByCodeUseCase.ts
import type { Guest } from "../Guest";
import type { IGuestRepository } from "../IGuestRepository";

export class GetGuestByCodeUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute(code: string): Promise<Guest | null> {
    return this.guestRepository.getByCode(code);
  }
}
```

```ts
// features/guests/domain/use-cases/CreateGuestUseCase.ts
import { generateCode } from "@/shared/lib/codes";
import type { Guest } from "../Guest";
import type { IGuestRepository } from "../IGuestRepository";

export type AddGuestInput = {
  eventId: number;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
};

/** Adds one owner-invited guest, generating its unique code. */
export class CreateGuestUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute(input: AddGuestInput): Promise<Guest> {
    return this.guestRepository.create({ ...input, code: generateCode(), source: "invited" });
  }
}
```

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

    if (lines.length === 0) throw new Error("Paste at least one name.");
    if (lines.length > MAX_LINES) {
      throw new Error(`That's more than ${MAX_LINES} lines — split it into a few pastes.`);
    }

    const parsed = lines.map((line) => {
      const [name, seats, note] = line.split(/\t|,/).map((part) => part?.trim());
      return { name, seats, note };
    });

    const bad = parsed.find((row) => !row.name);
    if (bad) throw new Error("One of those lines has no name on it.");

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

```ts
// features/guests/domain/use-cases/UpdateGuestUseCase.ts
import type { UpdateGuestInput } from "../Guest";
import type { IGuestRepository } from "../IGuestRepository";

export class UpdateGuestUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute(id: number, input: UpdateGuestInput): Promise<void> {
    return this.guestRepository.update(id, input);
  }
}
```

```ts
// features/guests/domain/use-cases/DeleteGuestUseCase.ts
import type { IGuestRepository } from "../IGuestRepository";

export class DeleteGuestUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute(id: number): Promise<void> {
    return this.guestRepository.delete(id);
  }
}
```

- [ ] **Step 5: Run and confirm pass**

Run: `npm test -- guests-use-cases`
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add features/guests/domain
git commit -m "Add guests feature domain layer: entity, repository interface, use-cases"
```

---

## Task 7: Guests feature — infrastructure layer

**Files:**
- Create: `features/guests/infrastructure/GuestRepository.ts`
- Create: `features/guests/infrastructure/factory.ts`
- Test: `features/guests/infrastructure/GuestRepository.test.ts`

**Interfaces:**
- Consumes: `IGuestRepository` and its types (Task 6); `getDb()`, `guests` table, `resetDb()` (Task 2); `createEvent`-equivalent — uses `EventRepository` (Task 5) as a test fixture to get a valid `eventId`.
- Produces: `GuestRepository` implementing `IGuestRepository`. `makeGuestRepository(): IGuestRepository`.

- [ ] **Step 1: Write the failing integration tests**

```ts
// features/guests/infrastructure/GuestRepository.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { EventRepository } from "@/features/events/infrastructure/EventRepository";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { GuestRepository } from "./GuestRepository";

const EVENT = {
  name: "Layla & Omar",
  eventDate: null,
  venue: null,
  description: null,
  doorCode: "PALM1",
  capacity: null,
};

describe("GuestRepository (integration)", () => {
  beforeEach(resetDb);

  it("creates a guest scoped to an event and reads it back by id and code", async () => {
    const event = await new EventRepository().create(EVENT);
    const repo = new GuestRepository();

    const guest = await repo.create({
      eventId: event.id,
      name: "Sara Ahmed",
      seats: 2,
      phone: null,
      note: null,
      code: "ABC123XY",
      source: "invited",
    });

    expect(guest.eventId).toBe(event.id);
    expect(await repo.getById(guest.id)).toMatchObject({ name: "Sara Ahmed", seats: 2 });
    expect((await repo.getByCode("ABC123XY"))?.id).toBe(guest.id);
  });

  it("only lists guests belonging to the given event", async () => {
    const eventRepo = new EventRepository();
    const eventA = await eventRepo.create(EVENT);
    const eventB = await eventRepo.create({ ...EVENT, doorCode: "PALM2" });
    const repo = new GuestRepository();

    await repo.create({ eventId: eventA.id, name: "A Guest", seats: 1, phone: null, note: null, code: "CODEA123", source: "invited" });
    await repo.create({ eventId: eventB.id, name: "B Guest", seats: 1, phone: null, note: null, code: "CODEB123", source: "invited" });

    const guestsA = await repo.listForEvent(eventA.id);
    expect(guestsA).toHaveLength(1);
    expect(guestsA[0].name).toBe("A Guest");
  });

  it("bulk-creates guests, updates, and deletes", async () => {
    const event = await new EventRepository().create(EVENT);
    const repo = new GuestRepository();

    const created = await repo.createMany(event.id, [
      { name: "One", seats: 1, phone: null, note: null, code: "BULK0001" },
      { name: "Two", seats: 3, phone: "0500000000", note: "vegan", code: "BULK0002" },
    ]);
    expect(created).toBe(2);

    const guests = await repo.listForEvent(event.id);
    expect(guests.every((g) => g.source === "invited")).toBe(true);

    const first = guests[0];
    await repo.update(first.id, { name: "One Updated", seats: 2, phone: null, note: null });
    expect((await repo.getById(first.id))?.name).toBe("One Updated");

    await repo.delete(first.id);
    expect(await repo.getById(first.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- GuestRepository`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// features/guests/infrastructure/GuestRepository.ts
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/shared/infrastructure/db/client";
import { guests } from "@/shared/infrastructure/db/schema";
import type { BulkGuestRow, CreateGuestInput, Guest, UpdateGuestInput } from "../domain/Guest";
import type { IGuestRepository } from "../domain/IGuestRepository";

function toGuest(row: typeof guests.$inferSelect): Guest {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    seats: row.seats,
    phone: row.phone,
    note: row.note,
    code: row.code,
    source: row.source,
    createdAt: row.createdAt,
  };
}

export class GuestRepository implements IGuestRepository {
  async listForEvent(eventId: number): Promise<Guest[]> {
    const rows = await getDb().select().from(guests).where(eq(guests.eventId, eventId)).orderBy(asc(guests.name));
    return rows.map(toGuest);
  }

  async getById(id: number): Promise<Guest | null> {
    const rows = await getDb().select().from(guests).where(eq(guests.id, id)).limit(1);
    return rows[0] ? toGuest(rows[0]) : null;
  }

  async getByCode(code: string): Promise<Guest | null> {
    const rows = await getDb().select().from(guests).where(eq(guests.code, code)).limit(1);
    return rows[0] ? toGuest(rows[0]) : null;
  }

  async create(input: CreateGuestInput): Promise<Guest> {
    const rows = await getDb().insert(guests).values(input).returning();
    return toGuest(rows[0]);
  }

  async createMany(eventId: number, rows: BulkGuestRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const inserted = await getDb()
      .insert(guests)
      .values(rows.map((row) => ({ ...row, eventId, source: "invited" as const })))
      .returning({ id: guests.id });
    return inserted.length;
  }

  async update(id: number, input: UpdateGuestInput): Promise<void> {
    await getDb().update(guests).set(input).where(eq(guests.id, id));
  }

  async delete(id: number): Promise<void> {
    await getDb().delete(guests).where(eq(guests.id, id));
  }
}
```

```ts
// features/guests/infrastructure/factory.ts
import type { IGuestRepository } from "../domain/IGuestRepository";
import { GuestRepository } from "./GuestRepository";

export function makeGuestRepository(): IGuestRepository {
  return new GuestRepository();
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npm test -- GuestRepository`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add features/guests/infrastructure
git commit -m "Add guests feature infrastructure: Drizzle repository and factory"
```

---

## Task 8: Check-in feature — domain layer

This is the highest-risk correctness area in the whole spec (§10), so the
balance math is a pure domain helper, unit-tested with fixtures — no
database — before anything else in this feature.

**Files:**
- Create: `features/check-in/domain/ScanEvent.ts`
- Create: `features/check-in/domain/foldGuestBalances.ts`
- Test: `features/check-in/domain/foldGuestBalances.test.ts`
- Create: `features/check-in/domain/IScanRepository.ts`
- Create: `features/check-in/domain/use-cases/UndoLastScanUseCase.ts`
- Create: `features/check-in/domain/use-cases/ListGuestsWithStatusUseCase.ts`
- Create: `features/check-in/domain/use-cases/GetEventStatsUseCase.ts`
- Create: `features/check-in/domain/use-cases/GetArrivalBucketsUseCase.ts`
- Create: `features/check-in/domain/use-cases/GetRecentScansUseCase.ts`
- Create: `features/check-in/domain/use-cases/GetGuestInsideSeatsUseCase.ts`
- Test: `features/check-in/domain/use-cases/check-in-use-cases.test.ts`

**Interfaces:**
- Produces: `foldGuestBalances(scans)` (pure — the single source of truth for derived status, per spec §4). `ScanDirection`, `ScanMethod`, `ScanEvent`, `RecordScanInput`, `GuestWithStatus`, `EventStats`, `ArrivalBucket`, `RecentScan` types. `IScanRepository` interface — Task 9's infrastructure implements it. Six use-cases — consumed by Part 2's dashboard (stats, chart, recent feed) and Part 3's scanner/manual-search/undo actions. Part 3 also builds `CheckInGuestUseCase`/`CheckOutGuestUseCase` (the admit/already/override decision logic) directly against `IScanRepository` + `IGuestRepository` — deliberately not built here, since that decision logic belongs with the scanner UX it serves.

- [ ] **Step 1: Write the failing test for the pure fold function**

```ts
// features/check-in/domain/foldGuestBalances.test.ts
import { describe, expect, it } from "vitest";
import { foldGuestBalances } from "./foldGuestBalances";

describe("foldGuestBalances", () => {
  it("a single check-in leaves the guest inside", () => {
    const result = foldGuestBalances([{ guestId: 1, direction: "in", seats: 4 }]);
    expect(result.get(1)).toBe(4);
  });

  it("check-in then full check-out nets to zero (outside)", () => {
    const result = foldGuestBalances([
      { guestId: 1, direction: "in", seats: 4 },
      { guestId: 1, direction: "out", seats: 4 },
    ]);
    expect(result.get(1)).toBe(0);
  });

  it("a partial check-out leaves the remaining seats inside", () => {
    const result = foldGuestBalances([
      { guestId: 1, direction: "in", seats: 4 },
      { guestId: 1, direction: "out", seats: 1 },
    ]);
    expect(result.get(1)).toBe(3);
  });

  it("re-entry after a full exit is additive, not a reset", () => {
    const result = foldGuestBalances([
      { guestId: 1, direction: "in", seats: 2 },
      { guestId: 1, direction: "out", seats: 2 },
      { guestId: 1, direction: "in", seats: 2 },
    ]);
    expect(result.get(1)).toBe(2);
  });

  it("keeps separate balances per guest", () => {
    const result = foldGuestBalances([
      { guestId: 1, direction: "in", seats: 4 },
      { guestId: 2, direction: "in", seats: 1 },
      { guestId: 1, direction: "out", seats: 4 },
    ]);
    expect(result.get(1)).toBe(0);
    expect(result.get(2)).toBe(1);
  });

  it("an unknown guest has no entry, not zero", () => {
    const result = foldGuestBalances([]);
    expect(result.has(1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- foldGuestBalances`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the entity types and the pure fold**

```ts
// features/check-in/domain/ScanEvent.ts
export type ScanDirection = "in" | "out";
export type ScanMethod = "qr" | "manual";

export type ScanEvent = {
  id: number;
  guestId: number;
  direction: ScanDirection;
  method: ScanMethod;
  seats: number;
  at: Date;
  scannedBy: string;
  override: boolean;
};

export type RecordScanInput = {
  guestId: number;
  direction: ScanDirection;
  method: ScanMethod;
  seats: number;
  scannedBy: string;
  override: boolean;
};

export type GuestWithStatus = {
  id: number;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  code: string;
  source: "invited" | "walk_in";
  insideSeats: number;
};

export type EventStats = {
  invites: number;
  seatsInvited: number;
  guestsInside: number;
  seatsInside: number;
};

export type ArrivalBucket = { minute: string; seats: number };

export type RecentScan = {
  guestName: string;
  direction: ScanDirection;
  method: ScanMethod;
  seats: number;
  at: Date;
  scannedBy: string;
  override: boolean;
};
```

```ts
// features/check-in/domain/foldGuestBalances.ts
import type { ScanDirection } from "./ScanEvent";

export type ScanForBalance = { guestId: number; direction: ScanDirection; seats: number };

/**
 * Folds a list of scan rows into a per-guest "seats currently inside"
 * balance. `in` adds seats, `out` subtracts them — a guest is inside
 * whenever their balance is greater than zero. This is the single source
 * of truth for derived status; every status shown anywhere in the app
 * traces back to this function. See spec §4.
 */
export function foldGuestBalances(scans: ScanForBalance[]): Map<number, number> {
  const balances = new Map<number, number>();
  for (const scan of scans) {
    const delta = scan.direction === "in" ? scan.seats : -scan.seats;
    balances.set(scan.guestId, (balances.get(scan.guestId) ?? 0) + delta);
  }
  return balances;
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npm test -- foldGuestBalances`
Expected: 6 passed.

- [ ] **Step 5: Commit the pure fold and entity types**

```bash
git add features/check-in/domain/ScanEvent.ts features/check-in/domain/foldGuestBalances.ts features/check-in/domain/foldGuestBalances.test.ts
git commit -m "Add check-in feature entities and pure guest-balance folding logic"
```

- [ ] **Step 6: Write the repository interface**

```ts
// features/check-in/domain/IScanRepository.ts
import type {
  ArrivalBucket,
  EventStats,
  GuestWithStatus,
  RecentScan,
  RecordScanInput,
  ScanEvent,
} from "./ScanEvent";

export interface IScanRepository {
  record(input: RecordScanInput): Promise<ScanEvent>;
  listForGuest(guestId: number): Promise<ScanEvent[]>;
  undoLast(guestId: number): Promise<boolean>;
  insideSeatsForGuest(guestId: number): Promise<number>;
  listGuestsWithStatus(eventId: number, query?: string): Promise<GuestWithStatus[]>;
  eventStats(eventId: number): Promise<EventStats>;
  arrivalBuckets(eventId: number): Promise<ArrivalBucket[]>;
  recentScans(eventId: number, limit?: number): Promise<RecentScan[]>;
}
```

- [ ] **Step 7: Write the failing tests for the six use-cases, against a fake repository**

```ts
// features/check-in/domain/use-cases/check-in-use-cases.test.ts
import { describe, expect, it } from "vitest";
import type {
  ArrivalBucket,
  EventStats,
  GuestWithStatus,
  RecentScan,
  RecordScanInput,
  ScanEvent,
} from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";
import { GetArrivalBucketsUseCase } from "./GetArrivalBucketsUseCase";
import { GetEventStatsUseCase } from "./GetEventStatsUseCase";
import { GetGuestInsideSeatsUseCase } from "./GetGuestInsideSeatsUseCase";
import { GetRecentScansUseCase } from "./GetRecentScansUseCase";
import { ListGuestsWithStatusUseCase } from "./ListGuestsWithStatusUseCase";
import { UndoLastScanUseCase } from "./UndoLastScanUseCase";

class FakeScanRepository implements IScanRepository {
  scans: ScanEvent[] = [];
  guestsWithStatus: GuestWithStatus[] = [];
  stats: EventStats = { invites: 0, seatsInvited: 0, guestsInside: 0, seatsInside: 0 };
  buckets: ArrivalBucket[] = [];
  recent: RecentScan[] = [];
  private nextId = 1;

  async record(input: RecordScanInput): Promise<ScanEvent> {
    const scan: ScanEvent = { id: this.nextId++, at: new Date(), ...input };
    this.scans.push(scan);
    return scan;
  }

  async listForGuest(guestId: number): Promise<ScanEvent[]> {
    return this.scans.filter((s) => s.guestId === guestId);
  }

  async undoLast(guestId: number): Promise<boolean> {
    const last = [...this.scans].reverse().find((s) => s.guestId === guestId);
    if (!last) return false;
    this.scans = this.scans.filter((s) => s.id !== last.id);
    return true;
  }

  async insideSeatsForGuest(): Promise<number> {
    return 0;
  }

  async listGuestsWithStatus(): Promise<GuestWithStatus[]> {
    return this.guestsWithStatus;
  }

  async eventStats(): Promise<EventStats> {
    return this.stats;
  }

  async arrivalBuckets(): Promise<ArrivalBucket[]> {
    return this.buckets;
  }

  async recentScans(): Promise<RecentScan[]> {
    return this.recent;
  }
}

describe("check-in use-cases", () => {
  it("undoes the most recent scan for a guest, returns false if none exist", async () => {
    const repo = new FakeScanRepository();
    await repo.record({ guestId: 1, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });

    expect(await new UndoLastScanUseCase(repo).execute(1)).toBe(true);
    expect(repo.scans).toHaveLength(0);
    expect(await new UndoLastScanUseCase(repo).execute(1)).toBe(false);
  });

  it("passes through guest status, stats, arrival buckets, recent scans, and inside seats", async () => {
    const repo = new FakeScanRepository();
    repo.guestsWithStatus = [
      { id: 1, name: "Sara", seats: 2, phone: null, note: null, code: "X", source: "invited", insideSeats: 2 },
    ];
    repo.stats = { invites: 1, seatsInvited: 2, guestsInside: 1, seatsInside: 2 };
    repo.buckets = [{ minute: "2026-11-01T20:00:00.000Z", seats: 2 }];
    repo.recent = [{ guestName: "Sara", direction: "in", method: "qr", seats: 2, at: new Date(), scannedBy: "door", override: false }];

    expect(await new ListGuestsWithStatusUseCase(repo).execute(1)).toEqual(repo.guestsWithStatus);
    expect(await new ListGuestsWithStatusUseCase(repo).execute(1, "sara")).toEqual(repo.guestsWithStatus);
    expect(await new GetEventStatsUseCase(repo).execute(1)).toEqual(repo.stats);
    expect(await new GetArrivalBucketsUseCase(repo).execute(1)).toEqual(repo.buckets);
    expect(await new GetRecentScansUseCase(repo).execute(1)).toEqual(repo.recent);
    expect(await new GetGuestInsideSeatsUseCase(repo).execute(1)).toBe(0);
  });
});
```

- [ ] **Step 8: Run and confirm failure**

Run: `npm test -- check-in-use-cases`
Expected: FAIL — the use-case modules don't exist yet.

- [ ] **Step 9: Implement the six use-cases**

```ts
// features/check-in/domain/use-cases/UndoLastScanUseCase.ts
import type { IScanRepository } from "../IScanRepository";

export class UndoLastScanUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(guestId: number): Promise<boolean> {
    return this.scanRepository.undoLast(guestId);
  }
}
```

```ts
// features/check-in/domain/use-cases/ListGuestsWithStatusUseCase.ts
import type { GuestWithStatus } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export class ListGuestsWithStatusUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(eventId: number, query?: string): Promise<GuestWithStatus[]> {
    return this.scanRepository.listGuestsWithStatus(eventId, query);
  }
}
```

```ts
// features/check-in/domain/use-cases/GetEventStatsUseCase.ts
import type { EventStats } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export class GetEventStatsUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(eventId: number): Promise<EventStats> {
    return this.scanRepository.eventStats(eventId);
  }
}
```

```ts
// features/check-in/domain/use-cases/GetArrivalBucketsUseCase.ts
import type { ArrivalBucket } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export class GetArrivalBucketsUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(eventId: number): Promise<ArrivalBucket[]> {
    return this.scanRepository.arrivalBuckets(eventId);
  }
}
```

```ts
// features/check-in/domain/use-cases/GetRecentScansUseCase.ts
import type { RecentScan } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export class GetRecentScansUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(eventId: number, limit?: number): Promise<RecentScan[]> {
    return this.scanRepository.recentScans(eventId, limit);
  }
}
```

```ts
// features/check-in/domain/use-cases/GetGuestInsideSeatsUseCase.ts
import type { IScanRepository } from "../IScanRepository";

export class GetGuestInsideSeatsUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(guestId: number): Promise<number> {
    return this.scanRepository.insideSeatsForGuest(guestId);
  }
}
```

- [ ] **Step 10: Run and confirm pass**

Run: `npm test -- check-in-use-cases`
Expected: 2 passed.

- [ ] **Step 11: Commit**

```bash
git add features/check-in/domain/IScanRepository.ts features/check-in/domain/use-cases
git commit -m "Add check-in feature repository interface and read-path use-cases"
```

---

## Task 9: Check-in feature — infrastructure layer

**Files:**
- Create: `features/check-in/infrastructure/ScanRepository.ts`
- Create: `features/check-in/infrastructure/factory.ts`
- Test: `features/check-in/infrastructure/ScanRepository.test.ts`

**Interfaces:**
- Consumes: `IScanRepository` and its types (Task 8); `foldGuestBalances` (Task 8); `getDb()`, `scanEvents`/`guests` tables (Task 2); `EventRepository`/`GuestRepository` (Tasks 5, 7) as test fixtures.
- Produces: `ScanRepository` implementing `IScanRepository`. `makeScanRepository(): IScanRepository` — consumed by Parts 2/3.

- [ ] **Step 1: Write the failing integration tests**

```ts
// features/check-in/infrastructure/ScanRepository.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { EventRepository } from "@/features/events/infrastructure/EventRepository";
import { GuestRepository } from "@/features/guests/infrastructure/GuestRepository";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { ScanRepository } from "./ScanRepository";

const EVENT = {
  name: "Layla & Omar",
  eventDate: null,
  venue: null,
  description: null,
  doorCode: "PALM1",
  capacity: null,
};

async function seedGuest(eventId: number, overrides: Partial<{ name: string; seats: number; code: string }> = {}) {
  return new GuestRepository().create({
    eventId,
    name: overrides.name ?? "Sara Ahmed",
    seats: overrides.seats ?? 2,
    phone: null,
    note: null,
    code: overrides.code ?? "ABCXYZ01",
    source: "invited",
  });
}

describe("ScanRepository (integration)", () => {
  beforeEach(resetDb);

  it("records a scan and reads back the guest's inside seats", async () => {
    const event = await new EventRepository().create(EVENT);
    const guest = await seedGuest(event.id);
    const repo = new ScanRepository();

    await repo.record({ guestId: guest.id, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });

    expect(await repo.insideSeatsForGuest(guest.id)).toBe(2);
    expect(await repo.listForGuest(guest.id)).toHaveLength(1);
  });

  it("checking out reduces the inside balance", async () => {
    const event = await new EventRepository().create(EVENT);
    const guest = await seedGuest(event.id);
    const repo = new ScanRepository();

    await repo.record({ guestId: guest.id, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });
    await repo.record({ guestId: guest.id, direction: "out", method: "manual", seats: 2, scannedBy: "door", override: false });

    expect(await repo.insideSeatsForGuest(guest.id)).toBe(0);
  });

  it("undoes the most recent scan only", async () => {
    const event = await new EventRepository().create(EVENT);
    const guest = await seedGuest(event.id);
    const repo = new ScanRepository();

    await repo.record({ guestId: guest.id, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });
    await repo.record({ guestId: guest.id, direction: "out", method: "qr", seats: 1, scannedBy: "door", override: false });

    expect(await repo.undoLast(guest.id)).toBe(true);
    expect(await repo.insideSeatsForGuest(guest.id)).toBe(2);
    expect(await repo.undoLast(999999)).toBe(false);
  });

  it("scopes guest status and search to one event", async () => {
    const eventRepo = new EventRepository();
    const eventA = await eventRepo.create(EVENT);
    const eventB = await eventRepo.create({ ...EVENT, doorCode: "PALM2" });
    const guestA = await seedGuest(eventA.id, { name: "Sara Ahmed", code: "AAAAAAA1" });
    await seedGuest(eventB.id, { name: "Omar Khan", code: "BBBBBBB1" });

    const repo = new ScanRepository();
    await repo.record({ guestId: guestA.id, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });

    const statusA = await repo.listGuestsWithStatus(eventA.id);
    expect(statusA).toHaveLength(1);
    expect(statusA[0]).toMatchObject({ name: "Sara Ahmed", insideSeats: 2 });

    expect(await repo.listGuestsWithStatus(eventA.id, "sara")).toHaveLength(1);
    expect(await repo.listGuestsWithStatus(eventA.id, "omar")).toHaveLength(0);
  });

  it("computes event stats from derived status", async () => {
    const event = await new EventRepository().create(EVENT);
    const inside = await seedGuest(event.id, { name: "Inside Guest", seats: 3, code: "INSIDE01" });
    await seedGuest(event.id, { name: "Outside Guest", seats: 1, code: "OUTSIDE1" });

    const repo = new ScanRepository();
    await repo.record({ guestId: inside.id, direction: "in", method: "qr", seats: 3, scannedBy: "door", override: false });

    expect(await repo.eventStats(event.id)).toEqual({
      invites: 2,
      seatsInvited: 4,
      guestsInside: 1,
      seatsInside: 3,
    });
  });

  it("lists recent scans newest first, scoped to the event", async () => {
    const event = await new EventRepository().create(EVENT);
    const guest = await seedGuest(event.id);
    const repo = new ScanRepository();

    await repo.record({ guestId: guest.id, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });
    await repo.record({ guestId: guest.id, direction: "out", method: "manual", seats: 1, scannedBy: "door", override: false });

    const recent = await repo.recentScans(event.id, 5);
    expect(recent).toHaveLength(2);
    expect(recent[0].direction).toBe("out");
    expect(recent[0].guestName).toBe("Sara Ahmed");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- ScanRepository`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// features/check-in/infrastructure/ScanRepository.ts
import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { getDb } from "@/shared/infrastructure/db/client";
import { guests, scanEvents } from "@/shared/infrastructure/db/schema";
import { foldGuestBalances } from "../domain/foldGuestBalances";
import type {
  ArrivalBucket,
  EventStats,
  GuestWithStatus,
  RecentScan,
  RecordScanInput,
  ScanEvent,
} from "../domain/ScanEvent";
import type { IScanRepository } from "../domain/IScanRepository";

function toScanEvent(row: typeof scanEvents.$inferSelect): ScanEvent {
  return {
    id: row.id,
    guestId: row.guestId,
    direction: row.direction,
    method: row.method,
    seats: row.seats,
    at: row.at,
    scannedBy: row.scannedBy,
    override: row.override,
  };
}

export class ScanRepository implements IScanRepository {
  async record(input: RecordScanInput): Promise<ScanEvent> {
    const rows = await getDb().insert(scanEvents).values(input).returning();
    return toScanEvent(rows[0]);
  }

  async listForGuest(guestId: number): Promise<ScanEvent[]> {
    const rows = await getDb()
      .select()
      .from(scanEvents)
      .where(eq(scanEvents.guestId, guestId))
      .orderBy(asc(scanEvents.at));
    return rows.map(toScanEvent);
  }

  async undoLast(guestId: number): Promise<boolean> {
    const rows = await getDb()
      .select({ id: scanEvents.id })
      .from(scanEvents)
      .where(eq(scanEvents.guestId, guestId))
      .orderBy(desc(scanEvents.at), desc(scanEvents.id))
      .limit(1);

    const last = rows[0];
    if (!last) return false;

    await getDb().delete(scanEvents).where(eq(scanEvents.id, last.id));
    return true;
  }

  async insideSeatsForGuest(guestId: number): Promise<number> {
    const rows = await getDb()
      .select({ direction: scanEvents.direction, seats: scanEvents.seats })
      .from(scanEvents)
      .where(eq(scanEvents.guestId, guestId));

    const balances = foldGuestBalances(rows.map((row) => ({ guestId, ...row })));
    return balances.get(guestId) ?? 0;
  }

  async listGuestsWithStatus(eventId: number, query?: string): Promise<GuestWithStatus[]> {
    const whereClause = query
      ? and(eq(guests.eventId, eventId), ilike(guests.name, `%${query}%`))
      : eq(guests.eventId, eventId);

    const guestRows = await getDb().select().from(guests).where(whereClause).orderBy(asc(guests.name));
    if (guestRows.length === 0) return [];

    // Scoped by event, not by the (possibly narrower) search results above —
    // only looked up by the guest ids in guestRows, so extra balances for
    // other guests in the same event are simply unused.
    const scanRows = await getDb()
      .select({ guestId: scanEvents.guestId, direction: scanEvents.direction, seats: scanEvents.seats })
      .from(scanEvents)
      .innerJoin(guests, eq(guests.id, scanEvents.guestId))
      .where(eq(guests.eventId, eventId));

    const balances = foldGuestBalances(scanRows);

    return guestRows.map((row) => ({
      id: row.id,
      name: row.name,
      seats: row.seats,
      phone: row.phone,
      note: row.note,
      code: row.code,
      source: row.source,
      insideSeats: balances.get(row.id) ?? 0,
    }));
  }

  async eventStats(eventId: number): Promise<EventStats> {
    const guestsWithStatus = await this.listGuestsWithStatus(eventId);

    return {
      invites: guestsWithStatus.length,
      seatsInvited: guestsWithStatus.reduce((sum, g) => sum + g.seats, 0),
      guestsInside: guestsWithStatus.filter((g) => g.insideSeats > 0).length,
      seatsInside: guestsWithStatus.reduce((sum, g) => sum + Math.max(g.insideSeats, 0), 0),
    };
  }

  /** Check-ins only (direction = 'in'), in 15-minute buckets, for the arrivals chart. */
  async arrivalBuckets(eventId: number): Promise<ArrivalBucket[]> {
    const rows = await getDb()
      .select({ at: scanEvents.at, seats: scanEvents.seats })
      .from(scanEvents)
      .innerJoin(guests, eq(guests.id, scanEvents.guestId))
      .where(and(eq(guests.eventId, eventId), eq(scanEvents.direction, "in")))
      .orderBy(asc(scanEvents.at));

    const buckets = new Map<string, number>();
    for (const row of rows) {
      const date = new Date(row.at);
      const flooredMinutes = Math.floor(date.getUTCMinutes() / 15) * 15;
      const bucket = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), flooredMinutes),
      ).toISOString();
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + row.seats);
    }

    return [...buckets.entries()]
      .map(([minute, seats]) => ({ minute, seats }))
      .sort((a, b) => a.minute.localeCompare(b.minute));
  }

  async recentScans(eventId: number, limit = 12): Promise<RecentScan[]> {
    return getDb()
      .select({
        guestName: guests.name,
        direction: scanEvents.direction,
        method: scanEvents.method,
        seats: scanEvents.seats,
        at: scanEvents.at,
        scannedBy: scanEvents.scannedBy,
        override: scanEvents.override,
      })
      .from(scanEvents)
      .innerJoin(guests, eq(guests.id, scanEvents.guestId))
      .where(eq(guests.eventId, eventId))
      .orderBy(desc(scanEvents.at), desc(scanEvents.id))
      .limit(limit);
  }
}
```

```ts
// features/check-in/infrastructure/factory.ts
import type { IScanRepository } from "../domain/IScanRepository";
import { ScanRepository } from "./ScanRepository";

export function makeScanRepository(): IScanRepository {
  return new ScanRepository();
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npm test -- ScanRepository`
Expected: 6 passed.

- [ ] **Step 5: Run the full suite so far**

Run: `npm test`
Expected: every test file across `shared/` and `features/{events,guests,check-in}` passes.

- [ ] **Step 6: Commit**

```bash
git add features/check-in/infrastructure
git commit -m "Add check-in feature infrastructure: Drizzle repository and factory"
```

---

## Task 10: Auth feature — domain layer

**Files:**
- Create: `features/auth/domain/Session.ts`
- Create: `features/auth/domain/IOwnerRepository.ts`
- Create: `features/auth/domain/ISessionRepository.ts`
- Create: `features/auth/domain/use-cases/CheckSetupStatusUseCase.ts`
- Create: `features/auth/domain/use-cases/CreateOwnerUseCase.ts`
- Create: `features/auth/domain/use-cases/ChangeOwnerPasswordUseCase.ts`
- Create: `features/auth/domain/use-cases/AuthenticateOwnerUseCase.ts`
- Create: `features/auth/domain/use-cases/AuthenticateDoorUseCase.ts`
- Test: `features/auth/domain/use-cases/auth-use-cases.test.ts`

**Interfaces:**
- Consumes: `IEventRepository` from `features/events/domain` (Task 4) — a **cross-feature domain dependency through an interface**, per `04-NEXTJS-ADAPTATION.md`; `bcryptjs` (existing dependency).
- Produces: `Session` type. `IOwnerRepository`, `ISessionRepository` interfaces — Task 11's infrastructure implements both. Five use-cases — consumed by Part 2's setup/login/settings pages and by `shared/lib/guard.ts` (Task 12).

- [ ] **Step 1: Write the session type and the two repository interfaces**

```ts
// features/auth/domain/Session.ts
export type Session = { role: "owner" } | { role: "door"; eventId: number };
```

```ts
// features/auth/domain/IOwnerRepository.ts
export type Owner = { id: number; email: string; passwordHash: string };

export interface IOwnerRepository {
  get(): Promise<Owner | null>;
  create(input: { email: string; passwordHash: string }): Promise<void>;
  updatePassword(passwordHash: string): Promise<void>;
}
```

```ts
// features/auth/domain/ISessionRepository.ts
import type { Session } from "./Session";

export interface ISessionRepository {
  sign(session: Session): Promise<string>;
  verify(token: string): Promise<Session | null>;
}
```

- [ ] **Step 2: Write the failing tests for all five use-cases, against fake repositories**

```ts
// features/auth/domain/use-cases/auth-use-cases.test.ts
import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Event, EventInput } from "@/features/events/domain/Event";
import type { IEventRepository } from "@/features/events/domain/IEventRepository";
import type { IOwnerRepository, Owner } from "../IOwnerRepository";
import { AuthenticateDoorUseCase } from "./AuthenticateDoorUseCase";
import { AuthenticateOwnerUseCase } from "./AuthenticateOwnerUseCase";
import { ChangeOwnerPasswordUseCase } from "./ChangeOwnerPasswordUseCase";
import { CheckSetupStatusUseCase } from "./CheckSetupStatusUseCase";
import { CreateOwnerUseCase } from "./CreateOwnerUseCase";

class FakeOwnerRepository implements IOwnerRepository {
  row: Owner | null = null;

  async get(): Promise<Owner | null> {
    return this.row;
  }

  async create(input: { email: string; passwordHash: string }): Promise<void> {
    this.row = { id: 1, ...input };
  }

  async updatePassword(passwordHash: string): Promise<void> {
    if (!this.row) throw new Error("No owner account exists yet.");
    this.row = { ...this.row, passwordHash };
  }
}

class FakeEventRepository implements IEventRepository {
  private rows: Event[] = [];
  private nextId = 1;

  async list(): Promise<Event[]> {
    return this.rows;
  }
  async getById(id: number): Promise<Event | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async getByDoorCode(doorCode: string): Promise<Event | null> {
    return this.rows.find((r) => r.doorCode === doorCode) ?? null;
  }
  async create(input: EventInput): Promise<Event> {
    const event: Event = { id: this.nextId++, ...input, status: "live", createdAt: new Date() };
    this.rows.push(event);
    return event;
  }
  async update(): Promise<void> {}
  async archive(): Promise<void> {}
}

describe("CheckSetupStatusUseCase", () => {
  it("is false before an owner exists, true after", async () => {
    const repo = new FakeOwnerRepository();
    expect(await new CheckSetupStatusUseCase(repo).execute()).toBe(false);
    await repo.create({ email: "owner@example.com", passwordHash: "x" });
    expect(await new CheckSetupStatusUseCase(repo).execute()).toBe(true);
  });
});

describe("CreateOwnerUseCase", () => {
  it("creates an owner with a hashed password", async () => {
    const repo = new FakeOwnerRepository();
    await new CreateOwnerUseCase(repo).execute({ email: "Owner@Example.com", password: "supersecret" });

    expect(repo.row?.email).toBe("owner@example.com");
    expect(await bcrypt.compare("supersecret", repo.row!.passwordHash)).toBe(true);
  });

  it("rejects a bad email or a short password", async () => {
    const repo = new FakeOwnerRepository();
    await expect(new CreateOwnerUseCase(repo).execute({ email: "not-an-email", password: "supersecret" })).rejects.toThrow();
    await expect(new CreateOwnerUseCase(repo).execute({ email: "owner@example.com", password: "short" })).rejects.toThrow();
  });
});

describe("ChangeOwnerPasswordUseCase", () => {
  it("changes the password when the current one matches", async () => {
    const repo = new FakeOwnerRepository();
    await new CreateOwnerUseCase(repo).execute({ email: "owner@example.com", password: "originalpw" });

    await new ChangeOwnerPasswordUseCase(repo).execute("originalpw", "newpassword");
    expect(await bcrypt.compare("newpassword", repo.row!.passwordHash)).toBe(true);
  });

  it("rejects a wrong current password or a short new one", async () => {
    const repo = new FakeOwnerRepository();
    await new CreateOwnerUseCase(repo).execute({ email: "owner@example.com", password: "originalpw" });

    await expect(new ChangeOwnerPasswordUseCase(repo).execute("wrongpw", "newpassword")).rejects.toThrow();
    await expect(new ChangeOwnerPasswordUseCase(repo).execute("originalpw", "short")).rejects.toThrow();
  });
});

describe("AuthenticateOwnerUseCase", () => {
  it("returns an owner session for a matching email and password", async () => {
    const repo = new FakeOwnerRepository();
    await new CreateOwnerUseCase(repo).execute({ email: "owner@example.com", password: "correctpw" });

    expect(await new AuthenticateOwnerUseCase(repo).execute("owner@example.com", "correctpw")).toEqual({ role: "owner" });
  });

  it("returns null for a wrong email or password", async () => {
    const repo = new FakeOwnerRepository();
    await new CreateOwnerUseCase(repo).execute({ email: "owner@example.com", password: "correctpw" });

    expect(await new AuthenticateOwnerUseCase(repo).execute("owner@example.com", "wrongpw")).toBeNull();
    expect(await new AuthenticateOwnerUseCase(repo).execute("nope@example.com", "correctpw")).toBeNull();
  });
});

describe("AuthenticateDoorUseCase", () => {
  it("resolves the event a door code belongs to", async () => {
    const eventRepo = new FakeEventRepository();
    const event = await eventRepo.create({
      name: "Layla & Omar",
      eventDate: null,
      venue: null,
      description: null,
      doorCode: "PALM1",
      capacity: null,
    });

    const session = await new AuthenticateDoorUseCase(eventRepo).execute("PALM1");
    expect(session).toEqual({ role: "door", eventId: event.id });
  });

  it("returns null for an unknown door code", async () => {
    const eventRepo = new FakeEventRepository();
    expect(await new AuthenticateDoorUseCase(eventRepo).execute("NOPE")).toBeNull();
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npm test -- auth-use-cases`
Expected: FAIL — the use-case modules don't exist yet.

- [ ] **Step 4: Implement the five use-cases**

```ts
// features/auth/domain/use-cases/CheckSetupStatusUseCase.ts
import type { IOwnerRepository } from "../IOwnerRepository";

export class CheckSetupStatusUseCase {
  constructor(private readonly ownerRepository: IOwnerRepository) {}

  async execute(): Promise<boolean> {
    return (await this.ownerRepository.get()) !== null;
  }
}
```

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
      throw new Error("That email address doesn't look right.");
    }
    if (input.password.length < 8) {
      throw new Error("Use a password of at least 8 characters.");
    }

    await this.ownerRepository.create({ email, passwordHash: await bcrypt.hash(input.password, 12) });
  }
}
```

```ts
// features/auth/domain/use-cases/ChangeOwnerPasswordUseCase.ts
import bcrypt from "bcryptjs";
import type { IOwnerRepository } from "../IOwnerRepository";

export class ChangeOwnerPasswordUseCase {
  constructor(private readonly ownerRepository: IOwnerRepository) {}

  async execute(currentPassword: string, newPassword: string): Promise<void> {
    const owner = await this.ownerRepository.get();
    if (!owner) throw new Error("No owner account exists yet.");
    if (!(await bcrypt.compare(currentPassword, owner.passwordHash))) {
      throw new Error("That isn't your current password.");
    }
    if (newPassword.length < 8) {
      throw new Error("Use a new password of at least 8 characters.");
    }

    await this.ownerRepository.updatePassword(await bcrypt.hash(newPassword, 12));
  }
}
```

```ts
// features/auth/domain/use-cases/AuthenticateOwnerUseCase.ts
import bcrypt from "bcryptjs";
import type { IOwnerRepository } from "../IOwnerRepository";
import type { Session } from "../Session";

export class AuthenticateOwnerUseCase {
  constructor(private readonly ownerRepository: IOwnerRepository) {}

  async execute(email: string, password: string): Promise<Session | null> {
    const owner = await this.ownerRepository.get();
    if (!owner) return null;

    const emailMatches = email.trim().toLowerCase() === owner.email;
    const passwordMatches = await bcrypt.compare(password, owner.passwordHash);

    // One code path for both failure cases, so this can't be used to discover the email.
    if (!emailMatches || !passwordMatches) return null;
    return { role: "owner" };
  }
}
```

```ts
// features/auth/domain/use-cases/AuthenticateDoorUseCase.ts
import type { IEventRepository } from "@/features/events/domain/IEventRepository";
import type { Session } from "../Session";

/**
 * Cross-feature domain dependency, through the events feature's repository
 * interface — not its implementation. See 04-NEXTJS-ADAPTATION.md.
 */
export class AuthenticateDoorUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  async execute(doorCode: string): Promise<Session | null> {
    const event = await this.eventRepository.getByDoorCode(doorCode.trim());
    return event ? { role: "door", eventId: event.id } : null;
  }
}
```

- [ ] **Step 5: Run and confirm pass**

Run: `npm test -- auth-use-cases`
Expected: 9 passed.

- [ ] **Step 6: Commit**

```bash
git add features/auth/domain
git commit -m "Add auth feature domain layer: session type, repository interfaces, use-cases"
```

---

## Task 11: Auth feature — infrastructure layer

**Files:**
- Create: `features/auth/infrastructure/OwnerRepository.ts`
- Create: `features/auth/infrastructure/JwtSessionRepository.ts`
- Create: `features/auth/infrastructure/factory.ts`
- Test: `features/auth/infrastructure/OwnerRepository.test.ts`
- Test: `features/auth/infrastructure/JwtSessionRepository.test.ts`

**Interfaces:**
- Consumes: `IOwnerRepository`, `ISessionRepository`, `Session`, `Owner` (Task 10); `getDb()`, `owner` table, `resetDb()` (Task 2); `jose` (existing dependency).
- Produces: `OwnerRepository`, `JwtSessionRepository`, `MAX_AGE_SECONDS`. `makeOwnerRepository()`, `makeSessionRepository()` — consumed by `shared/lib/guard.ts` and `session-cookie.ts` (Task 12).

- [ ] **Step 1: Write the failing integration test for OwnerRepository**

```ts
// features/auth/infrastructure/OwnerRepository.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { OwnerRepository } from "./OwnerRepository";

describe("OwnerRepository (integration)", () => {
  beforeEach(resetDb);

  it("has no owner before setup", async () => {
    expect(await new OwnerRepository().get()).toBeNull();
  });

  it("creates, retrieves, and updates the owner's password", async () => {
    const repo = new OwnerRepository();
    await repo.create({ email: "Owner@Example.com", passwordHash: "hash1" });

    const owner = await repo.get();
    expect(owner?.email).toBe("owner@example.com");
    expect(owner?.passwordHash).toBe("hash1");

    await repo.updatePassword("hash2");
    expect((await repo.get())?.passwordHash).toBe("hash2");
  });

  it("throws updating a password with no owner set up", async () => {
    await expect(new OwnerRepository().updatePassword("hash2")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- OwnerRepository`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement OwnerRepository**

```ts
// features/auth/infrastructure/OwnerRepository.ts
import { eq } from "drizzle-orm";
import { getDb } from "@/shared/infrastructure/db/client";
import { owner as ownerTable } from "@/shared/infrastructure/db/schema";
import type { IOwnerRepository, Owner } from "../domain/IOwnerRepository";

export class OwnerRepository implements IOwnerRepository {
  async get(): Promise<Owner | null> {
    const rows = await getDb().select().from(ownerTable).limit(1);
    const row = rows[0];
    return row ? { id: row.id, email: row.email, passwordHash: row.passwordHash } : null;
  }

  async create(input: { email: string; passwordHash: string }): Promise<void> {
    await getDb()
      .insert(ownerTable)
      .values({ email: input.email.toLowerCase().trim(), passwordHash: input.passwordHash });
  }

  async updatePassword(passwordHash: string): Promise<void> {
    const current = await this.get();
    if (!current) throw new Error("No owner account exists yet.");
    await getDb().update(ownerTable).set({ passwordHash }).where(eq(ownerTable.id, current.id));
  }
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npm test -- OwnerRepository`
Expected: 3 passed.

- [ ] **Step 5: Write the failing test for JwtSessionRepository**

No database involved — this is a pure crypto round-trip, tested directly rather than through a fake.

```ts
// features/auth/infrastructure/JwtSessionRepository.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { JwtSessionRepository } from "./JwtSessionRepository";

describe("JwtSessionRepository", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-at-least-16-chars";
  });

  it("round-trips an owner session", async () => {
    const repo = new JwtSessionRepository();
    const token = await repo.sign({ role: "owner" });
    expect(await repo.verify(token)).toEqual({ role: "owner" });
  });

  it("round-trips a door session with its event id", async () => {
    const repo = new JwtSessionRepository();
    const token = await repo.sign({ role: "door", eventId: 42 });
    expect(await repo.verify(token)).toEqual({ role: "door", eventId: 42 });
  });

  it("rejects a garbage token", async () => {
    const repo = new JwtSessionRepository();
    expect(await repo.verify("not-a-real-token")).toBeNull();
  });

  it("throws when SESSION_SECRET is missing or too short", async () => {
    process.env.SESSION_SECRET = "short";
    const repo = new JwtSessionRepository();
    await expect(repo.sign({ role: "owner" })).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run and confirm failure**

Run: `npm test -- JwtSessionRepository`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement JwtSessionRepository and the feature's factory**

```ts
// features/auth/infrastructure/JwtSessionRepository.ts
import { SignJWT, jwtVerify } from "jose";
import type { ISessionRepository } from "../domain/ISessionRepository";
import type { Session } from "../domain/Session";

export const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Copy .env.example to .env and set it — " +
        'generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return new TextEncoder().encode(value);
}

export class JwtSessionRepository implements ISessionRepository {
  async sign(session: Session): Promise<string> {
    const claims: Record<string, unknown> = { role: session.role };
    if (session.role === "door") claims.eventId = session.eventId;

    return new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${MAX_AGE_SECONDS}s`)
      .sign(secret());
  }

  async verify(token: string): Promise<Session | null> {
    try {
      const { payload } = await jwtVerify(token, secret());
      if (payload.role === "owner") return { role: "owner" };
      if (payload.role === "door" && typeof payload.eventId === "number") {
        return { role: "door", eventId: payload.eventId };
      }
      return null;
    } catch {
      return null;
    }
  }
}
```

```ts
// features/auth/infrastructure/factory.ts
import type { IOwnerRepository } from "../domain/IOwnerRepository";
import type { ISessionRepository } from "../domain/ISessionRepository";
import { JwtSessionRepository } from "./JwtSessionRepository";
import { OwnerRepository } from "./OwnerRepository";

export function makeOwnerRepository(): IOwnerRepository {
  return new OwnerRepository();
}

export function makeSessionRepository(): ISessionRepository {
  return new JwtSessionRepository();
}
```

- [ ] **Step 8: Run and confirm pass**

Run: `npm test -- JwtSessionRepository`
Expected: 4 passed.

- [ ] **Step 9: Commit**

```bash
git add features/auth/infrastructure
git commit -m "Add auth feature infrastructure: owner and JWT session repositories"
```

---

## Task 12: Shared Next.js glue — session cookie and page guards

This is the one place that's allowed to import both `next/headers`/
`next/navigation` (framework-specific) and the auth feature's use-cases
(domain) — it's Next.js integration glue, not business logic, per
`04-NEXTJS-ADAPTATION.md`.

**Files:**
- Create: `shared/lib/session-cookie.ts`
- Create: `shared/lib/guard.ts`
- Test: `shared/lib/guard.test.ts`
- Delete: `lib/auth.ts`
- Delete: `lib/guard.ts`

**Interfaces:**
- Consumes: `makeSessionRepository` (Task 11), `Session` (Task 10), `CheckSetupStatusUseCase` (Task 10), `makeOwnerRepository` (Task 11).
- Produces: `getSession()`, `setSessionCookie(session)`, `clearSessionCookie()` (`shared/lib/session-cookie.ts`) — consumed by Part 2/3's auth Server Actions. `requireSetUp()`, `requireOwner()`, `requireDoor()` (`shared/lib/guard.ts`) — consumed by every protected Server Component/action in Parts 2/3.

- [ ] **Step 1: Implement the session cookie module**

No test file for this one — it's a three-function wrapper around `next/headers`, which cannot run outside a Next.js request context, so it's covered indirectly by the `guard.test.ts` mock below (same reasoning `lib/guard.ts` used previously: framework glue this thin is exercised through its caller, not in isolation).

```ts
// shared/lib/session-cookie.ts
import { cookies } from "next/headers";
import { makeSessionRepository } from "@/features/auth/infrastructure/factory";
import { MAX_AGE_SECONDS } from "@/features/auth/infrastructure/JwtSessionRepository";
import type { Session } from "@/features/auth/domain/Session";

const COOKIE_NAME = "wc_session";
const sessionRepository = makeSessionRepository();

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return sessionRepository.verify(token);
}

export async function setSessionCookie(session: Session): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, await sessionRepository.sign(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export { COOKIE_NAME };
```

- [ ] **Step 2: Write the failing tests for the page guards**

```ts
// shared/lib/guard.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { EventRepository } from "@/features/events/infrastructure/EventRepository";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { setSessionCookie } from "./session-cookie";
import { requireDoor, requireOwner, requireSetUp } from "./guard";
import { OwnerRepository } from "@/features/auth/infrastructure/OwnerRepository";

process.env.SESSION_SECRET = "test-secret-at-least-16-chars";

describe("guard", () => {
  beforeEach(async () => {
    cookieStore.clear();
    await resetDb();
  });

  it("requireSetUp redirects to /setup when there is no owner yet", async () => {
    await expect(requireSetUp()).rejects.toThrow("NEXT_REDIRECT:/setup");
  });

  it("requireOwner redirects to /login when signed out", async () => {
    await new OwnerRepository().create({ email: "owner@example.com", passwordHash: "hash" });
    await expect(requireOwner()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("requireOwner passes for an owner session", async () => {
    await new OwnerRepository().create({ email: "owner@example.com", passwordHash: "hash" });
    await setSessionCookie({ role: "owner" });
    await expect(requireOwner()).resolves.toBeUndefined();
  });

  it("requireOwner redirects a door session to /login", async () => {
    await new OwnerRepository().create({ email: "owner@example.com", passwordHash: "hash" });
    const event = await new EventRepository().create({
      name: "Test Event",
      eventDate: null,
      venue: null,
      description: null,
      doorCode: "DOOR1",
      capacity: null,
    });
    await setSessionCookie({ role: "door", eventId: event.id });
    await expect(requireOwner()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("requireDoor returns the event id for a door session", async () => {
    await new OwnerRepository().create({ email: "owner@example.com", passwordHash: "hash" });
    const event = await new EventRepository().create({
      name: "Test Event",
      eventDate: null,
      venue: null,
      description: null,
      doorCode: "DOOR1",
      capacity: null,
    });
    await setSessionCookie({ role: "door", eventId: event.id });
    await expect(requireDoor()).resolves.toBe(event.id);
  });

  it("requireDoor redirects to /door when signed out", async () => {
    await new OwnerRepository().create({ email: "owner@example.com", passwordHash: "hash" });
    await expect(requireDoor()).rejects.toThrow("NEXT_REDIRECT:/door");
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npm test -- guard.test`
Expected: FAIL — `./guard` not found.

- [ ] **Step 4: Implement the guards**

```ts
// shared/lib/guard.ts
import { redirect } from "next/navigation";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import { CheckSetupStatusUseCase } from "@/features/auth/domain/use-cases/CheckSetupStatusUseCase";
import { getSession } from "./session-cookie";

/**
 * Page-level guards. Every protected page and every mutating server action
 * calls one of these — there is no middleware doing it invisibly somewhere
 * else.
 */

export async function requireSetUp(): Promise<void> {
  const isSetUp = await new CheckSetupStatusUseCase(makeOwnerRepository()).execute();
  if (!isSetUp) redirect("/setup");
}

export async function requireOwner(): Promise<void> {
  await requireSetUp();
  const session = await getSession();
  if (!session || session.role !== "owner") redirect("/login");
}

/** Returns the event id the current door session is scoped to. */
export async function requireDoor(): Promise<number> {
  await requireSetUp();
  const session = await getSession();
  if (!session || session.role !== "door") redirect("/door");
  return session.eventId;
}
```

- [ ] **Step 5: Run and confirm pass**

Run: `npm test -- guard.test`
Expected: 6 passed.

- [ ] **Step 6: Delete the old files and commit**

```bash
git rm lib/auth.ts lib/guard.ts
git add shared/lib/session-cookie.ts shared/lib/guard.ts shared/lib/guard.test.ts
git commit -m "Add shared session-cookie and page-guard glue, remove old lib/auth.ts and lib/guard.ts"
```

---

## Task 13: Remove the old SQLite layer and update project config

**Files:**
- Delete: `lib/db.ts`
- Delete: `data/wedding.db`, `data/wedding.db-shm`, `data/wedding.db-wal` (already git-ignored — a plain filesystem delete, not `git rm`)
- Modify: `next.config.mjs`

**Interfaces:**
- Consumes: nothing (cleanup only).
- Produces: nothing — this removes the last piece of dead code from the old architecture. Confirms nothing outside the deleted file still needs it (everything under `app/` still imports it and will be rewired in Parts 2/3 — expected, per this plan's Architecture note).

- [ ] **Step 1: Confirm what still imports the old db file**

Run: `grep -rl "from \"@/lib/db\"" app --include=*.tsx --include=*.ts`
Expected: several `app/` files listed (dashboard, guests, scan, settings, setup, auth-actions, door). This is expected — they get rewired in Parts 2/3, not this plan. Do not edit them here.

- [ ] **Step 2: Delete the old data layer and sample database**

```bash
git rm lib/db.ts
rm -f data/wedding.db data/wedding.db-shm data/wedding.db-wal
```

(Discarding the sample data is the explicit decision recorded in spec §11.)

- [ ] **Step 3: Drop the SQLite native-module config**

```js
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

- [ ] **Step 4: Run the full test suite and a scoped typecheck**

Run: `npm test`
Expected: every test file under `shared/` and `features/` passes — none of them touch the deleted files.

Run: `npx tsc --noEmit -p . 2>&1 | grep -v "^app/"`
Expected: no errors outside `app/` (a full-project `npm run typecheck` still fails on `app/` until Part 3 rewires it — that's expected).

- [ ] **Step 5: Commit**

```bash
git add next.config.mjs
git commit -m "Remove old SQLite data layer and sample database"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage for this slice:** data model (§4) via Task 2's schema. Auth (§5) via Tasks 10–12. Business logic that belongs at the domain layer (guest import parsing, event duplication, owner/door authentication, derived check-in status) is built and unit-tested here even though no UI calls it yet. Everything UI-facing (dashboard, scanner, QR cards, localization, Arabic/RTL) is explicitly out of scope — Parts 2 and 3.
- **Known temporary breakage:** after Task 13, every page under `app/` still imports the deleted `lib/db.ts`/`lib/auth.ts`/`lib/guard.ts`/`lib/codes.ts` and will fail to build. This is intentional sequencing — Part 2 rewires the owner-facing pages (and relocates `components/ui.tsx` to `shared/component/ui/` when the first `ui/` layer is built) and Part 3 rewires the door/scanner pages. Do not attempt to fix `app/` pages as part of this plan.
- **Type consistency check performed:** `ScanDirection`/`ScanMethod`/`GuestSource` string-literal unions match across `shared/infrastructure/db/schema.ts`, every feature's domain entity file, and every use-case/repository/test that constructs one. `Event`/`EventInput`/`EventStatus` fields match between `features/events/domain/Event.ts` and every fake/test that builds one, including the `FakeEventRepository` duplicated (by necessity — domain code has zero dependency on infrastructure, so a fake can't be shared across feature test files) in both `features/events/domain/use-cases/events-use-cases.test.ts` and `features/auth/domain/use-cases/auth-use-cases.test.ts`.
- **Composition root pattern applied consistently:** every `infrastructure/factory.ts` exports one `make<Name>Repository(): I<Name>Repository` function; every cross-feature use-case (`AuthenticateDoorUseCase`) takes the *interface* as a constructor parameter, never a concrete class.

## Next

Once this plan is merged and passing, Part 2 (a follow-up plan under
`docs/superpowers/plans/`, written after this one lands) builds the
`ui/` and `view-model/` layers for the owner-facing screens — event list,
event settings, guest management, QR card generation, CSV/ZIP export —
composing the use-cases built here, in Arabic/RTL/mobile-first per spec
§10 and `02-CONVENTIONS.md`'s RTL guidance. Part 3 covers the door
scanner's `ui/`/`view-model/` layers, the `CheckInGuestUseCase`/
`CheckOutGuestUseCase` decision logic (admit/already/override) built
directly against this plan's `IScanRepository`/`IGuestRepository`, manual
search check-in, and walk-in quick-add.
