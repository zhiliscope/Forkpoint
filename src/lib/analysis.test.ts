import { describe, expect, it, vi } from "vitest";
import { demoAnalysis, demoTrace } from "@/lib/demo";

const OpenAIClient = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({ default: OpenAIClient }));

import { analyzeTrace, generateAlternativePlan } from "@/lib/analysis";

describe("analyzeTrace demo safeguard", () => {
  it("returns deterministic Demo Analysis before constructing an OpenAI client", async () => {
    await expect(analyzeTrace(demoTrace)).resolves.toEqual({
      analysis: demoAnalysis,
      mode: "demo",
    });
    expect(OpenAIClient).not.toHaveBeenCalled();
  });

  it("does not create a second paid request for custom branch generation", async () => {
    const customTrace = { ...demoTrace, traceId: "custom-trace" };
    await expect(
      generateAlternativePlan(customTrace, "Use the repository evidence."),
    ).rejects.toThrow("must use the alternative plan returned");
    expect(OpenAIClient).not.toHaveBeenCalled();
  });
});
