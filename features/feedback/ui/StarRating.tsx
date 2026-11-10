import { MAX_RATING } from "../domain/Feedback";

export function StarIcon({ filled, className = "size-5" }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${className} ${filled ? "text-ring" : "text-border"}`}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
    >
      <path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9L12 2.8z" />
    </svg>
  );
}

/** Read-only row of stars, e.g. "4 من 5" — filled up to `rating`. */
export function StarRating({ rating, className }: { rating: number; className?: string }) {
  return (
    <span role="img" aria-label={`${rating} من ${MAX_RATING}`} className="inline-flex gap-0.5">
      {Array.from({ length: MAX_RATING }, (_, i) => (
        <StarIcon key={i} filled={i < rating} className={className} />
      ))}
    </span>
  );
}
