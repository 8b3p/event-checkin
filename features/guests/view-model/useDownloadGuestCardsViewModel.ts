"use client";

import JSZip from "jszip";
import { useCallback, useState } from "react";
import type { Event } from "@/features/events/domain/Event";
import { cardFileName } from "@/shared/lib/card-file-name";
import { saveBlob } from "@/shared/lib/save-blob";
import type { Guest } from "../domain/Guest";
import { createInviteCardRenderer } from "./invite-card-renderer";

type DownloadState =
  | { status: "idle" }
  | { status: "rendering"; done: number; total: number }
  | { status: "zipping" }
  | { status: "error"; message: string };

const FALLBACK_ERROR = "تعذر تحميل البطاقات. حاول مرة أخرى.";

export function useDownloadGuestCardsViewModel(event: Event, guests: Guest[]) {
  const [state, setState] = useState<DownloadState>({ status: "idle" });

  const download = useCallback(async () => {
    const total = guests.length;
    setState({ status: "rendering", done: 0, total });

    const zip = new JSZip();
    const skipped: string[] = [];
    const renderer = createInviteCardRenderer(event);

    try {
      // Serial: the renderer reuses one off-screen root. A failed card is listed in the
      // notes file and left out, rather than zipped as a blank image that looks real.
      for (const [index, guest] of guests.entries()) {
        try {
          zip.file(cardFileName(guest), await renderer.render(guest));
        } catch (error) {
          console.error(`Failed to render guest card for ${guest.name}:`, error);
          skipped.push(guest.name);
        }
        setState({ status: "rendering", done: index + 1, total });
        // Yield a frame so the counter paints and the tab stays responsive.
        await new Promise(requestAnimationFrame);
      }

      // Encoded to UTF-8 bytes ourselves rather than handed to JSZip as a plain string,
      // which it may store as raw UTF-16 code units and corrupt the Arabic text.
      zip.file(
        "ملاحظات.txt",
        new TextEncoder().encode(
          skipped.length === 0
            ? "تم إنشاء جميع البطاقات بنجاح."
            : `تعذر إنشاء بطاقات الدعوات التالية، حاول تحميلها يدوياً من صفحة كل دعوة:\n${skipped.join("\n")}`,
        ),
      );

      setState({ status: "zipping" });
      // PNGs are already deflate-compressed; recompressing them costs time for ~no gain.
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      saveBlob(blob, `بطاقات-${event.id}.zip`);
      setState({ status: "idle" });
    } catch (error) {
      console.error("Failed to build guest cards ZIP:", error);
      setState({ status: "error", message: FALLBACK_ERROR });
    } finally {
      renderer.dispose();
    }
  }, [event, guests]);

  return { state, download };
}
