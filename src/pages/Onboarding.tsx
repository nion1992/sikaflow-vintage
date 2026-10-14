import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import logo from "@/assets/logo.svg";
import { useBusiness } from "@/hooks/use-business";
import { Loader2, Landmark, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";

export default function Onboarding() {
  const navigate = useNavigate();
  const { isLoading, needsOnboarding, hasBusiness } = useBusiness();
  const createBusiness = useMutation(api.businesses.createBusiness);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already onboarded → straight to the ledger
  useEffect(() => {
    if (!isLoading && hasBusiness) {
      navigate("/dashboard", { replace: true });
    }
  }, [isLoading, hasBusiness, navigate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await createBusiness({
        name: String(form.get("name") ?? "").trim(),
        description: String(form.get("description") ?? "").trim() || undefined,
        phone: String(form.get("phone") ?? "").trim() || undefined,
        whatsapp: String(form.get("whatsapp") ?? "").trim() || undefined,
        email: String(form.get("email") ?? "").trim() || undefined,
        address: String(form.get("address") ?? "").trim() || undefined,
        taxNumber: String(form.get("taxNumber") ?? "").trim() || undefined,
      });
      toast.success("Your ledger is open. Welcome to SikaFlow.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="paper-texture flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="paper-texture flex min-h-screen flex-col">
      <div className="flex items-center justify-center px-4 pt-10">
        <div className="flex flex-col items-center gap-2">
          <img src={logo} alt="SikaFlow seal" className="size-16 rounded-xl" />
          <span className="font-serif text-xl font-bold tracking-wide">
            SikaFlow
          </span>
          <span className="ledger-label text-muted-foreground">
            Open your business ledger
          </span>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center px-4 py-10">
        <Card className="glass glass-card paper-card parchment-edge w-full max-w-lg border border-border/60 bg-glass/70 p-8 shadow-xl backdrop-blur-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Landmark className="size-5" />
              </div>
              <div>
                <CardTitle className="font-serif text-xl">
                  Register the business
                </CardTitle>
                <CardDescription>
                  This appears on every quote and invoice you send.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {needsOnboarding ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Business name *</Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="e.g. Mkhaya Print Studio"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="+268 2404 0000"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      name="whatsapp"
                      type="tel"
                      placeholder="+268 7600 0000"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@business.co.sz"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="taxNumber">VAT / tax number</Label>
                    <Input
                      id="taxNumber"
                      name="taxNumber"
                      placeholder="e.g. 1234567"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="address">Physical address</Label>
                  <Input
                    id="address"
                    name="address"
                    placeholder="Main Street, Mbabane"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description">
                    What does your business do?
                  </Label>
                  <Textarea
                    id="description"
                    name="description"
                    rows={2}
                    placeholder="Printing, branding and signage…"
                    disabled={isSubmitting}
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Opening your ledger…
                    </>
                  ) : (
                    <>
                      Open the ledger
                      <ArrowRight className="ml-2 size-4" />
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Currency starts in SZL (E) · VAT defaults to 15% — both adjustable
                  later in settings.
                </p>
              </form>
            ) : (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Checking your ledger…
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
