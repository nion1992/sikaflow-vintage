import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router";
import { ArrowLeft, Stamp } from "lucide-react";

export default function ModulePlaceholder({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="ledger-label text-muted-foreground">SikaFlow · Coming in {phase}</div>
        <h1 className="letterpress mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
      </div>

      <Card className="paper-card parchment-edge mx-auto w-full max-w-md border-dashed">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="stamp flex size-14 items-center justify-center rounded-full text-primary/70">
            <Stamp className="size-7" />
          </div>
          <div>
            <p className="font-serif text-lg font-semibold">Awaiting instruction</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 size-4" />
            Back to overview
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
