import { afterEach, describe, expect, it, vi } from "vitest";
import { demoAnalysis, demoTrace } from "@/lib/demo";
import {
  requestPaidAnalysis,
  resetPaidAnalysisRequestStateForTests,
} from "@/lib/paid-analysis-client";

afterEach(() => resetPaidAnalysisRequestStateForTests());

describe("paid analysis request safeguards", () => {
  it("deduplicates matching requests while one is pending", async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));
    const trace = { ...demoTrace, traceId: "custom-trace" };

    const first = requestPaidAnalysis(trace, fetcher as typeof fetch, () => 1_000);
    const duplicate = requestPaidAnalysis(trace, fetcher as typeof fetch, () => 1_001);

    expect(duplicate).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveResponse?.(new Response(JSON.stringify({ analysis: demoAnalysis, mode: "gpt" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(first).resolves.toMatchObject({ mode: "gpt" });
  });

  it("adds explicit paid confirmation and enforces a cooldown without retrying", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(
        JSON.stringify({ analysis: demoAnalysis, mode: "gpt" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const trace = { ...demoTrace, traceId: "custom-trace" };

    await requestPaidAnalysis(trace, fetcher as typeof fetch, () => 5_000);
    const requestBody = JSON.parse(fetcher.mock.calls[0][1]?.body as string);
    expect(requestBody.confirmPaidApiUsage).toBe(true);
    expect(requestBody.trace.traceId).toBe("custom-trace");

    await expect(
      requestPaidAnalysis(trace, fetcher as typeof fetch, () => 5_100),
    ).rejects.toThrow("Please wait");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
