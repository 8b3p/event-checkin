"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createReportShareAction,
  revokeReportShareAction,
  setReportShareNamesAction,
  type ReportShareState,
} from "@/app/events/[id]/report/actions";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";

type Props = {
  eventId: number;
  /** Null when the report is not shared. */
  token: string | null;
  sharedAt: string | null;
  showNames: boolean;
};

const SHARED_ON = new Intl.DateTimeFormat("ar-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });

/** Owner-only: create, copy and revoke the read-only report link. Never rendered on the shared page. */
export default function ReportShareControls({ eventId, token, sharedAt, showNames }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The link is built from the address the owner is using, so it always matches the live site.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const link = token ? `${origin}/r/${token}` : "";

  function run(action: () => Promise<ReportShareState>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("تعذّر النسخ تلقائياً — حدّد الرابط وانسخه يدوياً.");
    }
  }

  function revoke() {
    if (!window.confirm("سيتوقف الرابط الحالي عن العمل فوراً لكل من يملكه. هل تريد إيقاف المشاركة؟")) return;
    run(() => revokeReportShareAction(eventId));
  }

  return (
    <Card className="mb-6 print:hidden">
      <CardHeader>
        <CardTitle>مشاركة التقرير مع العميل</CardTitle>
        <CardDescription>
          رابط للقراءة فقط، يُفتح بلا تسجيل دخول. لا يعرض أرقام الهواتف ولا رموز الضيوف ولا الملاحظات ولا رمز الباب ولا
          سجل الباب، ولا يحتوي أي رابط إلى لوحة التحكم.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {token ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Input
                readOnly
                dir="ltr"
                value={link}
                aria-label="رابط التقرير"
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 basis-72"
              />
              <Button type="button" variant="outline" onClick={copy} disabled={!origin}>
                {copied ? "تم النسخ ✓" : "نسخ الرابط"}
              </Button>
              <Button type="button" variant="destructive" onClick={revoke} disabled={pending}>
                إيقاف المشاركة
              </Button>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={showNames}
                disabled={pending}
                onChange={(event) => run(() => setReportShareNamesAction(eventId, event.target.checked))}
              />
              <span>
                إظهار أسماء الضيوف في التقرير المشترك
                <span className="block text-xs text-muted-foreground">
                  مغلق افتراضياً: يرى العميل الأعداد والتوقيتات فقط. عند تفعيله تظهر الأسماء في قائمة الضيوف وقائمة من
                  غادروا مبكراً.
                </span>
              </span>
            </label>

            {sharedAt ? (
              <p className="text-xs text-muted-foreground">
                أُنشئ الرابط في <span suppressHydrationWarning>{SHARED_ON.format(new Date(sharedAt))}</span>. بعد
                إيقاف المشاركة لن يفتح هذا الرابط أبداً، وإنشاء رابط جديد يعطي عنواناً مختلفاً.
              </p>
            ) : null}
          </>
        ) : (
          <Button type="button" onClick={() => run(() => createReportShareAction(eventId))} disabled={pending}>
            إنشاء رابط للمشاركة
          </Button>
        )}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
