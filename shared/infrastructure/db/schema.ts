import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
  locationLink: text("location_link"),
  description: text("description"),
  doorCode: text("door_code").notNull().unique(),
  capacity: integer("capacity"),
  status: eventStatusEnum("status").notNull().default("live"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Unguessable token behind the read-only report link (/r/<token>); null = not shared. Revoking nulls it. */
  reportShareToken: text("report_share_token").unique(),
  reportSharedAt: timestamp("report_shared_at", { withTimezone: true }),
  /** Whether the shared report names guests. Off unless the owner opts in. */
  reportShareShowNames: boolean("report_share_show_names").notNull().default(false),
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
    /** Client-generated idempotency key for a scan queued while offline —
     * see docs/superpowers/specs/2026-09-26-offline-first-scan-and-ux-polish.md §6.7.
     * Null for a scan recorded through the ordinary live/online path. */
    clientScanId: text("client_scan_id").unique(),
  },
  (table) => [
    index("idx_scan_events_guest").on(table.guestId),
    index("idx_scan_events_at").on(table.at),
  ],
);

/** One post-event answer per guest (rating + optional comment); a guest revising
 * their answer updates the same row. */
export const guestFeedback = pgTable(
  "guest_feedback",
  {
    id: serial("id").primaryKey(),
    guestId: integer("guest_id")
      .notNull()
      .unique()
      .references(() => guests.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("guest_feedback_rating_range", sql`${table.rating} between 1 and 5`)],
);
