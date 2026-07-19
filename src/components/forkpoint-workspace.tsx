"use client";

import {
  Background,
  ControlButton,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  AlertTriangle,
  ArrowRight,
  Braces,
  Check,
  ChevronRight,
  CircleDot,
  FileCode2,
  FileInput,
  GitBranch,
  LoaderCircle,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { demoTrace, isBuiltInDemoTrace } from "@/lib/demo";
import { requestPaidAnalysis } from "@/lib/paid-analysis-client";
import { prepareBranchPlan } from "@/lib/branch-generation";
import {
  normalizeTrace,
  type AgentTrace,
  type Analysis,
  type TraceEvent,
} from "@/lib/schema";
import { getTracePresentation } from "@/lib/trace-presentation";
import { getLocalDeterministicAnalysis } from "@/lib/trace-analysis-policy";

type AnalysisMode = "demo" | "gpt";
type Verification = {
  passed: boolean;
  before: string;
  after: string;
  output: string;
  checks: { label: string; passed: boolean }[];
};

function ForkpointMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="forkpoint-mark"
      viewBox="0 0 24 24"
      width={size}
      height={size}
    >
      <path d="M4 12h7.5c3.1 0 3.9 4.8 7.5 4.8h1" />
      <path className="mark-corrected" d="M11.5 12c3.1 0 3.9-4.8 7.5-4.8h1" />
      <circle className="mark-input" cx="4" cy="12" r="1.45" />
      <circle className="mark-forkpoint" cx="11.5" cy="12" r="1.8" />
      <circle className="mark-failed-end" cx="20" cy="16.8" r="1.45" />
      <circle className="mark-corrected-end" cx="20" cy="7.2" r="1.45" />
    </svg>
  );
}

