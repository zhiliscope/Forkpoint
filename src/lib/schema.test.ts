import { describe, expect, it } from "vitest";
import { demoAnalysis, demoTrace } from "@/lib/demo";
import {
  normalizeTrace,
  validateAnalysisForTrace,
} from "@/lib/schema";

describe("trace validation", () => {
  it("accepts and chronologically normalizes the built-in trace", () => {
    const reversed = { ...demoTrace, events: [...demoTrace.events].reverse() };
    const normalized = normalizeTrace(reversed);
    expect(normalized.events[0]?.id).toBe("event-1");
    expect(normalized.events.at(-1)?.id).toBe("event-11");
  });

  it("rejects duplicate event ids", () => {
    const invalid = {
      ...demoTrace,
      events: [...demoTrace.events, demoTrace.events[0]],
    };
    expect(() => normalizeTrace(invalid)).toThrow();
  });

  it("rejects model graph ids that are absent from the trace", () => {
    const invalidAnalysis = {
      ...demoAnalysis,
      affectedEventIds: [...demoAnalysis.affectedEventIds, "invented-event"],
    };
    expect(() => validateAnalysisForTrace(invalidAnalysis, demoTrace)).toThrow(
      /unknown event ids/i,
    );
  });
});
