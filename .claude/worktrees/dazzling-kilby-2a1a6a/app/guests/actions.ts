"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateCode, generateCodes } from "@/lib/codes";
import { createGuest, createGuests, deleteGuest, undoLastCheckin, updateGuest } from "@/lib/db";
import { requireOwner } from "@/lib/guard";

export type GuestState = { error?: string; ok?: string };

const MAX_SEATS = 50;

function parseSeats(raw: unknown): number {
  const seats = Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(seats) || seats < 1) return 1;
  return Math.min(seats, MAX_SEATS);
}

export async function addGuestAction(_prev: GuestState, formData: FormData): Promise<GuestState> {
  await requireOwner();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the invitation a name." };

  createGuest({
    name,
    seats: parseSeats(formData.get("seats")),
    phone: String(formData.get("phone") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    code: generateCode(),
  });

  revalidatePath("/guests");
  revalidatePath("/");
  return { ok: `Added ${name}.` };
}

/**
 * Accepts one invitation per line, as `name, seats, note`. Seats and note are
 * optional, and tabs work too so a column pasted from a spreadsheet lands
 * correctly.
 */
export async function importGuestsAction(_prev: GuestState, formData: FormData): Promise<GuestState> {
  await requireOwner();

  const raw = String(formData.get("bulk") ?? "");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { error: "Paste at least one name." };
  if (lines.length > 2000) return { error: "That's more than 2000 lines — split it into a few pastes." };

  const parsed = lines.map((line) => {
    const [name, seats, note] = line.split(/\t|,/).map((part) => part.trim());
    return { name, seats, note };
  });

  const bad = parsed.find((row) => !row.name);
  if (bad) return { error: "One of those lines has no name on it." };

  const codes = generateCodes(parsed.length);
  const created = createGuests(
    parsed.map((row, index) => ({
      name: row.name,
      seats: parseSeats(row.seats),
      phone: null,
      note: row.note || null,
      code: codes[index],
    })),
  );

  revalidatePath("/guests");
  revalidatePath("/");
  return { ok: `Added ${created} ${created === 1 ? "invitation" : "invitations"}.` };
}

export async function updateGuestAction(_prev: GuestState, formData: FormData): Promise<GuestState> {
  await requireOwner();

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!Number.isInteger(id)) return { error: "That invitation no longer exists." };
  if (!name) return { error: "Give the invitation a name." };

  updateGuest(id, {
    name,
    seats: parseSeats(formData.get("seats")),
    phone: String(formData.get("phone") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
  });

  revalidatePath("/guests");
  revalidatePath(`/guests/${id}`);
  revalidatePath("/");
  return { ok: "Saved." };
}

export async function deleteGuestAction(formData: FormData): Promise<void> {
  await requireOwner();

  const id = Number(formData.get("id"));
  if (Number.isInteger(id)) deleteGuest(id);

  revalidatePath("/guests");
  revalidatePath("/");
  redirect("/guests");
}

export async function undoCheckinAction(formData: FormData): Promise<void> {
  await requireOwner();

  const id = Number(formData.get("id"));
  if (Number.isInteger(id)) undoLastCheckin(id);

  revalidatePath(`/guests/${id}`);
  revalidatePath("/guests");
  revalidatePath("/");
}
