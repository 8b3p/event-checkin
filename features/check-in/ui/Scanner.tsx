// features/check-in/ui/Scanner.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CommitResult, ResolveResult } from "@/app/api/checkin/route";
import type { Event } from "@/features/events/domain/Event";
import type { EventStats, GuestWithStatus, ScanMethod } from "@/features/check-in/domain/ScanEvent";
import { logoutAction } from "@/shared/lib/logout-action";
import { signalBad, signalGood, signalStop } from "./feedback";
import GuestSearchPanel from "./GuestSearchPanel";

const SCANNER_ID = "wc-reader";
const REPEAT_WINDOW_MS = 4000;

type Resolved = Extract<ResolveResult, { status: "resolved" }>;
type Blocked = Extract<CommitResult, { status: "blocked" }>;
type Overlay =
  | { kind: "unknown" }
  | { kind: "pending"; resolved: Resolved; method: ScanMethod }
  | { kind: "blocked"; resolved: Resolved; method: ScanMethod; blocked: Blocked }
  | { kind: "recorded"; guestName: string; direction: Resolved["direction"]; seats: number };

type Recent = { name: string; direction: Resolved["direction"]; seats: number; at: number };

export default function Scanner({
  event,
  initialStats,
  initialGuests,
}: {
  event: Event;
  initialStats: EventStats;
  initialGuests: GuestWithStatus[];
}) {
  const [view, setView] = useState<"camera" | "guests">("camera");
  const [stats, setStats] = useState(initialStats);
  const [guests, setGuests] = useState(initialGuests);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);

  // Kept in a ref so the html5-qrcode frame callback always sees the current value
  // without having to restart the scanner every time an overlay opens or closes.
  const pausedRef = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  const applyGuestInsideSeats = useCallback((guestId: number, insideSeats: number) => {
    setGuests((rows) => rows.map((g) => (g.id === guestId ? { ...g, insideSeats } : g)));
  }, []);

  const dismiss = useCallback(() => {
    setOverlay(null);
    pausedRef.current = false;
  }, []);

  const resolveByCode = useCallback(async (code: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (response.status === 401) {
        window.location.href = "/door";
        return;
      }
      const data = (await response.json()) as ResolveResult;
      pausedRef.current = true;

      if (data.status !== "resolved") {
        setOverlay({ kind: "unknown" });
        signalBad();
        return;
      }
      setOverlay({ kind: "pending", resolved: data, method: "qr" });
    } catch {
      setCameraError("تعذّر الاتصال. تحقّق من الشبكة وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }, []);

  /** Used by GuestSearchPanel: the guest is already known, just resolve their current status. */
  const resolveGuest = useCallback(async (guestId: number) => {
    setBusy(true);
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId }),
      });
      if (response.status === 401) {
        window.location.href = "/door";
        return;
      }
      const data = (await response.json()) as ResolveResult;
      if (data.status === "resolved") setOverlay({ kind: "pending", resolved: data, method: "manual" });
    } catch {
      setCameraError("تعذّر الاتصال. تحقّق من الشبكة وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }, []);

  const commit = useCallback(
    async (resolved: Resolved, method: ScanMethod, seats: number, override: boolean) => {
      setBusy(true);
      try {
        const response = await fetch("/api/checkin", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestId: resolved.guest.id, direction: resolved.direction, seats, override, method }),
        });
        if (response.status === 401) {
          window.location.href = "/door";
          return;
        }
        const data = (await response.json()) as CommitResult;

        if (data.status === "blocked") {
          setOverlay({ kind: "blocked", resolved, method, blocked: data });
          signalStop();
          return;
        }
        if (data.status !== "recorded") {
          setOverlay({ kind: "unknown" });
          signalBad();
          return;
        }

        applyGuestInsideSeats(resolved.guest.id, data.insideSeats);
        setStats(data.stats);
        setOverlay({ kind: "recorded", guestName: resolved.guest.name, direction: resolved.direction, seats });
        setRecent((rows) => [{ name: resolved.guest.name, direction: resolved.direction, seats, at: Date.now() }, ...rows].slice(0, 8));
        signalGood();
      } catch {
        setCameraError("تعذّر الاتصال. تحقّق من الشبكة وحاول مرة أخرى.");
      } finally {
        setBusy(false);
      }
    },
    [applyGuestInsideSeats],
  );

  /* A recorded result clears itself so a queue keeps moving; unknown/blocked stay until tapped. */
  useEffect(() => {
    if (overlay?.kind !== "recorded") return;
    const timer = setTimeout(dismiss, 2200);
    return () => clearTimeout(timer);
  }, [overlay, dismiss]);

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
            void resolveByCode(decoded);
          },
          () => {
            // Fires every frame without a code found. Nothing to do.
          },
        );

        if (cancelled) {
          // Unmounted while start() was still pending (e.g. a slow camera-permission
          // prompt) — the cleanup below already ran and had nothing to stop yet, so
          // stop this now-live scanner ourselves instead of leaving the camera running.
          await scanner
            .stop()
            .then(() => scanner?.clear())
            .catch(() => undefined);
          return;
        }
      } catch {
        if (!cancelled) setCameraError("تعذّر الوصول إلى الكاميرا. اسمح بالوصول إليها من إعدادات المتصفح.");
      }
    })();

    return () => {
      cancelled = true;
      void scanner
        ?.stop()
        .then(() => scanner?.clear())
        .catch(() => undefined);
    };
  }, [resolveByCode]);

  return (
    <div className="flex min-h-dvh flex-col bg-night text-night-ink" dir="rtl">
      <header className="flex items-center gap-4 border-b border-night-line px-5 py-3">
        <div className="min-w-0">
          <p className="display truncate text-lg">{event.name}</p>
          <p className="text-xs text-night-muted">بوابة الدخول</p>
        </div>
        <div className="me-auto text-left">
          <p className="text-lg font-semibold tabular">
            {stats.seatsInside}
            <span className="text-night-muted">/{stats.seatsInvited}</span>
          </p>
          <p className="text-xs text-night-muted">بالداخل الآن</p>
        </div>
      </header>

      <div className="flex gap-2 border-b border-night-line px-5 py-2">
        <button
          onClick={() => setView("camera")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${view === "camera" ? "bg-night-raised text-night-ink" : "text-night-muted"}`}
        >
          الكاميرا
        </button>
        <button
          onClick={() => setView("guests")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${view === "guests" ? "bg-night-raised text-night-ink" : "text-night-muted"}`}
        >
          قائمة الضيوف
        </button>
      </div>

      <div className="relative min-h-[320px] flex-1">
        {/* html5-qrcode sets position:relative on its own container inline, so the
            fill has to come from this wrapper — without it the camera letterboxes.
            This container must stay mounted for the whole session: Html5Qrcode binds
            to #wc-reader once at construction, so unmounting it on a view switch would
            strand the running camera instance with no DOM node left to render into.
            Toggle visibility instead of presence. */}
        <div className={`absolute inset-0 overflow-hidden ${view === "camera" ? "" : "hidden"}`}>
          <div id={SCANNER_ID} className="h-full w-full" />
        </div>

        {view === "camera" && overlay ? (
          <ResultOverlay overlay={overlay} busy={busy} onDismiss={dismiss} onCommit={commit} onSearch={() => setView("guests")} />
        ) : null}

        {view === "guests" ? (
          <div className="absolute inset-0 overflow-y-auto bg-canvas p-4 text-ink">
            <GuestSearchPanel guests={guests} onResolve={resolveGuest} onGuestAdded={(guest) => setGuests((rows) => [guest, ...rows])} />
          </div>
        ) : null}

        {/* Not gated on `view`: a resolveGuest/commit network failure happens while staff
            are looking at the guest panel, not the camera, so this must be visible on
            either tab. Rendered last so it stacks above the guest panel's opaque
            bg-canvas layer instead of being hidden behind it. */}
        {cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
            <p className="text-sm text-night-muted">{cameraError}</p>
          </div>
        ) : null}
      </div>

      {overlay ? null : (
        <div className="border-t border-night-line px-5 py-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!manual.trim()) return;
              void resolveByCode(manual.trim());
              setManual("");
            }}
            className="flex gap-2"
          >
            <input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder="اكتب الرمز بدلاً من المسح"
              autoCapitalize="characters"
              autoComplete="off"
              dir="ltr"
              className="h-12 flex-1 rounded-xl border border-night-line bg-night-raised px-4 text-center text-sm tracking-[0.15em] uppercase outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-night-muted/60 focus:border-night-good"
            />
            <button
              type="submit"
              disabled={busy}
              className="h-12 rounded-xl bg-night-good px-5 text-sm font-semibold text-night disabled:opacity-50"
            >
              تحقّق
            </button>
          </form>

          {recent.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {recent.slice(0, 3).map((row) => (
                <li key={row.at} className="flex items-center gap-2 text-xs text-night-muted">
                  <span className="text-night-good">{row.direction === "in" ? "↓" : "↑"}</span>
                  <span className="truncate text-night-ink">{row.name}</span>
                  <span className="tabular">{row.seats}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <form action={logoutAction}>
            <button type="submit" className="mt-3 text-xs text-night-muted hover:text-night-ink">
              إنهاء المناوبة
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function ResultOverlay({
  overlay,
  busy,
  onDismiss,
  onCommit,
  onSearch,
}: {
  overlay: Overlay;
  busy: boolean;
  onDismiss: () => void;
  onCommit: (resolved: Resolved, method: ScanMethod, seats: number, override: boolean) => void;
  onSearch: () => void;
}) {
  if (overlay.kind === "unknown") {
    return (
      <Overlay tone="bad" onDismiss={onDismiss}>
        <p className="display text-4xl">غير موجود في القائمة</p>
        <p className="mt-3 max-w-xs text-white/80">هذا الرمز ليس دعوة صالحة.</p>
        <button onClick={onSearch} className="mt-6 text-sm text-white underline underline-offset-4">
          ابحث بالاسم بدلاً من ذلك
        </button>
        <DismissButton onDismiss={onDismiss}>الضيف التالي</DismissButton>
      </Overlay>
    );
  }

  if (overlay.kind === "blocked") {
    const label = overlay.blocked.reason === "already_full" ? "الدخول مسجَّل بالكامل" : "لم يسجَّل دخول أحد من هذه الدعوة";
    return (
      <Overlay tone="warn" onDismiss={onDismiss}>
        <p className="display text-4xl">{overlay.resolved.guest.name}</p>
        <p className="mt-3 max-w-xs text-white/85">{label}</p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
          <button
            onClick={() => onCommit(overlay.resolved, overlay.method, overlay.resolved.defaultSeats || 1, true)}
            disabled={busy}
            className="h-14 rounded-xl bg-white/95 text-base font-semibold text-ink disabled:opacity-50"
          >
            تجاوز والتسجيل على أي حال
          </button>
          <button onClick={onDismiss} className="h-14 rounded-xl border border-white/30 text-base font-semibold">
            تراجع
          </button>
        </div>
      </Overlay>
    );
  }

  if (overlay.kind === "recorded") {
    return (
      <Overlay tone="good" onDismiss={onDismiss}>
        <p className="display text-5xl">{overlay.guestName}</p>
        <p className="mt-3 text-2xl font-semibold">
          {overlay.direction === "in" ? `تم تسجيل دخول ${overlay.seats}` : `تم تسجيل خروج ${overlay.seats}`}
        </p>
      </Overlay>
    );
  }

  // kind === "pending"
  const { resolved } = overlay;
  const smallerCounts = Array.from({ length: Math.max(resolved.defaultSeats - 1, 0) }, (_, i) => i + 1);

  return (
    <Overlay tone="good" onDismiss={onDismiss}>
      <p className="display text-5xl">{resolved.guest.name}</p>
      <p className="mt-1 text-white/80">
        {resolved.direction === "in" ? "بالخارج الآن" : "بالداخل الآن"} — {resolved.insideSeats}/{resolved.guest.seats}
      </p>
      {resolved.guest.note ? <p className="mt-1 text-white/70">{resolved.guest.note}</p> : null}

      <button
        onClick={() => onCommit(resolved, overlay.method, resolved.defaultSeats, false)}
        disabled={busy}
        className="mt-8 h-14 w-full max-w-xs rounded-xl bg-white/95 text-lg font-semibold text-ink disabled:opacity-50"
      >
        {resolved.direction === "in" ? `تسجيل دخول ${resolved.defaultSeats}` : `تسجيل خروج ${resolved.defaultSeats}`}
      </button>

      {smallerCounts.length > 0 ? (
        <div className="mt-6 w-full max-w-xs">
          <p className="mb-2 text-sm text-white/80">عدد أقل؟</p>
          <div className="flex flex-wrap justify-center gap-2">
            {smallerCounts.map((seats) => (
              <button
                key={seats}
                onClick={() => onCommit(resolved, overlay.method, seats, false)}
                disabled={busy}
                className="h-12 w-12 rounded-xl border border-white/30 text-lg font-semibold tabular disabled:opacity-50"
              >
                {seats}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <DismissButton onDismiss={onDismiss}>تراجع</DismissButton>
    </Overlay>
  );
}

const TONES = { good: "bg-good", warn: "bg-warn", bad: "bg-bad" } as const;

function Overlay({ tone, onDismiss, children }: { tone: keyof typeof TONES; onDismiss: () => void; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={`flash-in absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-6 py-8 text-center text-white ${TONES[tone]}`}
    >
      {children}
      <button onClick={onDismiss} className="sr-only">
        إغلاق
      </button>
    </div>
  );
}

function DismissButton({ onDismiss, children }: { onDismiss: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onDismiss} className="mt-6 text-sm text-white/70 underline underline-offset-4">
      {children}
    </button>
  );
}
