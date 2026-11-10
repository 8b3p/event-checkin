import type { AttendanceStatus } from "@/features/check-in/domain/foldGuestAttendance";
import type { GuestAttendanceRow } from "@/features/check-in/domain/ScanEvent";

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  full: "حضر",
  partial: "حضر جزئياً",
  no_show: "لم يحضر",
};

/** A timezone the browser reported, or UTC if it's missing or not one Intl knows. */
export function resolveTimeZone(candidate: string | null | undefined): string {
  if (!candidate) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

/** "2026-11-10 18:05" in the owner's own timezone — sortable, and Excel reads it as a date. */
function formatStamp(date: Date | null, timeZone: string): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** The guest-by-guest attendance sheet: header row first. */
export function attendanceCsvRows(rows: GuestAttendanceRow[], timeZone: string): string[][] {
  const header = [
    "الاسم",
    "النوع",
    "المقاعد المدعوة",
    "من حضر",
    "الحالة",
    "أول دخول",
    "آخر خروج",
    "ما زال بالداخل",
    "الهاتف",
    "ملاحظة",
    "الرمز",
  ];

  const body = rows.map((row) => [
    row.name,
    row.source === "invited" ? "مدعو" : "بدون دعوة مسبقة",
    String(row.seats),
    String(row.peakInsideSeats),
    ATTENDANCE_STATUS_LABEL[row.status],
    formatStamp(row.firstInAt, timeZone),
    formatStamp(row.lastOutAt, timeZone),
    row.insideSeats > 0 ? String(row.insideSeats) : "",
    row.phone ?? "",
    row.note ?? "",
    row.code,
  ]);

  return [header, ...body];
}
