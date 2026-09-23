import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/shared/component/ui/alert";

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
