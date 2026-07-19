import type { Analysis } from "@/lib/schema";

export function prepareBranchPlan(analysis: Analysis): string[] {
  const plan = analysis.alternativePlan
    .map((step) => step.trim())
    .filter(Boolean);

  if (plan.length === 0) {
    throw new Error("No corrected branch plan is available for this analysis.");
  }

  return plan;
}
