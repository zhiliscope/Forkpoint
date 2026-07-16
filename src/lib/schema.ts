import { z } from "zod";

export const eventTypeSchema = z.enum([
  "user_request",
  "assumption",
  "reasoning_summary",
  "tool_call",
  "tool_result",
  "file_read",
  "file_edit",
  "observation",
  "test_result",
  "final_result",
]);

export const traceEventSchema = z.object({
  id: z.string().min(1).max(100),
  timestamp: z.iso.datetime(),
  type: eventTypeSchema,
  content: z.string().max(10_000).optional(),
  title: z.string().max(240).optional(),
  path: z.string().max(500).optional(),
  contentSummary: z.string().max(2_000).optional(),
  evidence: z.array(z.string().max(100)).max(50).optional(),
  command: z.string().max(1_000).optional(),
  status: z.enum(["pending", "success", "failed"]).optional(),
});

export const agentTraceSchema = z
  .object({
    traceId: z.string().min(1).max(100),
    task: z.string().min(1).max(2_000),
    repository: z.object({
      name: z.string().min(1).max(200),
      path: z.string().min(1).max(500),
      initialCommit: z.string().max(100).optional(),
    }),
    events: z.array(traceEventSchema).min(2).max(250),
    finalOutcome: z.object({
      status: z.enum(["passed", "failed", "partial", "unknown"]),
      summary: z.string().min(1).max(4_000),
    }),
  })
  .superRefine((trace, context) => {
    const ids = new Set<string>();
    for (const event of trace.events) {
      if (ids.has(event.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate event id: ${event.id}`,
          path: ["events"],
        });
      }
      ids.add(event.id);
      for (const evidenceId of event.evidence ?? []) {
        if (!trace.events.some((candidate) => candidate.id === evidenceId)) {
          context.addIssue({
            code: "custom",
            message: `Unknown evidence event id: ${evidenceId}`,
            path: ["events"],
          });
        }
      }
    }
  });

export const propagationEdgeSchema = z.object({
  source: z.string().min(1).max(100),
  target: z.string().min(1).max(100),
  explanation: z.string().min(1).max(500),
});

export const analysisSchema = z.object({
  summary: z.string().min(1).max(2_000),
  firstErrorEventId: z.string().min(1).max(100).nullable(),
  firstErrorTitle: z.string().min(1).max(240),
  firstErrorExplanation: z.string().min(1).max(2_000),
  confidence: z.number().min(0).max(1),
  supportingEvidenceEventIds: z.array(z.string()).max(50),
  ignoredEvidenceEventIds: z.array(z.string()).max(50),
  affectedEventIds: z.array(z.string()).max(100),
  propagationEdges: z.array(propagationEdgeSchema).max(150),
  correctedAssumption: z.string().min(1).max(1_000),
  alternativePlan: z.array(z.string().min(1).max(1_000)).min(1).max(12),
  verificationSuggestion: z.string().min(1).max(1_000),
  insufficientEvidence: z.boolean(),
});

export type AgentTrace = z.infer<typeof agentTraceSchema>;
export type TraceEvent = z.infer<typeof traceEventSchema>;
export type Analysis = z.infer<typeof analysisSchema>;

export function normalizeTrace(input: unknown): AgentTrace {
  const parsed = agentTraceSchema.parse(input);
  return {
    ...parsed,
    events: [...parsed.events].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
    ),
  };
}

export function validateAnalysisForTrace(
  input: unknown,
  trace: AgentTrace,
): Analysis {
  const analysis = analysisSchema.parse(input);
  const ids = new Set(trace.events.map((event) => event.id));
  const referenced = [
    ...(analysis.firstErrorEventId ? [analysis.firstErrorEventId] : []),
    ...analysis.supportingEvidenceEventIds,
    ...analysis.ignoredEvidenceEventIds,
    ...analysis.affectedEventIds,
    ...analysis.propagationEdges.flatMap((edge) => [edge.source, edge.target]),
  ];
  const unknown = referenced.filter((id) => !ids.has(id));
  if (unknown.length > 0) {
    throw new Error(`Analysis referenced unknown event ids: ${unknown.join(", ")}`);
  }
  return analysis;
}
