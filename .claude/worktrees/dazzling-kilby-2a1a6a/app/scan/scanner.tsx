"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScanResult } from "@/app/api/checkin/route";
import type { Stats } from "@/lib/db";
import { signalBad, signalGood, signalStop } from "./feedback";

const SCANNER_ID = "wc-reader";
const REPEAT_WINDOW_MS = 4000;

type Recent = { name: string; admitted: number; at: number };

export default function Scanner({
  coupleNames,
  initialStats,
}: {
  coupleNames: string;
  initialStats: Stats;
}) {
  const [stats, setStats] = useState(initialStats);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  // Kept in refs so the html5-qrcode callback always sees current values.
  const pausedRef = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  const submit = useCallback(async (code: string, override = false) => {
    setBusy(true);
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, override }),
      });

      if (response.status === 401) {
        window.location.href = "/door";
        return;
      }

      const data = (await response.json()) as ScanResult;

      setResult(data);
      setLastCode(code);
      setStats(data.stats);
      pausedRef.current = true;

      if (data.status === "admitted") {
        signalGood();
        setRecent((rows) =>
          [{ name: data.guest.name, admitted: data.admitted, at: Date.now() }, ...rows].slice(0, 8),
        );
      } else if (data.status === "already") {
        signalStop();
      } else {
        signalBad();
      }
    } catch {
      setResult(null);
      setCameraError("Lost the connection. Check the wifi and try that scan again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    setResult(null);
    setLastCode(null);
    pausedRef.current = false;
  }, []);

  /* Success clears itself so a queue keeps moving; a stop stays until tapped. */
  useEffect(() => {
    if (result?.status !== "admitted") return;
    const timer = setTimeout(dismiss, 2600);
    return () => clearTimeout(timer);
  }, [result, dismiss]);

  useEffect(() => {
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (pausedRef.current) return;

            const previous = lastScanRef.current;
            const now = Date.now();
            if (previous && previous.code === decoded && now - previous.at < REPEAT_WINDOW_MS) return;

            lastScanRef.current = { code: decoded, at: now };
            void submit(decoded);
          },
          () => {
            // Fires constantly for every frame without a code. Nothing to do.
          },
        );
      } catch {
        if (!cancelled) {
          setCameraError(
            "Can't reach the camera. Allow camera access for this site, and make sure the page is on https.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      void scanner
        ?.stop()
        .then(() => scanner?.clear())
        .catch(() => undefined);
    };
  }, [submit]);

  const seatsLeft = Math.max(stats.seatsInvited - stats.seatsArrived, 0);

  return (
    <div className="flex min-h-dvh flex-col bg-night text-night-ink">
      <header className="flex items-center gap-4 border-b border-night-line px-5 py-3">
        <div className="min-w-0">
          <p className="display truncate text-lg">{coupleNames}</p>
          <p className="text-xs text-night-muted">Door scanner</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-lg font-semibold tabular">
            {stats.seatsArrived}
            <span className="text-night-muted">/{stats.seatsInvited}</span>
          </p>
          <p className="text-xs text-night-muted tabular">{seatsLeft} still to come</p>
        </div>
      </header>

      <div className="relative min-h-[320px] flex-1">
        {/* html5-qrcode sets position:relative on its own container inline, so the
            fill has to come from this wrapper. Without it the camera letterboxes. */}
        <div className="absolute inset-0 overflow-hidden">
          <div id={SCANNER_ID} className="h-full w-full" />
        </div>

        {cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
            <p className="text-sm text-night-muted">{cameraError}</p>
          </div>
        ) : null}

        {result ? (
          <ResultOverlay
            result={result}
            busy={busy}
            onDismiss={dismiss}
            onOverride={() => lastCode && submit(lastCode, true)}
            onCorrect={async (seats) => {
              if (result.status !== "admitted") return;
              await fetch("/api/checkin", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ checkinId: result.checkinId, seats }),
              })
                .then((response) => response.json())
                .then((data) => data?.stats && setStats(data.stats))
                .catch(() => undefined);
              dismiss();
            }}
          />
        ) : null}
      </div>

      <div className="border-t border-night-line px-5 py-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!manual.trim()) return;
            void submit(manual.trim());
            setManual("");
          }}
          className="flex gap-2"
        >
          <input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="Type a code instead"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-12 flex-1 rounded-xl border border-night-line bg-night-raised px-4 text-sm tracking-[0.15em] uppercase outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-night-muted/60 focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-12 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Check
          </button>
        </form>

        {recent.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {recent.slice(0, 3).map((row) => (
              <li key={row.at} className="flex items-center gap-2 text-xs text-night-muted">
                <span className="text-night-good">✓</span>
                <span className="truncate text-night-ink">{row.name}</span>
                <span className="tabular">+{row.admitted}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <Link href="/" className="mt-3 inline-block text-xs text-night-muted hover:text-night-ink">
          Leave the scanner
        </Link>
      </div>
    </div>
  );
}

function ResultOverlay({
  result,
  busy,
  onDismiss,
  onOverride,
  onCorrect,
}: {
  result: ScanResult;
  busy: boolean;
  onDismiss: () => void;
  onOverride: () => void;
  onCorrect: (seats: number) => void;
}) {
  if (result.status === "unknown") {
    return (
      <Overlay tone="bad" onDismiss={onDismiss}>
        <p className="display text-4xl">Not on the list</p>
        <p className="mt-3 max-w-xs text-white/80">
          This code isn&rsquo;t a valid invitation. Check with the couple before letting them in.
        </p>
        <DismissButton onDismiss={onDismiss}>Next guest</DismissButton>
      </Overlay>
    );
  }

  if (result.status === "already") {
    const at = new Date(result.firstArrival).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <Overlay tone="warn" onDismiss={onDismiss}>
        <p className="display text-4xl">{result.guest.name}</p>
        <p className="mt-3 max-w-xs text-white/85">
          Already came in at {at} — {result.arrived} of {result.guest.seats}{" "}
          {result.guest.seats === 1 ? "seat" : "seats"} used.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
          <button
            onClick={onOverride}
            disabled={busy}
            className="h-14 rounded-xl bg-white/95 text-base font-semibold text-ink disabled:opacity-50"
          >
            Let one more in
          </button>
          <button onClick={onDismiss} className="h-14 rounded-xl border border-white/30 text-base font-semibold">
            Don&rsquo;t let them in
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay tone="good" onDismiss={onDismiss}>
      <p className="display text-5xl">{result.guest.name}</p>
      <p className="mt-3 text-2xl font-semibold">
        {result.override ? "One more, let in" : `Let in ${result.admitted}`}
      </p>
      {result.guest.note ? <p className="mt-1 text-white/80">{result.guest.note}</p> : null}

      {!result.override && result.guest.seats > 1 ? (
        <div className="mt-8 w-full max-w-xs">
          <p className="mb-2 text-sm text-white/80">Fewer than {result.guest.seats} turned up?</p>
          <div className="flex flex-wrap justify-center gap-2">
            {Array.from({ length: result.guest.seats - 1 }, (_, index) => index + 1).map((seats) => (
              <button
                key={seats}
                onClick={() => onCorrect(seats)}
                className="h-12 w-12 rounded-xl border border-white/30 text-lg font-semibold tabular"
              >
                {seats}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <DismissButton onDismiss={onDismiss}>Next guest</DismissButton>
    </Overlay>
  );
}

const TONES = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
} as const;

function Overlay({
  tone,
  onDismiss,
  children,
}: {
  tone: keyof typeof TONES;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      onClick={onDismiss}
      className={`flash-in absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white ${TONES[tone]}`}
    >
      {children}
    </div>
  );
}

function DismissButton({
  onDismiss,
  children,
}: {
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onDismiss} className="mt-8 text-sm text-white/70 underline underline-offset-4">
      {children}
    </button>
  );
}