function HeroBranchPreview() {
  const heroRef = useRef<HTMLDivElement>(null);
  const lastFrameRef = useRef("");
  const [heroFrame, setHeroFrame] = useState({ stage: 0, originalStep: 0, correctedStep: 0 });

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    const runId = performance.now().toString() + "-" + Math.random().toString();
    hero.dataset.timelineRun = runId;
    let frame = 0;
    let stopped = false;
    const startedAt = performance.now();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const commit = (stage: number, originalStep: number, correctedStep: number) => {
      const key = [stage, originalStep, correctedStep].join("-");
      if (key === lastFrameRef.current) return;
      lastFrameRef.current = key;
      setHeroFrame({ stage, originalStep, correctedStep });
      hero.classList.toggle("hero-complete", stage >= 10);
    };

    const finish = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      commit(10, 6, 4);
    };

    const tick = (now: number) => {
      if (stopped || hero.dataset.timelineRun !== runId) return;
      const elapsed = now - startedAt;
      let stage = 0;
      let originalStep = 0;
      let correctedStep = 0;

      if (elapsed >= 450) stage = 1;
      if (elapsed >= 1250) {
        stage = 2;
        originalStep = Math.min(6, Math.floor((elapsed - 1250) / 620) + 1);
      }
      if (elapsed >= 5200) { stage = 3; originalStep = 6; }
      if (elapsed >= 6400) stage = 4;
      if (elapsed >= 8500) stage = 5;
      if (elapsed >= 9700) stage = 6;
      if (elapsed >= 11200) stage = 7;
      if (elapsed >= 12600) {
        stage = 8;
        correctedStep = Math.min(4, Math.floor((elapsed - 12600) / 760) + 1);
      }
      if (elapsed >= 15900) { stage = 9; correctedStep = 4; }
      if (elapsed >= 18200) { finish(); return; }

      commit(stage, originalStep, correctedStep);
      frame = requestAnimationFrame(tick);
    };

    const finishOnScroll = () => {
      if (
        hero.dataset.timelineRun !== runId ||
        window.scrollY < 48 ||
        hero.classList.contains("hero-complete")
      ) return;
      finish();
    };

    lastFrameRef.current = "";
    if (reduceMotion) {
      finish();
    } else {
      frame = requestAnimationFrame(tick);
      window.addEventListener("scroll", finishOnScroll, { passive: true });
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", finishOnScroll);
      if (hero.dataset.timelineRun === runId) delete hero.dataset.timelineRun;
    };
  }, []);

  const { stage, originalStep, correctedStep } = heroFrame;
  const originalSteps = [
    { number: "01", type: "ACTION", title: "Inspect repository structure", detail: "Scanning application files" },
    { number: "02", type: "FILE READ", title: "Read application entry", detail: "src/App.tsx" },
    { number: "03", type: "DECISION", title: "Select routing strategy", detail: "This project uses React Router.", assumption: true },
    { number: "04", type: "FILE EDIT", title: "Create settings page", detail: "src/pages/Settings.tsx" },
    { number: "05", type: "DEPENDENCY", title: "Import routing package", detail: "react-router-dom" },
    { number: "06", type: "VERIFY", title: "Run production build", detail: "npm run build" },
  ];
  const correctedSteps = [
    { number: "03′", type: "DECISION", title: "Confirm Next.js App Router", detail: "Repository convention verified" },
    { number: "04′", type: "FILE EDIT", title: "Create settings route", detail: "app/settings/page.tsx" },
    { number: "05′", type: "CONVENTION", title: "Preserve routing structure", detail: "No new router dependency" },
    { number: "06′", type: "VERIFY", title: "Run route verification", detail: "/settings" },
  ];
  const status =
    stage < 1 ? "Preparing agent" :
    stage < 3 ? "Agent running" :
    stage === 3 ? "Execution failed" :
    stage < 8 ? "Forkpoint analysis" :
    stage < 9 ? "Regenerating branch" :
    "Verification complete";

  return (
    <div
      className={"hero-branch execution-hero stage-" + stage + (stage >= 10 ? " hero-complete" : "")}
      data-stage={stage}
      data-original-step={originalStep}
      data-corrected-step={correctedStep}
      ref={heroRef}
      role="img"
      aria-label="An AI agent makes an unsupported routing assumption, Forkpoint rewinds to the first causal error, and a corrected execution passes verification."
    >
      <div className="execution-window">
        <div className="execution-chrome">
          <div className="execution-title">
            <span className={"run-status-dot " + (stage > 0 && stage < 10 ? "is-active" : "")} />
            <strong>AI Agent Execution</strong>
          </div>
          <span className="execution-id">agent-run / settings-page</span>
          <span className="execution-state">{status}</span>
        </div>

        <div className="execution-body">
          <section className="request-block">
            <span>REQUEST</span>
            <p>Add a settings page to this application.</p>
            <code>00:00:00</code>
          </section>

          <div className="execution-stage">
            <section className="execution-lane original-execution">
              <div className="lane-heading">
                <span>Original execution</span>
                <small>{stage >= 3 ? "Build failed" : "Live trace"}</small>
              </div>
              <div className="execution-rail" aria-hidden="true">
                <i className="rail-progress" />
                {originalSteps.map((_, index) => <i className={`rail-marker rail-marker-${index + 1}`} key={index} />)}
                <i className="causal-scan" />
                <i className="rewind-marker" />
              </div>

              <div className="step-stream">
                {originalSteps.map((step, index) => {
                  const number = index + 1;
                  const visible = originalStep >= number;
                  const active = stage === 2 && originalStep === number;
                  const isForkpoint = step.assumption && stage >= 5;
                  return (
                    <div
                      className={[
                        "cinema-step",
                        visible ? "is-visible" : "",
                        active ? "is-active" : "",
                        visible && !active ? "is-history" : "",
                        step.assumption ? "is-assumption" : "",
                        isForkpoint ? "is-forkpoint" : "",
                        stage >= 7 && number > 3 ? "is-affected-history" : "",
                      ].filter(Boolean).join(" ")}
                      key={step.number}
                    >
                      <span className="step-index"><b>{step.number}</b><small>{step.type}</small></span>
                      <div className="step-copy">
                        <p>{step.title}</p>
                        <div className="row-detail"><span>{step.assumption ? "Assumption:" : ""}</span><code>{step.detail}</code></div>
                        {step.assumption && <div className="corrected-context"><span>Next.js</span><q>App Router confirmed</q></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="rewind-label">REWIND TO FORKPOINT #02</div>
            </section>

            <aside className="trace-detail">
              <div className="failure-output">
                <span>BUILD FAILED</span>
                <strong>Module not found</strong>
                <code>Cannot resolve “react-router-dom”</code>
              </div>

              <div className="analysis-overlay" aria-hidden="true">
                <span>Analyzing causal trace</span>
                <ol><li>Build failed</li><li>Router dependency added</li><li>Wrong settings location</li><li>Routing strategy selected</li></ol>
              </div>

              <div className="forkpoint-diagnosis">
                <strong>FORKPOINT #02</strong>
                <p>First unsupported assumption</p>
                <dl><div><dt>Evidence support</dt><dd>None</dd></div><div><dt>Downstream impact</dt><dd>7 events</dd></div></dl>
              </div>

              <div className="repository-evidence">
                <span>Repository evidence</span>
                <div><code>package.json</code><strong>Next.js detected</strong></div>
                <div><code>app/layout.tsx</code><strong>App Router detected</strong></div>
                <div><code>react-router-dom</code><strong>Not installed</strong></div>
              </div>

              <section className="execution-lane corrected-execution">
              <div className="lane-heading">
                  <span>Corrected execution</span>
                  <small>{stage >= 9 ? "Verification passed" : "Regenerating"}</small>
              </div>
              <div className="execution-rail corrected-rail" aria-hidden="true">
                <i className="rail-progress" />
                {correctedSteps.map((_, index) => <i className={`rail-marker rail-marker-${index + 1}`} key={index} />)}
                <i className="branch-light" />
              </div>
              <div className="step-stream">
                {correctedSteps.map((step, index) => {
                  const number = index + 1;
                  const visible = correctedStep >= number;
                  const active = stage === 8 && correctedStep === number;
                  return (
                    <div
                      className={[
                        "cinema-step",
                        visible ? "is-visible" : "",
                        active ? "is-active" : "",
                        visible && !active ? "is-history" : "",
                      ].filter(Boolean).join(" ")}
                      key={step.number}
                    >
                        <span className="step-index"><b>{step.number}</b><small>{step.type}</small></span>
                        <div className="step-copy"><p>{step.title}</p><div className="row-detail"><code>{step.detail}</code></div></div>
                    </div>
                  );
                })}
              </div>
              <div className="verification-output">
                <span className="verification-mark"><Check size={13} /></span>
                  <div><strong>Verification passed</strong><p>/settings route created successfully</p></div>
              </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
      <div className="execution-comparison">
        <span>Original execution <strong>failed</strong></span><i />
        <span>Forkpoint #02 corrected</span><i />
        <span>Corrected execution <strong>verified</strong></span>
      </div>
    </div>
  );
}
const eventMeta: Record<
  TraceEvent["type"],
  { label: string; short: string; className: string }
> = {
  user_request: { label: "Request", short: "REQ", className: "request" },
  assumption: { label: "Assumption", short: "ASM", className: "assumption" },
  reasoning_summary: { label: "Decision", short: "DEC", className: "decision" },
  tool_call: { label: "Tool call", short: "RUN", className: "tool" },
  tool_result: { label: "Tool result", short: "OUT", className: "tool" },
  file_read: { label: "File read", short: "READ", className: "evidence" },
  file_edit: { label: "File edit", short: "EDIT", className: "edit" },
  observation: { label: "Evidence", short: "OBS", className: "evidence" },
  test_result: { label: "Test result", short: "TEST", className: "test" },
  final_result: { label: "Final result", short: "END", className: "result" },
};

function eventTitle(event: TraceEvent) {
  return (
    event.title ||
    event.path ||
    event.command ||
    event.content?.split(/[.!?]/)[0] ||
    event.contentSummary ||
    eventMeta[event.type].label
  );
}

function eventDetail(event: TraceEvent) {
  return (
    event.content ||
    event.contentSummary ||
    event.command ||
    (event.path ? `File: ${event.path}` : "No additional detail.")
  );
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function conciseAssumption(value: string) {
  const firstClause = value.split(/,\s+(?:so|therefore|because)\b/i)[0]?.trim() ?? value;
  return /[.!?]$/.test(firstClause) ? firstClause : `${firstClause}.`;
}

type DebuggerTreeMapProps = {
  trace: AgentTrace;
  analysis: Analysis;
  selectedId: string | null;
  branchGenerated: boolean;
  verification: Verification | null;
  onSelect: (eventId: string) => void;
};

type TreeNodeKind = "request" | "forkpoint" | "failure" | "evidence" | "finding" | "final" | "preview" | "corrected" | "verified";
type TreeNodeData = Record<string, unknown> & {
  eventId?: string;
  kind: TreeNodeKind;
  meta: string;
  number?: string;
  title: string;
  detail?: string;
  leftHandle?: boolean;
  rightHandle?: boolean;
};
type TreeFlowNode = Node<TreeNodeData, "debuggerTreeNode">;

function DebuggerTreeNodeView({ data, selected }: NodeProps<TreeFlowNode>) {
  return (
    <div className={`flow-debugger-node flow-debugger-node--${data.kind}${selected ? " is-selected" : ""}`}>
      <Handle id="target-top" className="flow-node-handle" type="target" position={Position.Top} />
      {data.leftHandle && <Handle id="target-left" className="flow-node-handle" type="target" position={Position.Left} />}
      <span className="flow-debugger-meta"><span>{data.meta}</span>{data.number && <code>#{data.number}</code>}</span>
      <strong>{data.title}</strong>
      {data.detail && <small>{data.detail}</small>}
      <Handle id="source-bottom" className="flow-node-handle" type="source" position={Position.Bottom} />
      {data.rightHandle && <Handle id="source-right" className="flow-node-handle" type="source" position={Position.Right} />}
    </div>
  );
}

const debuggerTreeNodeTypes = { debuggerTreeNode: DebuggerTreeNodeView };
const treeDefaultPositions: Record<string, { x: number; y: number }> = {
  request: { x: 250, y: 8 },
  forkpoint: { x: 240, y: 94 },
  "file-evidence": { x: 0, y: 188 },
  decision: { x: 250, y: 188 },
  "first-edit": { x: 250, y: 272 },
  "second-edit": { x: 250, y: 356 },
  "tool-failure": { x: 80, y: 440 },
  "framework-evidence": { x: 420, y: 440 },
  "test-failure": { x: 80, y: 524 },
  finding: { x: 420, y: 524 },
  final: { x: 250, y: 608 },
  preview: { x: 590, y: 120 },
  "corrected-context": { x: 590, y: 188 },
  "corrected-inspect": { x: 590, y: 272 },
  "corrected-create": { x: 590, y: 356 },
  "corrected-verify": { x: 590, y: 440 },
  "corrected-result": { x: 590, y: 524 },
};

function DebuggerTreeMap({
  trace,
  analysis,
  selectedId,
  branchGenerated,
  verification,
  onSelect,
}: DebuggerTreeMapProps) {
  const isDemo = isBuiltInDemoTrace(trace);
  const byId = (id: string) => trace.events.find((event) => event.id === id);
  const requestEvent = trace.events.find((event) => event.type === "user_request") ?? trace.events[0];
  const forkpointEvent = byId(analysis.firstErrorEventId ?? "") ?? trace.events.find((event) => event.type === "assumption");
  const affectedEvents = trace.events.filter((event) => analysis.affectedEventIds.includes(event.id));
  const evidenceEvents = analysis.supportingEvidenceEventIds
    .map(byId)
    .filter((event): event is TraceEvent => Boolean(event));
  const pick = (demoId: string, predicate: (event: TraceEvent) => boolean, used: Set<string>) => {
    const event = (isDemo ? byId(demoId) : undefined) ?? affectedEvents.find((candidate) => !used.has(candidate.id) && predicate(candidate));
    if (event) used.add(event.id);
    return event;
  };
  const used = new Set<string>();
  const decisionEvent = pick("event-4", (event) => event.type === "reasoning_summary", used);
  const firstEditEvent = pick("event-5", (event) => event.type === "file_edit", used);
  const secondEditEvent = pick("event-6", (event) => event.type === "file_edit", used);
  const toolFailureEvent = pick("event-8", (event) => event.type === "tool_result" && event.status === "failed", used);
  const testFailureEvent = pick("event-10", (event) => event.type === "test_result", used);
  const finalFailureEvent = pick("event-11", (event) => event.type === "final_result", used) ?? affectedEvents.at(-1);
  const fileEvidenceEvent = (isDemo ? byId("event-3") : undefined) ?? evidenceEvents.find((event) => event.type === "file_read");
  const frameworkEvidenceEvent = (isDemo ? byId("event-9") : undefined) ?? evidenceEvents.find((event) => event.id !== fileEvidenceEvent?.id);
  const requestTitle = isDemo ? "Add a settings page" : eventTitle(requestEvent);
  const forkpointTitle = isDemo ? "Assumed React Router" : eventTitle(forkpointEvent ?? requestEvent);
  const correctedTitle = isDemo
    ? "Next.js App Router"
    : conciseAssumption(analysis.correctedAssumption).replace(/[.!?]$/, "");
  const flowRef = useRef<ReactFlowInstance<TreeFlowNode, Edge> | null>(null);
  const customizedRef = useRef(false);
  const draggedRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const traceIdRef = useRef(trace.traceId);
  const [showHint, setShowHint] = useState(true);

  const makeNode = useCallback((
    id: string,
    positionKey: string,
    kind: TreeNodeKind,
    meta: string,
    number: string | undefined,
    title: string,
    eventId?: string,
    detail?: string,
    handles: { left?: boolean; right?: boolean } = {},
  ): TreeFlowNode => ({
    id,
    type: "debuggerTreeNode",
    position: treeDefaultPositions[positionKey],
    draggable: true,
    selectable: true,
    selected: selectedId === eventId,
    data: { eventId, kind, meta, number, title, detail, leftHandle: handles.left, rightHandle: handles.right },
    style: { width: kind === "forkpoint" ? 240 : 220, minHeight: kind === "forkpoint" ? 64 : 56 },
  }), [selectedId]);

  const buildNodes = useCallback((): TreeFlowNode[] => {
    const result: TreeFlowNode[] = [
      makeNode(requestEvent.id, "request", "request", "Request", "01", requestTitle, requestEvent.id),
      makeNode(forkpointEvent?.id ?? "forkpoint", "forkpoint", "forkpoint", "Forkpoint", "02", forkpointTitle, forkpointEvent?.id, "Unsupported assumption", { right: true }),
      makeNode(fileEvidenceEvent?.id ?? "file-evidence", "file-evidence", "evidence", "File read", "03", isDemo ? "src/App.tsx" : eventTitle(fileEvidenceEvent ?? requestEvent), fileEvidenceEvent?.id, undefined, { right: true }),
      makeNode(decisionEvent?.id ?? "decision", "decision", "failure", "Decision", "04", isDemo ? "Wrong routing model" : eventTitle(decisionEvent ?? requestEvent), decisionEvent?.id, undefined, { left: true }),
      makeNode(firstEditEvent?.id ?? "first-edit", "first-edit", "failure", "File edit", "05", isDemo ? "src/pages/Settings.tsx" : eventTitle(firstEditEvent ?? requestEvent), firstEditEvent?.id),
      makeNode(secondEditEvent?.id ?? "second-edit", "second-edit", "failure", "File edit", "06", isDemo ? "src/App.tsx" : eventTitle(secondEditEvent ?? requestEvent), secondEditEvent?.id),
      makeNode(toolFailureEvent?.id ?? "tool-failure", "tool-failure", "failure", "Tool result", "08", isDemo ? "Missing dependency" : eventTitle(toolFailureEvent ?? requestEvent), toolFailureEvent?.id),
      makeNode(frameworkEvidenceEvent?.id ?? "framework-evidence", "framework-evidence", "evidence", "Evidence", "09", isDemo ? "Next.js App Router" : eventTitle(frameworkEvidenceEvent ?? requestEvent), frameworkEvidenceEvent?.id),
      makeNode(testFailureEvent?.id ?? "test-failure", "test-failure", "failure", "Test result", "10", isDemo ? "Route failed" : eventTitle(testFailureEvent ?? requestEvent), testFailureEvent?.id),
      makeNode("analysis-finding", "finding", "finding", "Causal finding", undefined, "Router assumption contradicted", frameworkEvidenceEvent?.id),
      makeNode(finalFailureEvent?.id ?? "final", "final", "final", "Final result", "11", isDemo ? "Build failed" : eventTitle(finalFailureEvent ?? requestEvent), finalFailureEvent?.id),
    ];
    if (!branchGenerated) {
      result.push(makeNode("corrected-preview", "preview", "preview", "Corrected branch", undefined, "Generate replay", undefined, undefined, { left: true }));
    } else {
      result.push(
        makeNode("corrected-context", "corrected-context", "corrected", "Corrected context", undefined, correctedTitle, undefined, undefined, { left: true }),
        makeNode("corrected-inspect", "corrected-inspect", "corrected", "Replay", "01", "Inspect framework"),
        makeNode("corrected-create", "corrected-create", "corrected", "File edit", "02", "Create correct route"),
        makeNode("corrected-verify", "corrected-verify", "corrected", "Verification", "03", "Run verifier"),
        makeNode("corrected-result", "corrected-result", verification?.passed ? "verified" : "corrected", "Corrected result", undefined, verification?.passed ? "Verification passed" : "Ready to verify", undefined, verification?.passed ? "/settings route created" : undefined),
      );
    }
    return result;
  }, [branchGenerated, correctedTitle, decisionEvent, fileEvidenceEvent, finalFailureEvent, firstEditEvent, forkpointEvent, forkpointTitle, frameworkEvidenceEvent, isDemo, makeNode, requestEvent, requestTitle, secondEditEvent, testFailureEvent, toolFailureEvent, verification?.passed]);

  const [nodes, setNodes, onNodesChange] = useNodesState<TreeFlowNode>(buildNodes());

  const edges = useMemo(() => {
    const edge = (id: string, source: string, target: string, kind: "neutral" | "failure" | "evidence" | "corrected" | "preview", sourceHandle = "source-bottom", targetHandle = "target-top"): Edge => ({
      id, source, target, sourceHandle, targetHandle, type: "smoothstep", className: `flow-tree-edge flow-tree-edge--${kind}`,
      style: { stroke: kind === "failure" ? "#bf8989" : kind === "evidence" ? "#8f99b7" : kind === "corrected" || kind === "preview" ? "#7184ca" : "#9da5ae", strokeWidth: 1.45, strokeDasharray: kind === "preview" ? "4 6" : undefined },
    });
    const result = [
      edge("request-forkpoint", requestEvent.id, forkpointEvent?.id ?? "forkpoint", "neutral"),
      edge("forkpoint-decision", forkpointEvent?.id ?? "forkpoint", decisionEvent?.id ?? "decision", "failure"),
      edge("file-evidence-decision", fileEvidenceEvent?.id ?? "file-evidence", decisionEvent?.id ?? "decision", "evidence", "source-right", "target-left"),
      edge("decision-edit", decisionEvent?.id ?? "decision", firstEditEvent?.id ?? "first-edit", "failure"),
      edge("edit-edit", firstEditEvent?.id ?? "first-edit", secondEditEvent?.id ?? "second-edit", "failure"),
      edge("edit-tool", secondEditEvent?.id ?? "second-edit", toolFailureEvent?.id ?? "tool-failure", "failure"),
      edge("edit-evidence", secondEditEvent?.id ?? "second-edit", frameworkEvidenceEvent?.id ?? "framework-evidence", "evidence"),
      edge("tool-test", toolFailureEvent?.id ?? "tool-failure", testFailureEvent?.id ?? "test-failure", "failure"),
      edge("evidence-finding", frameworkEvidenceEvent?.id ?? "framework-evidence", "analysis-finding", "evidence"),
      edge("test-final", testFailureEvent?.id ?? "test-failure", finalFailureEvent?.id ?? "final", "failure"),
      edge("finding-final", "analysis-finding", finalFailureEvent?.id ?? "final", "evidence"),
    ];
    if (!branchGenerated) result.push(edge("forkpoint-preview", forkpointEvent?.id ?? "forkpoint", "corrected-preview", "preview", "source-right", "target-left"));
    else {
      result.push(
        edge("forkpoint-corrected", forkpointEvent?.id ?? "forkpoint", "corrected-context", "corrected", "source-right", "target-left"),
        edge("corrected-1", "corrected-context", "corrected-inspect", "corrected"),
        edge("corrected-2", "corrected-inspect", "corrected-create", "corrected"),
        edge("corrected-3", "corrected-create", "corrected-verify", "corrected"),
        edge("corrected-4", "corrected-verify", "corrected-result", "corrected"),
      );
    }
    return result;
  }, [branchGenerated, decisionEvent, fileEvidenceEvent, finalFailureEvent, firstEditEvent, forkpointEvent, frameworkEvidenceEvent, requestEvent.id, secondEditEvent, testFailureEvent, toolFailureEvent]);

  const setDefaultViewport = useCallback((instance: ReactFlowInstance<TreeFlowNode, Edge> | null) => {
    if (!instance) return;
    const canvas = document.querySelector<HTMLElement>(".flow-wrap");
    if (!canvas) return;
    const zoom = Math.min(.9, Math.max(.58, Math.min((canvas.clientWidth - 28) / 840, (canvas.clientHeight - 24) / 680)));
    void instance.setViewport({ x: canvas.clientWidth / 2 - 410 * zoom, y: canvas.clientHeight / 2 - 330 * zoom, zoom }, { duration: 260 });
  }, []);

  useEffect(() => {
    const defaults = buildNodes();
    if (traceIdRef.current !== trace.traceId) {
      traceIdRef.current = trace.traceId;
      customizedRef.current = false;
      setNodes(defaults);
      window.requestAnimationFrame(() => setDefaultViewport(flowRef.current));
      return;
    }
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]));
      const fork = currentById.get(forkpointEvent?.id ?? "forkpoint");
      return defaults.map((node) => {
        const existing = currentById.get(node.id);
        if (existing) return { ...node, position: existing.position, dragging: existing.dragging };
        if (node.id.startsWith("corrected-") && fork && customizedRef.current) {
          return { ...node, position: { x: fork.position.x + 350, y: node.position.y } };
        }
        return node;
      });
    });
  }, [buildNodes, forkpointEvent?.id, setDefaultViewport, setNodes, trace.traceId]);

  useEffect(() => {
    if (!branchGenerated) return;
    window.requestAnimationFrame(() => setDefaultViewport(flowRef.current));
  }, [branchGenerated, setDefaultViewport]);

  return (
    <div className="interactive-tree-map">
      <ReactFlow<TreeFlowNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={debuggerTreeNodeTypes}
        onNodesChange={onNodesChange}
        nodesDraggable
        nodesConnectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        minZoom={0.5}
        maxZoom={1.35}
        defaultViewport={{ x: 16, y: 8, zoom: 0.72 }}
        onInit={(instance) => { flowRef.current = instance; setDefaultViewport(instance); }}
        onNodeDragStart={(_, node) => {
          setShowHint(false);
          draggedRef.current = null;
          dragStartRef.current = { id: node.id, x: node.position.x, y: node.position.y };
        }}
        onNodeDragStop={(_, node) => {
          const start = dragStartRef.current;
          if (start && start.id === node.id && Math.hypot(node.position.x - start.x, node.position.y - start.y) > 4) {
            customizedRef.current = true;
            draggedRef.current = node.id;
          }
          dragStartRef.current = null;
        }}
        onNodeClick={(_, node) => {
          if (draggedRef.current === node.id) { draggedRef.current = null; return; }
          const eventId = node.data.eventId;
          if (eventId) onSelect(eventId);
          else document.querySelector(".branch-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        onMoveStart={() => setShowHint(false)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e0e4e9" gap={24} size={1} />
        <Controls showInteractive={false}>
          <ControlButton
            title="Reset layout"
            aria-label="Reset graph layout"
            onClick={() => {
              customizedRef.current = false;
              setNodes(buildNodes());
              setDefaultViewport(flowRef.current);
            }}
          ><RotateCcw size={14} /></ControlButton>
        </Controls>
      </ReactFlow>
      {showHint && <span className="tree-drag-hint">Drag nodes to rearrange</span>}
      <button
        className="focus-forkpoint"
        onClick={() => {
          const fork = nodes.find((node) => node.id === (analysis.firstErrorEventId ?? "forkpoint"));
          if (fork) void flowRef.current?.setCenter(fork.position.x + 120, fork.position.y + 32, { zoom: .95, duration: 380 });
          if (analysis.firstErrorEventId) onSelect(analysis.firstErrorEventId);
        }}
      ><CircleDot size={14} /> Focus Forkpoint</button>
    </div>
  );
}

export function ForkpointWorkspace() {
  const [trace, setTrace] = useState<AgentTrace | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mode, setMode] = useState<AnalysisMode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correctedAssumption, setCorrectedAssumption] = useState("");
  const [branchPlan, setBranchPlan] = useState<string[]>([]);
  const [branchGenerated, setBranchGenerated] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loading, setLoading] = useState<"analysis" | "branch" | "verify" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [statementVisible, setStatementVisible] = useState(false);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [showAffectedEvents, setShowAffectedEvents] = useState(false);
  const [paidCreditsConfirmed, setPaidCreditsConfirmed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const statementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (trace || !statementRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => setStatementVisible(entry.isIntersecting),
      { threshold: 0.18 },
    );
    observer.observe(statementRef.current);
    return () => observer.disconnect();
  }, [trace]);

  const selectedEvent = trace?.events.find((event) => event.id === selectedId) ?? null;
  const presentation = useMemo(
    () => (trace ? getTracePresentation(trace) : null),
    [trace],
  );
  const loadTraceLocally = useCallback((nextTrace: AgentTrace) => {
    const localAnalysis = getLocalDeterministicAnalysis(nextTrace);
    setTrace(nextTrace);
    setAnalysis(localAnalysis);
    setMode(localAnalysis ? "demo" : null);
    setVerification(null);
    setBranchPlan([]);
    setBranchGenerated(false);
    setBranchError(null);
    setError(null);
    setLoading(null);
    setPaidCreditsConfirmed(false);
    setCorrectedAssumption(localAnalysis?.correctedAssumption ?? "");
    setSelectedId(
      localAnalysis?.firstErrorEventId || nextTrace.events[0]?.id || null,
    );
  }, []);

  const runGptAnalysis = useCallback(async () => {
    if (!trace || isBuiltInDemoTrace(trace) || !paidCreditsConfirmed || loading !== null) {
      return;
    }

    setError(null);
    setLoading("analysis");
    try {
      const payload = await requestPaidAnalysis(trace);
      setAnalysis(payload.analysis);
      setMode(payload.mode);
      setCorrectedAssumption(payload.analysis.correctedAssumption);
      setBranchPlan([]);
      setBranchGenerated(false);
      setBranchError(null);
      setSelectedId(
        payload.analysis.firstErrorEventId || trace.events[0]?.id || null,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    } finally {
      setLoading(null);
    }
  }, [loading, paidCreditsConfirmed, trace]);

  async function loadFile(file: File) {
    setError(null);
    if (file.type && file.type !== "application/json" && !file.name.endsWith(".json")) {
      setError("Upload a JSON trace file.");
      return;
    }
    if (file.size > 300_000) {
      setError("Trace exceeds the 300 KB upload limit.");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      loadTraceLocally(normalizeTrace(parsed));
    } catch (caught) {
      setError(
        caught instanceof Error ? `Trace validation failed: ${caught.message}` : "Invalid trace.",
      );
    }
  }

  async function generateBranch() {
    if (!trace || !analysis || loading !== null) return;
    setError(null);
    setBranchError(null);
    setVerification(null);
    setBranchGenerated(false);
    setBranchPlan([]);
    setLoading("branch");
    try {
      const minimumPendingTime = new Promise<void>((resolve) => window.setTimeout(resolve, 350));
      let nextPlan = analysis.alternativePlan;

      if (isBuiltInDemoTrace(trace)) {
        const [response] = await Promise.all([
          fetch("/api/branch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trace, correctedAssumption }),
          }),
          minimumPendingTime,
        ]);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Branch generation failed.");
        }
        nextPlan = Array.isArray(payload.plan) ? payload.plan : [];
      } else {
        await minimumPendingTime;
      }

      setBranchPlan(prepareBranchPlan({ ...analysis, alternativePlan: nextPlan }));
      setBranchGenerated(true);
    } catch (caught) {
      setBranchError(
        caught instanceof Error ? caught.message : "Branch generation failed.",
      );
    } finally {
      setLoading(null);
    }
  }

  async function runVerification() {
    if (!trace || !presentation?.verificationAvailable) return;
    setLoading("verify");
    setError(null);
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceId: trace.traceId, correctedAssumption }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Verification failed.");
      setVerification(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification failed.");
    } finally {
      setLoading(null);
    }
  }

  function reset() {
    setTrace(null);
    setAnalysis(null);
    setMode(null);
    setSelectedId(null);
    setCorrectedAssumption("");
    setBranchPlan([]);
    setBranchGenerated(false);
    setBranchError(null);
    setVerification(null);
    setError(null);
    setStatementVisible(false);
    setShowFullAnalysis(false);
    setShowAffectedEvents(false);
    setPaidCreditsConfirmed(false);
  }

  return (
    <main className="app-shell">
      <header className={`topbar ${trace ? "topbar--workspace" : "topbar--landing"}`}>
        <button className="brand" onClick={reset} aria-label="Reset Forkpoint">
          <span className="brand-mark"><ForkpointMark size={18} /></span>
          <span>Forkpoint</span>
          <span className="build-tag">BUILD WEEK</span>
        </button>
        <div className="topbar-status">
          {trace ? (
            <>
              <span className={`status-dot ${analysis ? "ready" : ""}`} />
              <span className="mono">{trace.traceId}</span>
              <span className="divider" />
              <span>{analysis ? "Causal analysis ready" : "Trace loaded"}</span>
              {mode && (
                <span className={`mode-badge ${mode}`}>
                  {mode === "demo" ? "Demo Analysis" : "GPT-5.6 Analysis"}
                </span>
              )}
              <button className="icon-button" onClick={reset} title="Reset">
                <RotateCcw size={15} />
              </button>
            </>
          ) : (
            <span>AI agent execution debugger</span>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error">
            <X size={15} />
          </button>
        </div>
      )}

      {!trace ? (
        <div className={`landing-shell ${statementVisible ? "statement-in-view" : ""}`}>
          <section className="empty-state" aria-labelledby="landing-product-label">
            <div className="empty-eyebrow" id="landing-product-label">
              <CircleDot size={13} /> AI AGENT TIME-TRAVEL DEBUGGER
            </div>
            <HeroBranchPreview />
            <div className="landing-scroll-cue" aria-hidden="true">
              <span>Scroll to explore</span>
              <i />
            </div>
          </section>

          <section
            className={`landing-statement ${statementVisible ? "is-visible" : ""}`}
            ref={statementRef}
            aria-labelledby="landing-headline"
          >
            <div className="statement-inner">
              <div className="statement-eyebrow reveal-step">THE CAUSAL DEBUGGER FOR AI AGENTS</div>
              <h1 id="landing-headline">
                <span className="reveal-step">Find the first wrong decision.</span>
                <span className="reveal-step">Replay what should have happened.</span>
              </h1>
              <p className="reveal-step">
                Trace an agent&apos;s reasoning, isolate the earliest unsupported assumption,
                and replay a corrected decision branch.
              </p>
              <div className="empty-actions reveal-step">
                <button className="primary-button" onClick={() => loadTraceLocally(demoTrace)}>
                  <Play size={16} fill="currentColor" />
                  Start debugging
                </button>
                <button className="secondary-button" onClick={() => fileInput.current?.click()}>
                  <Upload size={16} />
                  Import trace
                </button>
              </div>
              <div className="empty-proof reveal-step">
                <div><Search size={17} /><span><strong>Diagnose</strong>Find the first causal error</span></div>
                <div><GitBranch size={17} /><span><strong>Branch</strong>Replay with corrected context</span></div>
                <div><ShieldCheck size={17} /><span><strong>Verify</strong>Test the corrected outcome</span></div>
              </div>
            </div>
          </section>
          <input
            ref={fileInput}
            hidden
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
              event.target.value = "";
            }}
          />
        </div>
      ) : (
        <>
          <section className="workspace-grid">
            <aside className="panel timeline-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">TRACE</span>
                  <h2>Debugger Timeline</h2>
                </div>
                <span className="count-badge">{trace.events.length}</span>
              </div>
              <div className="timeline-list">
                {trace.events.map((event, index) => {
                  const isForkpoint = event.id === analysis?.firstErrorEventId;
                  const isAffected = analysis?.affectedEventIds.includes(event.id);
                  return (
                    <button
                      key={event.id}
                      title={`${eventTitle(event)} — ${eventDetail(event)}`}
                      className={`timeline-item ${selectedId === event.id ? "selected" : ""} ${
                        isForkpoint ? "forkpoint" : ""
                      } ${isAffected ? "affected" : ""}`}
                      onClick={() => setSelectedId(event.id)}
                    >
                      <span className="timeline-rail">
                        <span className="timeline-index">{String(index + 1).padStart(2, "0")}</span>
                      </span>
                      <span className="timeline-copy">
                        <span className="timeline-meta">
                          <span className={`type-pill ${eventMeta[event.type].className}`}>
                            {isForkpoint ? "FORKPOINT" : eventMeta[event.type].label}
                          </span>
                          <time>{formatTime(event.timestamp)}</time>
                        </span>
                        <strong>{eventTitle(event)}</strong>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="panel graph-panel">
              <div className="panel-header graph-header">
                <div>
                  <span className="panel-kicker">CAUSAL MAP</span>
                  <h2>Causal Branch Map</h2>
                </div>
                <div className="legend">
                  <span><i className="legend-neutral" />Evidence</span>
                  <span><i className="legend-fail" />Failed</span>
                  <span><i className="legend-corrected" />Corrected</span>
                </div>
              </div>
              {loading === "analysis" ? (
                <div className="loading-state">
                  <LoaderCircle className="spin" size={24} />
                  <strong>Tracing causal dependencies</strong>
                  <span>Locating the earliest unsupported decision…</span>
                </div>
              ) : analysis ? (
                <div className="graph-analysis-surface">
                  <div className="flow-wrap">
                    <DebuggerTreeMap
                      trace={trace}
                      analysis={analysis}
                      selectedId={selectedId}
                      branchGenerated={branchGenerated}
                      verification={verification}
                      onSelect={setSelectedId}
                    />
                  </div>
                  <button
                    className="replay-shortcut"
                    onClick={() => document.querySelector(".branch-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  >
                    <span><b>Corrected context</b>{correctedAssumption.replace(/\.$/, "")}</span>
                    <span>{verification?.passed ? "Verification passed" : branchGenerated ? "Run safe verification" : "Generate branch"}<ArrowRight size={14} /></span>
                  </button>
                </div>
              ) : (
                <div className="paid-analysis-gate">
                  <div className="paid-analysis-copy">
                    <Sparkles size={24} />
                    <strong>Custom trace loaded — no analysis has run</strong>
                    <span>
                      Running GPT analysis sends this trace to the configured OpenAI API and uses paid API credits.
                      Importing, refreshing, and viewing the trace never starts this request.
                    </span>
                  </div>
                  <label className="paid-analysis-confirmation">
                    <input
                      type="checkbox"
                      checked={paidCreditsConfirmed}
                      onChange={(event) => setPaidCreditsConfirmed(event.target.checked)}
                    />
                    <span>I understand this action uses paid API credits.</span>
                  </label>
                  <button
                    className="primary-button"
                    onClick={() => void runGptAnalysis()}
                    disabled={!paidCreditsConfirmed || loading !== null}
                  >
                    <Sparkles size={16} />
                    Run GPT analysis
                  </button>
                </div>
              )}
            </section>

            <aside className="panel diagnosis-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">INSPECTOR</span>
                  <h2>Evidence & diagnosis</h2>
                </div>
              </div>
              {analysis && selectedEvent ? (
                <div className="inspector-scroll">
                  {selectedEvent.id !== analysis.firstErrorEventId && (
                    <section className="selected-event-card">
                      <div className="selected-event-top">
                        <span className={`type-pill ${eventMeta[selectedEvent.type].className}`}>
                          {eventMeta[selectedEvent.type].label}
                        </span>
                        <span><span className="mono">{selectedEvent.id}</span><time>{formatTime(selectedEvent.timestamp)}</time></span>
                      </div>
                      <h3>{eventTitle(selectedEvent)}</h3>
                      <p>{eventDetail(selectedEvent)}</p>
                      {selectedEvent.path && (
                        <code><FileCode2 size={13} /> {selectedEvent.path}</code>
                      )}
                      <div className="selected-event-status">
                        <span>Causal status</span>
                        <strong>
                          {analysis.affectedEventIds.includes(selectedEvent.id)
                            ? "Downstream impact"
                            : analysis.supportingEvidenceEventIds.includes(selectedEvent.id)
                              ? "Supporting evidence"
                              : "Execution context"}
                        </strong>
                      </div>
                    </section>
                  )}

                  {selectedEvent.id === analysis.firstErrorEventId && (
                    <section className="diagnosis-block">
                      <div className="diagnosis-title">
                        <span className="diagnosis-node"><span />{selectedEvent.id.replace("event-", "#")}</span>
                        <span>FORKPOINT</span>
                      </div>
                      <h3>{analysis.firstErrorTitle}</h3>
                      <blockquote>“{conciseAssumption(eventDetail(selectedEvent))}”</blockquote>
                      <dl className="diagnosis-metrics">
                        <div>
                          <dt>Assumption support</dt>
                          <dd>{presentation?.verificationAvailable ? "23%" : selectedEvent.evidence?.length ? `${selectedEvent.evidence.length} cited` : "Low"}</dd>
                        </div>
                        <div>
                          <dt>Diagnosis confidence</dt>
                          <dd>{Math.round(analysis.confidence * 100)}%</dd>
                        </div>
                        <div>
                          <dt>Downstream impact</dt>
                          <dd>{analysis.affectedEventIds.length} affected events</dd>
                        </div>
                      </dl>
                      <h4>Why this is the Forkpoint</h4>
                      <p className={`diagnosis-explanation ${showFullAnalysis ? "is-expanded" : ""}`}>
                        {analysis.firstErrorExplanation}
                      </p>
                      <button
                        className="inspector-text-button"
                        onClick={() => setShowFullAnalysis((visible) => !visible)}
                      >
                        {showFullAnalysis ? "Show concise analysis" : "Show full analysis"}
                      </button>
                    </section>
                  )}

                  {selectedEvent.id === analysis.firstErrorEventId && analysis.insufficientEvidence && (
                    <section className="insufficient-block">
                      <AlertTriangle size={16} />
                      <div>
                        <strong>Insufficient evidence</strong>
                        <p>The trace does not support a confident causal diagnosis.</p>
                      </div>
                    </section>
                  )}

                  {selectedEvent.id === analysis.firstErrorEventId && (
                    <>
                      <section className="evidence-block">
                        <h3>Evidence</h3>
                        {(presentation?.verificationAvailable
                          ? ["event-3", "event-9"]
                          : analysis.supportingEvidenceEventIds.slice(0, 3)
                        ).map((id) => {
                          const event = trace.events.find((item) => item.id === id);
                          if (!event) return null;
                          return (
                            <button key={id} onClick={() => setSelectedId(id)}>
                              <span className="evidence-icon"><Braces size={14} /></span>
                              <span><strong>{eventTitle(event)}</strong><small>{id}</small></span>
                              <ChevronRight size={14} />
                            </button>
                          );
                        })}
                      </section>

                      <section className="propagation-block">
                        <div className="propagation-summary">
                          <div><h3>Propagation</h3><p>{analysis.affectedEventIds.length} affected events</p></div>
                          <button
                            className="inspector-text-button"
                            onClick={() => setShowAffectedEvents((visible) => !visible)}
                          >
                            {showAffectedEvents ? "Hide affected events" : "View affected events"}
                          </button>
                        </div>
                        {showAffectedEvents && (
                          <div className="impact-strip">
                            {analysis.affectedEventIds.slice(0, 9).map((id) => (
                              <button key={id} onClick={() => setSelectedId(id)}>
                                {id.replace("event-", "")}
                              </button>
                            ))}
                          </div>
                        )}
                      </section>
                    </>
                  )}
                </div>
              ) : (
                <div className="loading-state compact">
                  <FileInput size={22} />
                  <strong>Select a trace event</strong>
                  <span>Evidence and causal context will appear here.</span>
                </div>
              )}
            </aside>
          </section>

          {analysis && (
            <div className="branch-section-shell">
            <section className="branch-section">
              <div className="branch-heading">
                <div>
                  <span className="panel-kicker">{presentation?.sectionKicker}</span>
                  <h2>{presentation?.sectionTitle}</h2>
                </div>
                <span className="scope-badge">
                  <ShieldCheck size={14} /> {presentation?.scopeLabel}
                </span>
              </div>

              <div className="correction-row">
                <label>
                  <span>CORRECTED CONTEXT</span>
                  <input
                    value={correctedAssumption}
                    onChange={(event) => setCorrectedAssumption(event.target.value)}
                  />
                </label>
                <button
                  className="secondary-button"
                  onClick={() => void generateBranch()}
                  disabled={loading !== null || correctedAssumption.trim().length < 3}
                >
                  {loading === "branch" ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                  {loading === "branch" ? "Generating branch…" : "Generate branch"}
                </button>
                <button
                  className="verify-button"
                  onClick={runVerification}
                  disabled={loading !== null || !branchGenerated || !presentation?.verificationAvailable}
                  title={
                    !presentation?.verificationAvailable
                      ? "Safe verification is available only for the built-in fixture."
                      : !branchGenerated
                        ? "Generate the corrected branch before running verification."
                        : undefined
                  }
                >
                  {loading === "verify" ? <LoaderCircle className="spin" size={16} /> : <Play size={16} fill="currentColor" />}
                  {presentation?.verificationButtonLabel}
                </button>
              </div>

              {branchError && (
                <div className="branch-error" role="alert">
                  <AlertTriangle size={15} />
                  <span>{branchError}</span>
                </div>
              )}

              <div className="branch-grid">
                <article className="branch-card original-branch">
                  <header>
                    <span className="branch-icon fail"><X size={16} /></span>
                    <div><span>ORIGINAL BRANCH</span><h3>{presentation?.originalBranchLabel}</h3></div>
                    <span className="branch-status failed">FAILED</span>
                  </header>
                  <ol>
                    {trace.events
                      .filter((event) => analysis.affectedEventIds.includes(event.id))
                      .slice(0, 5)
                      .map((event) => (
                        <li key={event.id}>
                          <span>{event.id.replace("event-", "")}</span>
                          <p>{eventTitle(event)}</p>
                        </li>
                      ))}
                  </ol>
                  <footer>{trace.finalOutcome.summary}</footer>
                </article>

                <article className="branch-card corrected-branch">
                  <header>
                    <span className="branch-icon pass"><GitBranch size={16} /></span>
                    <div><span>CORRECTED BRANCH</span><h3>{presentation?.correctedBranchLabel}</h3></div>
                    <span className={`branch-status ${verification?.passed ? "passed" : "pending"}`}>
                      {verification?.passed
                        ? "VERIFIED"
                        : loading === "branch"
                          ? "GENERATING"
                          : branchGenerated
                            ? presentation?.verificationAvailable
                              ? "READY"
                              : "PLAN READY"
                            : "NOT GENERATED"}
                    </span>
                  </header>
                  {branchGenerated ? (
                    <ol>
                      {branchPlan.map((step, index) => (
                        <li key={`${index}-${step}`}>
                          <span>{index + 1}</span>
                          <p>{step}</p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="branch-placeholder" role={loading === "branch" ? "status" : undefined}>
                      {loading === "branch" ? <LoaderCircle className="spin" size={20} /> : <GitBranch size={20} />}
                      <strong>{loading === "branch" ? "Generating corrected execution" : "Corrected branch not generated"}</strong>
                      <span>
                        {loading === "branch"
                          ? "Building a deterministic plan from the corrected context…"
                          : "Select Generate branch to reveal the corrected execution plan."}
                      </span>
                    </div>
                  )}
                  <footer className={verification?.passed ? "verified-footer" : ""}>
                    {verification?.passed ? (
                      <><Check size={15} /> {verification.output}</>
                    ) : !branchGenerated ? (
                      <>Verification becomes available after branch generation.</>
                    ) : !presentation?.verificationAvailable ? (
                      <>Suggested verification: {analysis.verificationSuggestion}</>
                    ) : (
                      analysis.verificationSuggestion
                    )}
                  </footer>
                </article>
              </div>

              {verification && (
                <div className="verification-result">
                  <div className="outcome-shift">
                    <span className="outcome-fail">{verification.before}</span>
                    <ArrowRight size={22} />
                    <span className="outcome-pass">{verification.after}</span>
                  </div>
                  <div className="verification-checks">
                    {verification.checks.map((check) => (
                      <span key={check.label}>
                        <Check size={14} /> {check.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
