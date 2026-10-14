import { cronJobs } from "convex/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Nightly sweep: sent and partially_paid invoices whose due date has passed
 * become overdue. Draft, paid and cancelled invoices are untouched.
 */
export const markOverdueInvoices = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let flagged = 0;
    const invoices = await ctx.db.query("invoices").collect();
    for (const invoice of invoices) {
      if (
        invoice.deletedAt === undefined &&
        invoice.dueDate < now &&
        (invoice.status === "sent" || invoice.status === "partially_paid")
      ) {
        await ctx.db.patch(invoice._id, { status: "overdue" });
        flagged++;
      }
    }
    return flagged;
  },
});

// Run at 00:15 UTC daily (02:15 in Eswatini time)
crons.daily(
  "mark-overdue-invoices",
  { hourUTC: 0, minuteUTC: 15 },
  internal.crons.markOverdueInvoices,
  {},
);

export default crons;
