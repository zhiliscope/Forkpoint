import { describe, expect, it } from "vitest";
import { demoAnalysis } from "@/lib/demo";
import { prepareBranchPlan } from "@/lib/branch-generation";

describe("prepareBranchPlan", () => {
  it("builds the deterministic demo branch without making a request", () => {
    const originalFetch = globalThis.fetch;
    const plan = prepareBranchPlan(demoAnalysis);

    expect(plan).toEqual(demoAnalysis.alternativePlan);
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it("reports a visible generation error when no plan exists", () => {
    expect(() =>
      prepareBranchPlan({ ...demoAnalysis, alternativePlan: [] }),
    ).toThrow("No corrected branch plan is available for this analysis.");
  });
});
