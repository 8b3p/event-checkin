"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/component/ui/card";
import { Label } from "@/shared/component/ui/label";
import { Textarea } from "@/shared/component/ui/textarea";
import { MAX_COMMENT_LENGTH, MAX_RATING } from "../domain/Feedback";
import { useFeedbackFormViewModel } from "../view-model/useFeedbackFormViewModel";
import { StarIcon, StarRating } from "./StarRating";

/**
 * Shown on the guest's invite page once the event is over. `initial` is the
 * guest's existing answer (null if they haven't answered), so revising is just
 * submitting again.
 */
export default function FeedbackForm({
  code,
  initial,
}: {
  code: string;
  initial: { rating: number; comment: string | null } | null;
}) {
  const vm = useFeedbackFormViewModel(initial);

  if (vm.showThanks && vm.saved) {
    return (
      <Card data-testid="feedback-thanks" className="mt-6 text-center">
        <CardContent className="space-y-3">
          <p className="display text-xl text-foreground">شكراً لرأيك</p>
          <StarRating rating={vm.saved.rating} className="size-6" />
          {vm.saved.comment ? <p className="whitespace-pre-line text-sm text-muted-foreground">{vm.saved.comment}</p> : null}
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={vm.startEditing}>
              تعديل رأيي
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="feedback-form" className="mt-6">
      <CardHeader>
        <CardTitle className="display text-xl">
          {initial || vm.saved ? "رأيك في الفعالية — يمكنك تعديله" : "كيف كانت الفعالية؟"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={vm.action} onSubmit={vm.onSubmit} className="space-y-4">
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="rating" value={vm.rating || ""} />

          <div role="radiogroup" aria-label="التقييم" className="flex justify-center gap-1">
            {Array.from({ length: MAX_RATING }, (_, i) => {
              const value = i + 1;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={vm.rating === value}
                  aria-label={`${value} من ${MAX_RATING}`}
                  onClick={() => vm.setRating(value)}
                  className="rounded-md p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <StarIcon filled={value <= vm.rating} className="size-9" />
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feedback-comment">تعليق (اختياري)</Label>
            <Textarea
              id="feedback-comment"
              name="comment"
              rows={3}
              maxLength={MAX_COMMENT_LENGTH}
              value={vm.comment}
              onChange={(event) => vm.setComment(event.target.value)}
              placeholder="شاركنا ما أعجبك أو ما يمكن أن يكون أفضل"
            />
          </div>

          {vm.error ? <ErrorNote>{vm.error}</ErrorNote> : null}

          <Button type="submit" className="w-full" isLoading={vm.pending}>
            {vm.pending ? "جارٍ الإرسال…" : "إرسال"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
