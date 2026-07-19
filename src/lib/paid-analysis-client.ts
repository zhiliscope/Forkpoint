import type { AgentTrace, Analysis } from "@/lib/schema";

export const PAID_ANALYSIS_COOLDOWN_MS = 30_000;

type AnalysisResponse = {
  analysis: Analysis;
  mode: "gpt";
};

type FetchLike = typeof fetch;

let inFlight: { key: string; promise: Promise<AnalysisResponse> } | null = null;
const lastStartedAt = new Map<string, number>();

function traceKey(trace: AgentTrace) {
  return JSON.stringify(trace);
}

export function requestPaidAnalysis(
  trace: AgentTrace,
  fetcher: FetchLike = fetch,
  now: () => number = Date.now,
) {
  const key = traceKey(trace);

  if (inFlight) {
    if (inFlight.key === key) return inFlight.promise;
    return Promise.reject(new Error("Another GPT analysis request is already pending."));
  }

  const startedAt = now();
  const previousStart = lastStartedAt.get(key);
  if (previousStart !== undefined && startedAt - previousStart < PAID_ANALYSIS_COOLDOWN_MS) {
    const seconds = Math.ceil((PAID_ANALYSIS_COOLDOWN_MS - (startedAt - previousStart)) / 1_000);
    return Promise.reject(
      new Error(`Please wait ${seconds} seconds before running GPT analysis on this trace again.`),
    );
  }

  lastStartedAt.set(key, startedAt);
  const promise = (async () => {
    const response = await fetcher("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trace, confirmPaidApiUsage: true }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Analysis failed.");
    return payload as AnalysisResponse;
  })();

  inFlight = { key, promise };
  void promise.finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
  }).catch(() => undefined);
  return promise;
}

export function resetPaidAnalysisRequestStateForTests() {
  inFlight = null;
  lastStartedAt.clear();
}
