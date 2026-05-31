import { Loader2 } from "lucide-react";

// Shown instantly on navigation while the destination route resolves.
export default function Loading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
