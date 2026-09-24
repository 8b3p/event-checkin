"use client";

import { useCallback, useState } from "react";
import type { Event } from "@/features/events/domain/Event";
import { saveBlob } from "@/shared/lib/save-blob";
import type { Guest } from "../domain/Guest";
import { createInviteCardRenderer } from "./invite-card-renderer";

type DownloadState = { status: "idle" } | { status: "rendering" } | { status: "error"; message: string };

const FALLBACK_ERROR = "تعذر إنشاء البطاقة. حاول مرة أخرى.";

export function useDownloadGuestCardViewModel(event: Event, guest: Guest) {
  const [state, setState] = useState<DownloadState>({ status: "idle" });

  const download = useCallback(async () => {
    setState({ status: "rendering" });
    const renderer = createInviteCardRenderer(event);
    try {
      saveBlob(await renderer.render(guest), `دعوة-${guest.code}.png`);
      setState({ status: "idle" });
    } catch (error) {
      console.error("Failed to render guest card:", error);
      setState({ status: "error", message: FALLBACK_ERROR });
    } finally {
      renderer.dispose();
    }
  }, [event, guest]);

  return { state, download };
}
