// features/check-in/ui/Scanner.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Event } from "@/features/events/domain/Event";
import type { GuestWithStatus, ScanDirection, ScanMethod } from "@/features/check-in/domain/ScanEvent";
import type { LocalCommitResult, LocalResolveResult } from "@/features/check-in/domain/offlineQueue";
import { useOfflineSync } from "@/features/check-in/view-model/useOfflineSync";
import { normaliseScan } from "@/shared/lib/code-format";
import { logoutAction } from "@/shared/lib/logout-action";
import { signalBad, signalGood, signalStop } from "./feedback";
import GuestSearchPanel from "./GuestSearchPanel";

const SCANNER_ID = "wc-reader";
const REPEAT_WINDOW_MS = 4000;

type Resolved = Extract<LocalResolveResult, { status: "resolved" }>;
type Blocked = Extract<LocalCommitResult, { status: "blocked" }>;
type Overlay =
  | { kind: "unknown" }
  | { kind: "pending"; resolved: Resolved; method: ScanMethod }
  /* Remembers the exact direction + seat count that was refused, so the override
     re-submits what staff actually tapped (a partial party can be offered both). */
  | { kind: "blocked"; resolved: Resolved; method: ScanMethod; direction: ScanDirection; seats: number; blocked: Blocked };

type View = "camera" | "guests";
type Recent = { name: string; direction: ScanDirection; seats: number; at: number };
/** A committed scan's non-blocking success indicator — see spec §7.2. Not
 * a blocking `Overlay`: the camera is live again the instant this shows. */
type Toast = { id: string; guestName: string; direction: ScanDirection; seats: number; leaving?: boolean };
const TOAST_LIFETIME_MS = 1400;
const MAX_TOASTS = 2;

