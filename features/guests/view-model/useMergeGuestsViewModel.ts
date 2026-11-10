"use client";

import { useActionState, useState } from "react";
import { mergeGuestsAction, type MergeGuestsFormState } from "@/app/events/[id]/guests/cleanup/actions";
import {
  defaultMergePicks,
  suggestKeepAndMerge,
  type CleanupGuest,
  type MergeFieldPicks,
} from "../domain/dataQuality";

/**
 * One merge panel: which of the pair survives (the invited / older one by
 * default, swappable), which phone and note win, and the confirm step.
 */
export function useMergeGuestsViewModel(first: CleanupGuest, second: CleanupGuest) {
  const initial = suggestKeepAndMerge(first, second);
  const [swapped, setSwapped] = useState(false);
  const keep = swapped ? initial.merge : initial.keep;
  const merge = swapped ? initial.keep : initial.merge;

  const [open, setOpen] = useState(false);
  const [picksOverride, setPicksOverride] = useState<Partial<MergeFieldPicks>>({});
  const picks: MergeFieldPicks = { ...defaultMergePicks(keep, merge), ...picksOverride };

  const [state, action, pending] = useActionState<MergeGuestsFormState, FormData>(mergeGuestsAction, {});

  return {
    keep,
    merge,
    picks,
    open,
    openPanel: () => setOpen(true),
    closePanel: () => setOpen(false),
    swap: () => {
      setSwapped((current) => !current);
      setPicksOverride({});
    },
    pick: (field: keyof MergeFieldPicks, value: MergeFieldPicks[keyof MergeFieldPicks]) =>
      setPicksOverride((current) => ({ ...current, [field]: value })),
    error: state.error,
    ok: state.ok,
    action,
    pending,
  };
}
