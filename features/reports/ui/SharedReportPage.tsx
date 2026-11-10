import type { ReportView } from "../domain/EventReport";
import PrintButton from "./PrintButton";
import ReportSections, { formatEventDate } from "./ReportSections";

/**
 * The logged-out, read-only report behind /r/<token>. Deliberately not in the
 * dashboard Shell: no logout form, no link back into the app, no CSV.
 */
export default function SharedReportPage({ view }: { view: ReportView }) {
  const hint = [formatEventDate(view.event.eventDate), view.event.venue].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl text-foreground">{`تقرير ${view.event.name}`}</h1>
          {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        <PrintButton />
      </div>

      <ReportSections view={view} />

      <p className="mt-8 text-center text-xs text-muted-foreground print:hidden">
        تقرير للاطّلاع فقط، أعدّه منظّم الفعالية.
      </p>
    </main>
  );
}