export default function Scanner({
  event,
  initialGuests,
}: {
  event: Event;
  initialGuests: GuestWithStatus[];
}) {
  const offline = useOfflineSync(event.id, initialGuests);
  const { guests, stats } = offline;

  const [view, setView] = useState<View>("camera");
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [recent, setRecent] = useState<Recent[]>([]);

  // Kept in a ref so the html5-qrcode frame callback always sees the current value
  // without having to restart the scanner every time an overlay opens or closes.
  // pausedRef is true from the moment a resolve starts until the overlay is
  // dismissed, so a second decode can't race an in-flight resolve.
  const pausedRef = useRef(false);
  // The camera stays mounted (just hidden) on the guests tab, so the frame
  // callback needs to know which tab is showing to ignore decodes there.
  const viewRef = useRef<View>("camera");
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  // The camera-setup effect below must only ever run once per mount — it
  // must not restart the camera just because `resolveByCode`'s identity
  // changes (which happens whenever `guests` updates, i.e. after every
  // scan). Route the frame callback through a ref that's always kept
  // current instead of depending on the callback directly.
  const resolveByCodeRef = useRef<(code: string) => void>(() => {});

  const showView = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const dismiss = useCallback(() => {
    setOverlay(null);
    pausedRef.current = false;
  }, []);

  /* Non-blocking success indicator: auto-clears on its own after
   * TOAST_LIFETIME_MS, capped at MAX_TOASTS stacked at once so a burst of
   * fast consecutive scans never piles up indefinitely. */
  const pushToast = useCallback((toast: Toast) => {
    setToasts((rows) => [...rows.slice(-(MAX_TOASTS - 1)), toast]);
    setTimeout(() => {
      setToasts((rows) => rows.map((row) => (row.id === toast.id ? { ...row, leaving: true } : row)));
    }, TOAST_LIFETIME_MS - 200);
    setTimeout(() => {
      setToasts((rows) => rows.filter((row) => row.id !== toast.id));
    }, TOAST_LIFETIME_MS);
  }, []);

  /* Resolve is now a synchronous local lookup — no network wait on the
   * scanning critical path. See spec §6.4. */
  const resolveByCode = useCallback(
    (code: string) => {
      const result = offline.resolveByCode(code);
      if (result.status !== "resolved") {
        setOverlay({ kind: "unknown" });
        signalBad();
        return;
      }
      setOverlay({ kind: "pending", resolved: result, method: "qr" });
    },
    [offline],
  );

  useEffect(() => {
    resolveByCodeRef.current = resolveByCode;
  }, [resolveByCode]);

  /** Used by GuestSearchPanel: the guest is already known, just resolve their current status. */
  const resolveGuest = useCallback(
    (guestId: number) => {
      const result = offline.resolveGuest(guestId);
      if (result.status === "resolved") {
        setOverlay({ kind: "pending", resolved: result, method: "manual" });
      }
    },
    [offline],
  );

  /* Commit runs the seats-aware guard locally and queues the scan for
   * background sync — no network wait here either. See spec §6.5. A
   * successful commit returns to the camera immediately (spec §7.2): no
   * blocking overlay, just a non-blocking toast, so staff can move on to
   * the next guest right away instead of waiting out a fixed timer. */
  const commit = useCallback(
    (resolved: Resolved, method: ScanMethod, direction: ScanDirection, seats: number, override: boolean) => {
      const result = offline.commit(resolved.guest, direction, method, seats, override);

      if (result.status === "blocked") {
        setOverlay({ kind: "blocked", resolved, method, direction, seats, blocked: result });
        signalStop();
        return;
      }

      dismiss();
      pushToast({ id: `${resolved.guest.id}-${Date.now()}`, guestName: resolved.guest.name, direction, seats });
      setRecent((rows) => [{ name: resolved.guest.name, direction, seats, at: Date.now() }, ...rows].slice(0, 8));
      signalGood();
    },
    [offline, dismiss, pushToast],
  );

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
            if (pausedRef.current || viewRef.current !== "camera") return;
            // The camera reads every QR code in frame, not just invite codes — a venue's
            // own map/wifi signage sharing the shot, a poster in the background. Only an
            // invite-shaped code is worth a round trip; anything else is ignored so it
            // doesn't interrupt scanning with an "unknown" error and a bad-scan buzz.
            if (!normaliseScan(decoded)) return;

            const previous = lastScanRef.current;
            const now = Date.now();
            if (previous && previous.code === decoded && now - previous.at < REPEAT_WINDOW_MS) return;

            lastScanRef.current = { code: decoded, at: now };
            // Pause synchronously so the next frame's decode (even of a
            // different code) is dropped while this one's overlay is open —
            // resolveByCodeRef is used instead of a direct dependency so
            // this effect (and the camera it starts) never has to restart
            // just because resolveByCode's identity changes.
            pausedRef.current = true;
            resolveByCodeRef.current(decoded);
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
    // Intentionally empty — the camera starts exactly once per mount; see
    // resolveByCodeRef above for why this doesn't need resolveByCode itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      {offline.syncStatus.kind !== "synced" ? (
        <div className="border-b border-night-line px-5 py-1.5 text-xs">
          {offline.syncStatus.kind === "pending" ? (
            <span className="text-night-muted">{offline.syncStatus.count} بانتظار المزامنة…</span>
          ) : offline.syncStatus.kind === "offline" ? (
            <span className="text-night-muted">
              غير متصل — سيُزامَن لاحقاً{offline.syncStatus.count > 0 ? ` (${offline.syncStatus.count})` : ""}
            </span>
          ) : (
            <span className="text-night-bad">يلزم تسجيل الدخول مجدداً لإتمام المزامنة ({offline.syncStatus.count})</span>
          )}
        </div>
      ) : null}

      <div className="flex gap-2 border-b border-night-line px-5 py-2">
        <button
          onClick={() => showView("camera")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${view === "camera" ? "bg-night-raised text-night-ink" : "text-night-muted"}`}
        >
          الكاميرا
        </button>
        <button
          onClick={() => showView("guests")}
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

        {view === "guests" ? (
          <div className="absolute inset-0 overflow-y-auto bg-canvas p-4 text-ink">
            <GuestSearchPanel guests={guests} onResolve={resolveGuest} onGuestAdded={offline.addGuestToCache} />
          </div>
        ) : null}

        {/* Not gated on `view`: resolveGuest (tapped from the guest panel, i.e. while
            view === "guests") sets this same overlay state, and must show the same
            resolved-guest + check in/out action a camera scan does. Rendered after the
            guests-panel block above so it stacks on top of that panel's opaque
            bg-canvas layer instead of being hidden behind it. */}
        {overlay ? (
          <ResultOverlay overlay={overlay} onDismiss={dismiss} onCommit={commit} onSearch={() => showView("guests")} />
        ) : null}

        {/* Non-blocking — sits over the camera without pausing or hiding it,
            and never intercepts taps on the camera area underneath. */}
        <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2 px-4">
          {toasts.map((toast) => (
            <ScanToast key={toast.id} toast={toast} />
          ))}
        </div>

        {/* Not gated on `view`: a resolveGuest/commit network failure happens while staff
            are looking at the guest panel, not the camera, so this must be visible on
            either tab. Rendered last so it stacks above the guest panel's opaque
            bg-canvas layer instead of being hidden behind it. */}
        {cameraError ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center">
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
              resolveByCode(manual.trim());
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
  onDismiss,
  onCommit,
  onSearch,
}: {
  overlay: Overlay;
  onDismiss: () => void;
  onCommit: (resolved: Resolved, method: ScanMethod, direction: ScanDirection, seats: number, override: boolean) => void;
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
            onClick={() => onCommit(overlay.resolved, overlay.method, overlay.direction, overlay.seats, true)}
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

  // kind === "pending"
  const { resolved } = overlay;
  const { canCheckIn, canCheckOut } = resolved;
  const both = canCheckIn !== null && canCheckOut !== null;
  const insideSeats = resolved.guest.insideSeats;
  const statusLabel =
    insideSeats <= 0 ? "بالخارج الآن" : insideSeats >= resolved.guest.seats ? "بالداخل الآن" : "بالداخل جزئياً";

  return (
    <Overlay tone="good" onDismiss={onDismiss}>
      <p className="display text-5xl">{resolved.guest.name}</p>
      <p className="mt-1 text-white/80">
        {statusLabel} — {insideSeats}/{resolved.guest.seats}
      </p>
      <SeatDots total={resolved.guest.seats} filled={insideSeats} />
      {resolved.guest.phone || resolved.guest.note ? (
        <p className="mt-1.5 text-xs text-white/55">
          {[resolved.guest.phone, resolved.guest.note].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {canCheckIn ? (
        <DirectionActions
          direction="in"
          defaultSeats={canCheckIn.defaultSeats}
          labelFewer={both}
          onCommit={(seats) => onCommit(resolved, overlay.method, "in", seats, false)}
        />
      ) : null}

      {canCheckOut ? (
        <DirectionActions
          direction="out"
          defaultSeats={canCheckOut.defaultSeats}
          labelFewer={both}
          onCommit={(seats) => onCommit(resolved, overlay.method, "out", seats, false)}
        />
      ) : null}

      <DismissButton onDismiss={onDismiss}>تراجع</DismissButton>
    </Overlay>
  );
}

/** Visual seat status — filled dots are inside, hollow are outside — so
 * "3 of 4 arrived, one still outside" reads in under a second (spec §7.3).
 * Large parties fall back to the numeric fraction alone; a wall of dozens
 * of dots would be noise, not signal. */
const MAX_SEAT_DOTS = 12;

function SeatDots({ total, filled }: { total: number; filled: number }) {
  if (total > MAX_SEAT_DOTS) return null;
  return (
    <div className="mt-2 flex justify-center gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < filled ? "bg-white" : "bg-white/25"}`} />
      ))}
    </div>
  );
}

