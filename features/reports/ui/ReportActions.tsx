"use client";

import { Button } from "@/shared/component/ui/button";

/** Print (the browser's "Save as PDF" lives there) and the attendance CSV, stamped in the owner's timezone. */
export default function ReportActions({ eventId }: { eventId: number }) {
  function downloadCsv() {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    window.location.href = `/events/${eventId}/report/export?tz=${encodeURIComponent(timeZone)}`;
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button type="button" variant="outline" onClick={downloadCsv}>
        تنزيل الحضور (CSV)
      </Button>
      <Button type="button" onClick={() => window.print()}>
        طباعة / PDF
      </Button>
    </div>
  );
}
