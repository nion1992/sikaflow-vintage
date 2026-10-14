import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBusiness } from "@/hooks/use-business";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { BadgeCheck, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import type { PlanId } from "@/convex/shared";

const PLANS: {
  id: PlanId;
  name: string;
  price: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}[] = [
  {
    id: "free",
    name: "Free",
    price: "E0",
    tagline: "For trying the ledger",
    features: [
      "5 documents per month",
      "Quotes & invoices",
      "Payment register",
      "WhatsApp sharing",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: "E99/mo",
    tagline: "For working SMEs",
    highlight: true,
    features: [
      "Unlimited documents",
      "Everything in Free",
      "Multi-user teams (soon)",
      "Priority support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "E249/mo",
    tagline: "For busier books",
    features: [
      "Unlimited documents",
      "Everything in Business",
      "Advanced reports (soon)",
      "Early access features",
    ],
  },
];

/**
 * The upgrade conversation.
 *
 * V1: owner/admin can activate a plan directly (no gateway yet). The dialog
 * states this plainly; the backend `activatePlan` mutation is the seam a
 * Paystack/Stripe webhook will replace.
 */
export default function UpgradeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { business, role, subscription } = useBusiness();
  const activatePlan = useMutation(api.billing.activatePlan);
  const createCheckout = useMutation(api.stripe.createCheckoutSession);
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);

  const currentPlan = subscription?.plan ?? "free";
  const canManage = role === "owner" || role === "admin";

  // Which plans have real Stripe checkout wired (null while loading)
  const stripeConfigured = useQuery(
    api.stripe.checkoutConfigured,
    open && canManage ? {} : "skip",
  );

  const handleActivate = async (plan: PlanId) => {
    setPendingPlan(plan);
    try {
      await activatePlan({
        plan,
        reference: `manual-${Date.now()}`,
      });
      toast.success(
        plan === "free"
          ? "Switched to the Free plan."
          : `${PLANS.find((p) => p.id === plan)?.name} plan activated. Happy bookkeeping!`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change plan.");
    } finally {
      setPendingPlan(null);
    }
  };

  /** Paid plan with Stripe configured → hosted checkout; otherwise instant. */
  const handleChoose = async (plan: "business" | "pro") => {
    if (stripeConfigured?.[plan]) {
      setPendingPlan(plan);
      try {
        const { url } = await createCheckout({ plan });
        window.location.href = url;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not start checkout.",
        );
        setPendingPlan(null);
      }
      return;
    }
    await handleActivate(plan);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Plans &amp; billing</DialogTitle>
          <DialogDescription>
            {business ? `${business.name} · ` : ""}Start free, upgrade when the
            documents outgrow the drawer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            return (
              <div
                key={plan.id}
                className={`paper-card flex flex-col rounded-md border p-4 ${
                  plan.highlight && !isCurrent
                    ? "border-primary/50"
                    : isCurrent
                      ? "border-emerald-700/40 bg-emerald-700/5"
                      : ""
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-serif text-lg font-bold">
                    {plan.name}
                  </span>
                  {isCurrent ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                      <BadgeCheck className="size-3.5" />
                      Current
                    </span>
                  ) : (
                    <span className="font-mono text-sm">{plan.price}</span>
                  )}
                </div>
                <div className="ledger-label mt-0.5 text-muted-foreground">
                  {plan.tagline}
                </div>
                <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5">
                      <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-4"
                  size="sm"
                  variant={isCurrent ? "ghost" : plan.highlight ? "default" : "outline"}
                  disabled={!canManage || isCurrent || pendingPlan !== null}
                  onClick={() =>
                    plan.id === "free"
                      ? handleActivate("free")
                      : handleChoose(plan.id)
                  }
                >
                  {pendingPlan === plan.id && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  {isCurrent
                    ? "Active"
                    : !canManage
                      ? "Owner/admin only"
                      : plan.id === "free"
                        ? "Switch to Free"
                        : stripeConfigured?.[plan.id]
                          ? `Checkout — ${plan.price}`
                          : `Choose ${plan.name}`}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
          {stripeConfigured && (stripeConfigured.business || stripeConfigured.pro)
            ? "Secure checkout by Stripe — cards, EFT and mobile money where enabled. You'll return to Settings after paying, and your plan activates the moment Stripe confirms."
            : "Stripe checkout isn't wired yet (add STRIPE_SECRET_KEY and STRIPE_PRICE_* in the Keys tab). Until then, plans activate instantly for evaluation."}
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
