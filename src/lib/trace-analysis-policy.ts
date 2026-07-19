import { demoAnalysis, isBuiltInDemoTrace } from "@/lib/demo";
import type { AgentTrace } from "@/lib/schema";

export function getLocalDeterministicAnalysis(trace: AgentTrace) {
  return isBuiltInDemoTrace(trace) ? demoAnalysis : null;
}
