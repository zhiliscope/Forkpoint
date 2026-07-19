import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { analysisSchema, type AgentTrace, validateAnalysisForTrace } from "@/lib/schema";
import { demoAnalysis, isBuiltInDemoTrace } from "@/lib/demo";

const SYSTEM_PROMPT = `You are Forkpoint, a causal debugger for observable AI agent traces.
Analyze only explicit trace events, actions, evidence, tool calls, and concise reasoning summaries.
Do not infer or reveal hidden chain-of-thought.
Find the earliest unsupported or incorrect assumption that causally contributed to the final outcome.
Do not merely select the last error. Cite only event IDs present in the trace.
If evidence is insufficient, set firstErrorEventId to null, insufficientEvidence to true, and explain the uncertainty.
Build propagation edges only between existing event IDs.`;

export async function analyzeTrace(trace: AgentTrace) {
  if (isBuiltInDemoTrace(trace)) {
    return { analysis: demoAnalysis, mode: "demo" as const };
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Demo Analysis is available only for the built-in trace.",
    );
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 120_000,
  });
  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL || "gpt-5.6",
    reasoning: { effort: "high" },
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Diagnose this normalized JSON trace:\n${JSON.stringify(trace)}`,
      },
    ],
    text: {
      format: zodTextFormat(analysisSchema, "forkpoint_analysis"),
    },
  });

  if (!response.output_parsed) {
    throw new Error("The model returned no validated analysis.");
  }

  return {
    analysis: validateAnalysisForTrace(response.output_parsed, trace),
    mode: "gpt" as const,
  };
}

export async function generateAlternativePlan(
  trace: AgentTrace,
  correctedAssumption: string,
) {
  if (isBuiltInDemoTrace(trace)) {
    return {
      plan: [
        "Inspect package.json and app/ to verify the framework and routing convention.",
        `Adopt the corrected context: ${correctedAssumption}`,
        "Create app/settings/page.tsx using the existing App Router structure.",
        "Leave src/App.tsx unchanged and add no React Router dependency.",
        "Run the constrained route verifier in an isolated demo copy.",
      ],
      mode: "demo" as const,
    };
  }

  throw new Error(
    "Custom branch plans must use the alternative plan returned by an explicitly requested GPT analysis.",
  );
}
