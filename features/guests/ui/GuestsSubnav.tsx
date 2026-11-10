import Link from "next/link";

const TABS = [
  { key: "list", label: "كل الضيوف", href: (eventId: number) => `/events/${eventId}/guests` },
  { key: "follow-up", label: "متابعة بعد الفعالية", href: (eventId: number) => `/events/${eventId}/guests/follow-up` },
  { key: "cleanup", label: "تنظيف البيانات", href: (eventId: number) => `/events/${eventId}/guests/cleanup` },
] as const;

export type GuestsSubnavTab = (typeof TABS)[number]["key"];

/** Links between the guest list and its two after-the-event views. */
export default function GuestsSubnav({ eventId, current }: { eventId: number; current: GuestsSubnavTab }) {
  return (
    <nav aria-label="أقسام الضيوف" className="mb-5 flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href(eventId)}
          aria-current={tab.key === current ? "page" : undefined}
          className={
            tab.key === current
              ? "inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              : "inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
