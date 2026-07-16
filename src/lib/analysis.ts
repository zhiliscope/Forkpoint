import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { analysisSchema, type AgentTrace, validateAnalysisForTrace } from "@/lib/schema";
import { demoAnalysis, demoTrace } from "@/lib/demo";

const SYSTEM_PROMPT = `You are Forkpoint, a causal debugger for observable AI agent traces.
Analyze only explicit trace events, actions, evidence, tool calls, and concise reasoning summaries.
Do not infer or reveal hidden chain-of-thought.
Find the earliest unsupported or incorrect assumption that causally contributed to the final outcome.
Do not merely select the last error. Cite only event IDs present in the trace.
If evidence is insufficient, set firstErrorEventId to null, insufficientEvidence to true, and explain the uncertainty.
Build propagation edges only between existing event IDs.`;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isBuiltInDemo(trace: AgentTrace) {
  return canonicalJson(trace) === canonicalJson(demoTrace);
}

export async function analyzeTrace(trace: AgentTrace) {
  if (!process.env.OPENAI_API_KEY) {
    if (!isBuiltInDemo(trace)) {
      throw new Error(
        "OPENAI_API_KEY is not configured. Demo Analysis is available only for the built-in trace.",
      );
    }
    return { analysis: demoAnalysis, mode: "demo" as const };
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
  } catch (error) {
    if (isBuiltInDemo(trace)) {
      return { analysis: demoAnalysis, mode: "demo" as const };
    }
    throw error;
  }
}

export async function generateAlternativePlan(
  trace: AgentTrace,
  correctedAssumption: string,
) {
  if (!process.env.OPENAI_API_KEY) {
    if (!isBuiltInDemo(trace)) {
      throw new Error("An OpenAI API key is required for custom trace branching.");
    }
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

  try {
    const planSchema = analysisSchema.pick({ alternativePlan: true });
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.parse({
      model: process.env.OPENAI_MODEL || "gpt-5.6",
      reasoning: { effort: "medium" },
      input: [
        {
          role: "system",
          content:
            "Create a concise alternative execution plan from corrected context. Use only observable repository-safe actions. Return 3-8 steps.",
        },
        {
          role: "user",
          content: JSON.stringify({ trace, correctedAssumption }),
        },
      ],
      text: { format: zodTextFormat(planSchema, "forkpoint_branch") },
    });
    if (!response.output_parsed) throw new Error("No validated branch plan returned.");
    return { plan: response.output_parsed.alternativePlan, mode: "gpt" as const };
  } catch (error) {
    if (isBuiltInDemo(trace)) {
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
    throw error;
  }
}
