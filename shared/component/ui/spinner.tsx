import * as React from "react"
import { cn } from "cn"

const SIZES = {
  xs: "size-3",
  sm: "size-3.5",
  default: "size-4",
  lg: "size-5",
} as const

/** Inline loading spinner — plain SVG, no icon library, matches `Button`'s size scale. */
function Spinner({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"svg"> & { size?: keyof typeof SIZES }) {
  return (
    <svg
      role="status"
      aria-label="جارٍ التحميل"
      viewBox="0 0 24 24"
      fill="none"
      className={cn("animate-spin motion-reduce:animate-none", SIZES[size], className)}
      {...props}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export { Spinner }
