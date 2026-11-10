// Seeds a local dev database with one finished wedding: invited guests, a
// no-show or two, partial parties, walk-ins, overrides, manual entries and
// check-outs — enough to exercise every after-the-event screen.
//
//   DATABASE_URL=postgres://door:door@localhost:5433/door_dev node scripts/seed-dev.mjs
//
// Wipes the target database first, so it refuses anything not on localhost.
// Sign in afterwards with DEV_OWNER_EMAIL / DEV_OWNER_PASSWORD below.
import bcrypt from "bcryptjs";
import pg from "pg";

const DEV_OWNER_EMAIL = "owner@door.test";
const DEV_OWNER_PASSWORD = "door-dev-only";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL to a local database.");
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
  throw new Error(`Refusing to seed a non-local database (host "${host}").`);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query("TRUNCATE TABLE scan_events, guests, events, owner RESTART IDENTITY CASCADE");
await client.query("INSERT INTO owner (email, password_hash) VALUES ($1, $2)", [
  DEV_OWNER_EMAIL,
  await bcrypt.hash(DEV_OWNER_PASSWORD, 10),
]);

const {
  rows: [event],
} = await client.query(
  `INSERT INTO events (name, event_date, venue, door_code, capacity, status)
   VALUES ('زفاف ليلى وعمر', '2026-11-07', 'قاعة النخيل', 'DEMO1', 120, 'live') RETURNING id`,
);

// [name, seats, phone, arrivals: [minutesAfter18:00 UTC, seats, method, override]..., leftAt?]
const guests = [
  ["سارة أحمد", 4, "0501110001", [[2, 4]], 230],
  ["محمد العتيبي", 2, "0501110002", [[5, 2]], 200],
  ["نورة القحطاني", 3, "0501110003", [[8, 2]]],
  ["خالد الشهري", 5, "0501110004", [[11, 5, "manual"]], 215],
  ["ريم الدوسري", 2, "0501110005", [[14, 2]]],
  ["فهد الحربي", 1, null, [[18, 1]], 160],
  ["لمى الزهراني", 2, "0501110007", [[21, 2], [95, 1, "qr", true]]],
  ["عبدالله المطيري", 4, "0501110008", [[24, 4]], 225],
  ["هند السبيعي", 3, "0501110009", [[26, 3]]],
  ["تركي الغامدي", 2, "0501110010", [[29, 2]], 190],
  ["جواهر العنزي", 6, "0501110011", [[31, 4], [70, 2]]],
  ["سلطان القرني", 2, "0501110012", [[33, 2, "manual"]]],
  ["مها الشمري", 1, "0501110013", [[36, 1]], 120],
  ["ياسر البقمي", 3, "0501110014", [[40, 3]]],
  ["العنود المالكي", 2, "0501110015", [[44, 1]]],
  ["بندر الرشيدي", 4, "0501110016", [[48, 4]], 235],
  ["دانة الجهني", 2, "0501110017", [[55, 2]]],
  ["ماجد السلمي", 2, "0501110018", [[62, 2]]],
  ["أمل الخالدي", 3, "0501110019", [[75, 3]]],
  ["ناصر الشهراني", 2, "0501110020", [[90, 2]]],
  ["غادة العمري", 2, "0501110021", []],
  ["سعود الحارثي", 4, "0501110022", []],
  ["رهف اليامي", 1, null, []],
];

const walkIns = [
  ["أبو فيصل", 2, [[50, 2]]],
  ["سارة احمد", 1, [[65, 1, "manual"]]], // a likely duplicate of an invited guest
  ["ضيف بدون اسم", 3, [[110, 3, "manual", true]]],
];

const base = Date.UTC(2026, 10, 7, 15, 0); // 18:00 Riyadh
const at = (minutes) => new Date(base + minutes * 60_000);
// Real codes are 10 characters from this alphabet (see shared/lib/code-format.ts),
// or /i/[code] and the scanner reject them. "DEVG" + a 6-character counter.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
let code = 0;
function nextCode() {
  let n = code++;
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix = ALPHABET[n % ALPHABET.length] + suffix;
    n = Math.floor(n / ALPHABET.length);
  }
  return `DEVG${suffix}`;
}

async function addGuest(name, seats, phone, source, arrivals, leftAt) {
  const {
    rows: [guest],
  } = await client.query(
    "INSERT INTO guests (event_id, name, seats, phone, code, source) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [event.id, name, seats, phone, nextCode(), source],
  );
  let inside = 0;
  for (const [minutes, count, method = "qr", override = false] of arrivals) {
    inside += count;
    await client.query(
      "INSERT INTO scan_events (guest_id, direction, method, seats, at, scanned_by, override) VALUES ($1, 'in', $2, $3, $4, 'door', $5)",
      [guest.id, method, count, at(minutes), override],
    );
  }
  if (leftAt !== undefined && inside > 0) {
    await client.query(
      "INSERT INTO scan_events (guest_id, direction, method, seats, at, scanned_by, override) VALUES ($1, 'out', 'qr', $2, $3, 'door', false)",
      [guest.id, inside, at(leftAt)],
    );
  }
}

for (const [name, seats, phone, arrivals, leftAt] of guests) await addGuest(name, seats, phone, "invited", arrivals, leftAt);
for (const [name, seats, arrivals] of walkIns) await addGuest(name, seats, null, "walk_in", arrivals);

await client.end();
console.log(`Seeded event ${event.id} (door code DEMO1). Sign in as ${DEV_OWNER_EMAIL}.`);
