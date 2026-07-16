import type { AgentTrace, Analysis } from "@/lib/schema";

export const DEMO_TRACE_ID = "demo-next-router";

export const demoTrace: AgentTrace = {
  traceId: DEMO_TRACE_ID,
  task: "Add a settings page to this application",
  repository: {
    name: "demo-app",
    path: "./demo/demo-app",
  },
  events: [
    {
      id: "event-1",
      timestamp: "2026-07-16T10:00:00Z",
      type: "user_request",
      content: "Add a settings page to this application.",
    },
    {
      id: "event-2",
      timestamp: "2026-07-16T10:00:04Z",
      type: "assumption",
      title: "Assumed React Router",
      content:
        "This project uses React Router, so the settings page should be registered in a client-side route table.",
      evidence: [],
    },
    {
      id: "event-3",
      timestamp: "2026-07-16T10:00:07Z",
      type: "file_read",
      path: "src/App.tsx",
      contentSummary:
        "A small legacy-looking client component with navigation markup, but no router setup.",
    },
    {
      id: "event-4",
      timestamp: "2026-07-16T10:00:10Z",
      type: "reasoning_summary",
      content:
        "The App component looks like the likely routing entry point; proceed without checking framework metadata.",
      evidence: ["event-3"],
    },
    {
      id: "event-5",
      timestamp: "2026-07-16T10:00:14Z",
      type: "file_edit",
      path: "src/pages/Settings.tsx",
      contentSummary: "Created a React Router-style settings component.",
    },
    {
      id: "event-6",
      timestamp: "2026-07-16T10:00:18Z",
      type: "file_edit",
      path: "src/App.tsx",
      contentSummary:
        "Imported BrowserRouter, Routes, and Route from react-router-dom.",
    },
    {
      id: "event-7",
      timestamp: "2026-07-16T10:00:24Z",
      type: "tool_call",
      command: "npm run build",
      content: "Build the application to verify the new page.",
    },
    {
      id: "event-8",
      timestamp: "2026-07-16T10:00:31Z",
      type: "tool_result",
      status: "failed",
      content:
        "Module not found: Can't resolve 'react-router-dom' in src/App.tsx.",
    },
    {
      id: "event-9",
      timestamp: "2026-07-16T10:00:35Z",
      type: "observation",
      content:
        "package.json contains next and the repository has app/layout.tsx and app/page.tsx; react-router-dom is absent.",
    },
    {
      id: "event-10",
      timestamp: "2026-07-16T10:00:40Z",
      type: "test_result",
      status: "failed",
      content:
        "Settings route verification failed: app/settings/page.tsx does not exist.",
    },
    {
      id: "event-11",
      timestamp: "2026-07-16T10:00:44Z",
      type: "final_result",
      status: "failed",
      content:
        "The requested settings page is not reachable and the build is broken.",
    },
  ],
  finalOutcome: {
    status: "failed",
    summary:
      "Build failed after React Router imports were added to a Next.js App Router repository.",
  },
};

export const demoAnalysis: Analysis = {
  summary:
    "The execution diverged before any file edit: it inferred React Router from an ambiguous component and skipped the repository signals that identify Next.js App Router.",
  firstErrorEventId: "event-2",
  firstErrorTitle: "Unsupported framework assumption",
  firstErrorExplanation:
    "The agent assumed React Router without supporting evidence. That decision selected the wrong routing model, directed later edits into src/pages and src/App.tsx, and caused the eventual missing dependency and route failures. The compiler error is a downstream symptom, not the origin.",
  confidence: 0.98,
  supportingEvidenceEventIds: ["event-3", "event-8", "event-9", "event-10"],
  ignoredEvidenceEventIds: ["event-9"],
  affectedEventIds: [
    "event-4",
    "event-5",
    "event-6",
    "event-7",
    "event-8",
    "event-10",
    "event-11",
  ],
  propagationEdges: [
    {
      source: "event-1",
      target: "event-2",
      explanation: "The request required choosing the repository's routing convention.",
    },
    {
      source: "event-2",
      target: "event-4",
      explanation: "The unsupported assumption narrowed the inspection strategy.",
    },
    {
      source: "event-3",
      target: "event-4",
      explanation: "An ambiguous file was treated as sufficient framework evidence.",
    },
    {
      source: "event-4",
      target: "event-5",
      explanation: "The wrong routing plan created a page outside the App Router.",
    },
    {
      source: "event-5",
      target: "event-6",
      explanation: "The page required wiring a React Router route table.",
    },
    {
      source: "event-6",
      target: "event-8",
      explanation: "The edit introduced an unavailable dependency.",
    },
    {
      source: "event-8",
      target: "event-10",
      explanation: "The incorrect structure also left the expected route absent.",
    },
    {
      source: "event-10",
      target: "event-11",
      explanation: "Verification confirmed the requested route was not implemented.",
    },
  ],
  correctedAssumption: "This project uses Next.js App Router.",
  alternativePlan: [
    "Inspect package.json and the top-level app directory before selecting a routing strategy.",
    "Confirm that Next.js and app/layout.tsx establish the App Router convention.",
    "Create app/settings/page.tsx using the repository's existing component and styling patterns.",
    "Avoid adding a client-side router or unrelated routing dependency.",
    "Run the fixed route verifier and confirm the settings page exists at /settings.",
  ],
  verificationSuggestion:
    "Copy the dedicated demo fixture, create app/settings/page.tsx, and run its fixed Node verifier in the isolated replay directory.",
  insufficientEvidence: false,
};