/** One direction's primary action plus its "fewer than N" picker. A partially
 * arrived party renders this twice (check in the rest / check out those inside),
 * so `labelFewer` names the direction on the chip row to keep the two apart. */
function DirectionActions({
  direction,
  defaultSeats,
  labelFewer,
  onCommit,
}: {
  direction: ScanDirection;
  defaultSeats: number;
  labelFewer: boolean;
  onCommit: (seats: number) => void;
}) {
  const fewerCount = Math.max(defaultSeats - 1, 0);
  const fewerLabel = labelFewer ? (direction === "in" ? "دخول عدد أقل؟" : "خروج عدد أقل؟") : "عدد أقل؟";
  // A long row of one button per seat stops being readable past a handful —
  // a large party gets a stepper instead (spec §7.3).
  const useStepper = fewerCount > 5;

  return (
    <div className="mt-8 flex w-full max-w-xs flex-col items-center">
      <button
        onClick={() => onCommit(defaultSeats)}
        className="h-14 w-full rounded-xl bg-white/95 text-lg font-semibold text-ink disabled:opacity-50"
      >
        {direction === "in" ? `تسجيل دخول ${defaultSeats}` : `تسجيل خروج ${defaultSeats}`}
      </button>

      {fewerCount > 0 ? (
        <div className="mt-4 w-full">
          <p className="mb-2 text-sm text-white/80">{fewerLabel}</p>
          {useStepper ? (
            <FewerSeatsStepper max={fewerCount} onCommit={onCommit} />
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: fewerCount }, (_, i) => i + 1).map((seats) => (
                <button
                  key={seats}
                  onClick={() => onCommit(seats)}
                  className="h-12 w-12 rounded-xl border border-white/30 text-lg font-semibold tabular disabled:opacity-50"
                >
                  {seats}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FewerSeatsStepper({ max, onCommit }: { max: number; onCommit: (seats: number) => void }) {
  const [seats, setSeats] = useState(max);

  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={() => setSeats((s) => Math.max(1, s - 1))}
        aria-label="عدد أقل"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 text-2xl font-semibold leading-none"
      >
        −
      </button>
      <span className="w-10 shrink-0 text-center text-xl font-semibold tabular">{seats}</span>
      <button
        type="button"
        onClick={() => setSeats((s) => Math.min(max, s + 1))}
        aria-label="عدد أكثر"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 text-2xl font-semibold leading-none"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => onCommit(seats)}
        className="h-11 shrink-0 rounded-xl bg-white/95 px-5 text-sm font-semibold text-ink"
      >
        تأكيد
      </button>
    </div>
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

/** The non-blocking success indicator (spec §7.2) — scales/fades in, then
 * fades out on its own; never intercepts taps (the camera stays fully
 * live and tappable underneath the whole time). */
function ScanToast({ toast }: { toast: Toast }) {
  return (
    <div
      className={`flash-in flex items-center gap-2 rounded-full bg-night-good px-4 py-2 text-sm font-semibold text-night shadow-lg transition-opacity duration-200 ${toast.leaving ? "opacity-0" : "opacity-100"}`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0">
        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="max-w-[12rem] truncate">{toast.guestName}</span>
      <span className="tabular text-night/70">{toast.direction === "in" ? `دخول ${toast.seats}` : `خروج ${toast.seats}`}</span>
    </div>
  );
}
