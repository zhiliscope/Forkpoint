import { describe, expect, it } from "vitest";
import { demoAnalysis, demoTrace } from "@/lib/demo";
import { getLocalDeterministicAnalysis } from "@/lib/trace-analysis-policy";

describe("local trace analysis policy", () => {
  it("always resolves the built-in trace to deterministic Demo Analysis", () => {
    expect(getLocalDeterministicAnalysis(demoTrace)).toBe(demoAnalysis);
  });

  it("does not start or fabricate analysis when a custom trace is imported", () => {
    const customTrace = { ...demoTrace, traceId: "custom-trace" };
    expect(getLocalDeterministicAnalysis(customTrace)).toBeNull();
  });
});
