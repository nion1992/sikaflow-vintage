import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { FileWarning } from "lucide-react";

export default function NotFound() {
  return (
    <div className="paper-texture flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="stamp flex size-14 items-center justify-center rounded-full text-primary/70">
        <FileWarning className="size-7" />
      </div>
      <div className="ledger-label mt-5 text-muted-foreground">Page not found</div>
      <h1 className="letterpress mt-2 font-serif text-5xl font-bold">404</h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
        This page is not in the ledger. It may have been moved, archived, or
        never existed at all.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Return to the front page</Link>
      </Button>
    </div>
  );
}
