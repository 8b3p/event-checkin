"use client";

import { Button } from "@/shared/component/ui/button";

/** The browser's print dialog, where "Save as PDF" lives. */
export default function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      طباعة / PDF
    </Button>
  );
}
