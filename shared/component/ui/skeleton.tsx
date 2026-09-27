import * as React from "react"
import { cn } from "cn"

/** Generic pulsing placeholder block. Compose into page-shaped skeletons —
 * not meant to be dropped in bare as a single "loading card". */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse motion-reduce:animate-none rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
