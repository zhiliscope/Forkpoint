import { isBuiltInDemoTrace } from "@/lib/demo";
import type { AgentTrace } from "@/lib/schema";

export function getTracePresentation(trace: AgentTrace) {
  const verificationAvailable = isBuiltInDemoTrace(trace);

  return {
    verificationAvailable,
    sectionKicker: verificationAvailable ? "TIME-TRAVEL REPLAY" : "ALTERNATIVE BRANCH",
    sectionTitle: verificationAvailable
      ? "Branch from the Forkpoint"
      : "Corrected plan from the Forkpoint",
    scopeLabel: verificationAvailable
      ? "Constrained demo replay"
      : "Verification unavailable for this trace",
    verificationButtonLabel: verificationAvailable
      ? "Run safe verification"
      : "Verification unavailable",
    originalBranchLabel: "Original execution",
    correctedBranchLabel: "Corrected execution plan",
  };
}
