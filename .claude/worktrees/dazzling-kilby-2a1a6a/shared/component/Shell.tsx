import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/shared/lib/logout-action";
import { Button } from "@/shared/component/ui/button";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-6 px-5">
          <Link href="/" className="display shrink-0 text-xl text-foreground">
            الباب
          </Link>

          <form action={logoutAction} className="ms-auto">
            <Button type="submit" variant="ghost" size="sm">
              تسجيل الخروج
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}

export function PageHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-3xl text-foreground">{title}</h1>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}
