"use client";

import { useActionState } from "react";
import { doorLoginAction, type AuthState } from "@/app/auth-actions";

export default function DoorForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(doorLoginAction, {});

  return (
    <form action={action} className="space-y-3">
      <input
        name="doorCode"
        autoFocus
        autoCapitalize="none"
        autoComplete="off"
        placeholder="Door code"
        className="h-14 w-full rounded-xl border border-night-line bg-night-raised px-4 text-center text-lg text-night-ink outline-none placeholder:text-night-muted/60 focus:border-accent"
      />

      {state.error ? (
        <p className="rounded-lg bg-night-raised px-3 py-2 text-center text-sm text-night-bad" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-14 w-full rounded-xl bg-accent text-base font-semibold text-white transition-colors hover:bg-accent-ink disabled:opacity-50"
      >
        {pending ? "Opening…" : "Start scanning"}
      </button>
    </form>
  );
}
