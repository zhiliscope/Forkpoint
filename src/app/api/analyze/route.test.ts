import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoAnalysis, demoTrace } from "@/lib/demo";

const analyzeTrace = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analysis", () => ({ analyzeTrace }));

import { POST } from "@/app/api/analyze/route";

function post(body: unknown) {
  return POST(new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => analyzeTrace.mockReset());

describe("POST /api/analyze paid-request boundary", () => {
  it("returns local Demo Analysis without invoking the analysis client", async () => {
    const response = await post(demoTrace);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ analysis: demoAnalysis, mode: "demo" });
    expect(analyzeTrace).not.toHaveBeenCalled();
  });

  it("rejects a custom trace unless paid usage is explicitly confirmed", async () => {
    const customTrace = { ...demoTrace, traceId: "custom-trace" };
    const response = await post(customTrace);
    expect(response.status).toBe(403);
    expect(analyzeTrace).not.toHaveBeenCalled();
  });

  it("allows one explicitly confirmed custom analysis through to the mocked client", async () => {
    const customTrace = { ...demoTrace, traceId: "custom-trace" };
    analyzeTrace.mockResolvedValue({ analysis: demoAnalysis, mode: "gpt" });
    const response = await post({ trace: customTrace, confirmPaidApiUsage: true });
    expect(response.status).toBe(200);
    expect(analyzeTrace).toHaveBeenCalledOnce();
  });
});
