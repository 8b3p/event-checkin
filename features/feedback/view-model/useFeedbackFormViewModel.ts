"use client";

import { useActionState, useState } from "react";
import { submitFeedbackAction, type FeedbackFormState } from "@/app/i/[code]/actions";

type Answer = { rating: number; comment: string | null };

export function useFeedbackFormViewModel(initial: Answer | null) {
  const [state, action, pending] = useActionState<FeedbackFormState, FormData>(submitFeedbackAction, {});
  const [rating, setRating] = useState(initial?.rating ?? 0);
  // Controlled: React resets uncontrolled fields after every form action, which would wipe a typed comment on an error.
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [editing, setEditing] = useState(false);

  const saved = state.saved ?? null;

  return {
    error: state.error,
    pending,
    rating,
    setRating,
    /** After a successful submit the form is replaced by a thank-you until the guest asks to revise. */
    showThanks: saved !== null && !editing,
    saved,
    startEditing: () => {
      if (saved) {
        setRating(saved.rating);
        setComment(saved.comment ?? "");
      }
      setEditing(true);
    },
    onSubmit: () => setEditing(false),
    action,
    comment,
    setComment,
  };
}
