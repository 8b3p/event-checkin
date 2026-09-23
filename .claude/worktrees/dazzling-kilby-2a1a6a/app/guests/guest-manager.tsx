"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { addGuestAction, importGuestsAction, type GuestState } from "./actions";
import { Badge, Button, Card, CardHeader, Empty, ErrorNote, Field, Input, Textarea } from "@/components/ui";
import type { GuestWithArrival } from "@/lib/db";

type Filter = "all" | "arrived" | "waiting";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "arrived", label: "Arrived" },
  { key: "waiting", label: "Not here yet" },
];

export default function GuestManager({ guests }: { guests: GuestWithArrival[] }) {
  const [panel, setPanel] = useState<"none" | "one" | "many">("none");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return guests.filter((guest) => {
      if (filter === "arrived" && guest.arrived === 0) return false;
      if (filter === "waiting" && guest.arrived > 0) return false;
      if (!needle) return true;

      return (
        guest.name.toLowerCase().includes(needle) ||
        (guest.note ?? "").toLowerCase().includes(needle) ||
        guest.code.toLowerCase().includes(needle)
      );
    });
  }, [guests, query, filter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button tone={panel === "one" ? "primary" : "default"} onClick={() => setPanel(panel === "one" ? "none" : "one")}>
          Add an invitation
        </Button>
        <Button tone={panel === "many" ? "primary" : "default"} onClick={() => setPanel(panel === "many" ? "none" : "many")}>
          Paste a list
        </Button>
      </div>

      {panel === "one" ? <AddOne onDone={() => setPanel("none")} /> : null}
      {panel === "many" ? <AddMany onDone={() => setPanel("none")} /> : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, note or code"
            className="max-w-xs"
          />
          <div className="flex rounded-lg border border-line p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option.key}
                onClick={() => setFilter(option.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === option.key ? "bg-raised text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="ml-auto text-sm text-muted tabular">
            {visible.length} of {guests.length}
          </p>
        </div>

        {guests.length === 0 ? (
          <Empty
            title="No invitations yet"
            body="Add one at a time, or paste your whole list in one go — one name per line."
          />
        ) : visible.length === 0 ? (
          <Empty title="Nothing matches" body="Try a different search, or switch the filter back to everyone." />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((guest) => (
              <li key={guest.id}>
                <Link
                  href={`/guests/${guest.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-raised"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{guest.name}</p>
                    <p className="truncate text-xs text-muted">
                      {guest.seats === 1 ? "1 seat" : `${guest.seats} seats`}
                      {guest.note ? ` · ${guest.note}` : ""}
                    </p>
                  </div>

                  {guest.arrived === 0 ? (
                    <Badge tone="neutral">Not here yet</Badge>
                  ) : guest.arrived >= guest.seats ? (
                    <Badge tone="good">All {guest.arrived} arrived</Badge>
                  ) : (
                    <Badge tone="warn">
                      {guest.arrived} of {guest.seats} arrived
                    </Badge>
                  )}

                  <span aria-hidden className="text-muted">
                    ›
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

function AddOne({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState<GuestState, FormData>(addGuestAction, {});

  return (
    <Card>
      <CardHeader title="Add an invitation" hint="One invitation per household — seats covers everyone on it." />
      <form action={action} className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="Name">
            <Input name="name" placeholder="The Daleen family" required autoFocus />
          </Field>
          <Field label="Seats">
            <Input name="seats" type="number" min={1} max={50} defaultValue={1} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" hint="Optional — handy for sending the invitation.">
            <Input name="phone" placeholder="+971 ..." />
          </Field>
          <Field label="Note" hint="Optional — e.g. “bride's side”, “table 4”.">
            <Input name="note" placeholder="Bride's side" />
          </Field>
        </div>

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
        {state.ok ? <p className="text-sm text-good">{state.ok}</p> : null}

        <div className="flex gap-2">
          <Button tone="primary" type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add invitation"}
          </Button>
          <Button type="button" tone="ghost" onClick={onDone}>
            Done
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AddMany({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState<GuestState, FormData>(importGuestsAction, {});

  return (
    <Card>
      <CardHeader
        title="Paste a list"
        hint="One invitation per line. Add seats and a note after commas if you have them."
      />
      <form action={action} className="space-y-4 p-5">
        <Field label="Your list">
          <Textarea
            name="bulk"
            rows={8}
            autoFocus
            className="font-mono text-xs"
            placeholder={"The Daleen family, 4, groom's side\nSara Hassan, 2\nJohn Smith"}
          />
        </Field>

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
        {state.ok ? <p className="text-sm text-good">{state.ok}</p> : null}

        <div className="flex gap-2">
          <Button tone="primary" type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add them all"}
          </Button>
          <Button type="button" tone="ghost" onClick={onDone}>
            Done
          </Button>
        </div>
      </form>
    </Card>
  );
}
