import type { NextRequest } from "next/server";
import { makeReportShareRepository } from "@/features/reports/infrastructure/factory";
import { isWellFormedShareToken } from "@/shared/lib/share-token";

/**
 * Gives an unknown or revoked report link a real HTTP 404. The page itself
 * can't: the root loading.tsx streams every route, so by the time the page
 * calls notFound() the 200 status has already gone out. The page still checks
 * the token on its own (this is only the status code, never the authority).
 */
export async function proxy(request: NextRequest) {
  const token = request.nextUrl.pathname.split("/")[2] ?? "";
  if (isWellFormedShareToken(token) && (await makeReportShareRepository().getByToken(token))) return;

  return new Response(NOT_FOUND_PAGE, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export const config = { matcher: "/r/:token" };

const NOT_FOUND_PAGE = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>تقرير الفعالية</title>
<style>body{margin:0;min-height:100dvh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 20px;background:#fbf8f4;color:#1c1917;font-family:Tahoma,"Segoe UI",sans-serif}h1{font-size:1.875rem;margin:0}p{margin:.75rem 0 0;font-size:.875rem;color:#6f6357;max-width:24rem}</style>
</head>
<body>
<h1>هذا التقرير غير متاح</h1>
<p>قد يكون الرابط غير صحيح، أو أوقف صاحب الفعالية مشاركته. تواصل معه للحصول على رابط جديد.</p>
</body>
</html>`;
