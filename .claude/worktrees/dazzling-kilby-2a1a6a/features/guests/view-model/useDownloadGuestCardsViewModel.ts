"use client";

import { useCallback, useState } from "react";

type DownloadState =
  | { status: "idle" }
  | { status: "downloading"; bytes: number }
  | { status: "error"; message: string };

const FALLBACK_ERROR = "تعذر تحميل البطاقات. تحقق من الاتصال وحاول مرة أخرى.";

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} م.ب`;
  return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
}

function filenameFromContentDisposition(header: string | null): string {
  const utf8Match = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
  const asciiMatch = header?.match(/filename="([^"]+)"/i);
  return asciiMatch ? asciiMatch[1] : "cards.zip";
}

export function useDownloadGuestCardsViewModel(eventId: number) {
  const [state, setState] = useState<DownloadState>({ status: "idle" });

  const download = useCallback(async () => {
    setState({ status: "downloading", bytes: 0 });

    try {
      const response = await fetch(`/events/${eventId}/guests/cards`);

      if (!response.ok) {
        const body: { error?: string } | null = await response.json().catch(() => null);
        setState({ status: "error", message: body?.error ?? FALLBACK_ERROR });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("ReadableStream not supported");

      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        bytes += value.length;
        setState({ status: "downloading", bytes });
      }

      const blob = new Blob(chunks as BlobPart[], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFromContentDisposition(response.headers.get("Content-Disposition"));
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setState({ status: "idle" });
    } catch (error) {
      console.error("Failed to download guest cards:", error);
      setState({ status: "error", message: FALLBACK_ERROR });
    }
  }, [eventId]);

  return { state, download, formatBytes };
}
