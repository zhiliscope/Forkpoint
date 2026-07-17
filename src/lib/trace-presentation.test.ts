import { describe, expect, it } from "vitest";
import pnpmCiTrace from "../../examples/ci-pnpm-frozen-lockfile.json";
import { demoTrace } from "@/lib/demo";
import { normalizeTrace } from "@/lib/schema";
import { getTracePresentation } from "@/lib/trace-presentation";

describe("trace presentation", () => {
  it("keeps constrained verification available for the built-in fixture", () => {
    const presentation = getTracePresentation(demoTrace);

    expect(presentation.verificationAvailable).toBe(true);
    expect(presentation.scopeLabel).toBe("Constrained demo replay");
    expect(presentation.verificationButtonLabel).toBe("Run safe verification");
  });

  it("uses neutral plan-only labels for a custom trace", () => {
    const presentation = getTracePresentation(normalizeTrace(pnpmCiTrace));

    expect(presentation).toMatchObject({
      verificationAvailable: false,
      sectionKicker: "ALTERNATIVE BRANCH",
      sectionTitle: "Corrected plan from the Forkpoint",
      scopeLabel: "Verification unavailable for this trace",
      verificationButtonLabel: "Verification unavailable",
      originalBranchLabel: "Original execution",
      correctedBranchLabel: "Corrected execution plan",
    });
  });

  it("does not enable replay for a custom trace that copies the demo trace ID", () => {
    const lookalike = { ...demoTrace, task: "A different imported task" };

    expect(getTracePresentation(lookalike).verificationAvailable).toBe(false);
  });
});
