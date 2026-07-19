"use client";

import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
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
import { useCallback, useMemo, useRef, useState } from "react";
import { demoTrace, isBuiltInDemoTrace } from "@/lib/demo";
import { requestPaidAnalysis } from "@/lib/paid-analysis-client";
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

function collectRelated(
  id: string,
  edges: Analysis["propagationEdges"],
): Set<string> {
  const related = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.source === current && !related.has(edge.target)) {
        related.add(edge.target);
        queue.push(edge.target);
      }
      if (edge.target === current && !related.has(edge.source)) {
        related.add(edge.source);
        queue.push(edge.source);
      }
    }
  }
  return related;
}

function buildGraph(
  trace: AgentTrace,
  analysis: Analysis,
  selectedId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const eventMap = new Map(trace.events.map((event) => [event.id, event]));
  const graphIds = new Set(
    analysis.propagationEdges.flatMap((edge) => [edge.source, edge.target]),
  );
  if (analysis.firstErrorEventId) graphIds.add(analysis.firstErrorEventId);
  const related = selectedId
    ? collectRelated(selectedId, analysis.propagationEdges)
    : new Set<string>();

  const levels = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const id of graphIds) incoming.set(id, 0);
  for (const edge of analysis.propagationEdges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }
  const roots = [...graphIds].filter((id) => (incoming.get(id) ?? 0) === 0);
  const queue = roots.map((id) => ({ id, level: 0 }));
  while (queue.length) {
    const { id, level } = queue.shift()!;
    levels.set(id, Math.max(levels.get(id) ?? 0, level));
    for (const edge of analysis.propagationEdges.filter((item) => item.source === id)) {
      queue.push({ id: edge.target, level: level + 1 });
    }
  }

  const rows = new Map<number, string[]>();
  for (const id of graphIds) {
    const level = levels.get(id) ?? 0;
    rows.set(level, [...(rows.get(level) ?? []), id]);
  }

  const nodes = [...graphIds].flatMap((id) => {
    const event = eventMap.get(id);
    if (!event) return [];
    const level = levels.get(id) ?? 0;
    const row = rows.get(level) ?? [id];
    const rowIndex = row.indexOf(id);
    const isForkpoint = id === analysis.firstErrorEventId;
    const isSelected = id === selectedId;
    const isDimmed = selectedId !== null && !related.has(id);
    return [
      {
        id,
        position: {
          x: 300 + (rowIndex - (row.length - 1) / 2) * 220,
          y: level * 116 + 36,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          label: (
            <div className="graph-node-content">
              <div className="graph-node-kicker">
                <span>{isForkpoint ? "FORKPOINT" : eventMeta[event.type].label}</span>
                <span>{event.id.replace("event-", "#")}</span>
              </div>
              <strong>{eventTitle(event)}</strong>
            </div>
          ),
        },
        className: `graph-node graph-${eventMeta[event.type].className} ${
          isForkpoint ? "is-forkpoint" : ""
        } ${isSelected ? "is-selected" : ""} ${isDimmed ? "is-dimmed" : ""}`,
      },
    ];
  });

  const edges = analysis.propagationEdges.map((edge, index) => ({
    id: `edge-${index}`,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    animated: edge.source === analysis.firstErrorEventId,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: {
      stroke:
        edge.source === analysis.firstErrorEventId || edge.target === analysis.firstErrorEventId
          ? "#ef5b5b"
          : "#515765",
      strokeWidth: 1.5,
      opacity:
        selectedId && (!related.has(edge.source) || !related.has(edge.target)) ? 0.15 : 0.85,
    },
  }));
  return { nodes, edges };
}

export function ForkpointWorkspace() {
  const [trace, setTrace] = useState<AgentTrace | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mode, setMode] = useState<AnalysisMode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correctedAssumption, setCorrectedAssumption] = useState("");
  const [branchPlan, setBranchPlan] = useState<string[]>([]);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loading, setLoading] = useState<"analysis" | "branch" | "verify" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [paidCreditsConfirmed, setPaidCreditsConfirmed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const selectedEvent = trace?.events.find((event) => event.id === selectedId) ?? null;
  const presentation = useMemo(
    () => (trace ? getTracePresentation(trace) : null),
    [trace],
  );
  const graph = useMemo(
    () =>
      trace && analysis
        ? buildGraph(trace, analysis, selectedId)
        : { nodes: [], edges: [] },
    [trace, analysis, selectedId],
  );

  const loadTraceLocally = useCallback((nextTrace: AgentTrace) => {
    const localAnalysis = getLocalDeterministicAnalysis(nextTrace);
    setTrace(nextTrace);
    setAnalysis(localAnalysis);
    setMode(localAnalysis ? "demo" : null);
    setVerification(null);
    setBranchPlan(localAnalysis?.alternativePlan ?? []);
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
      setBranchPlan(payload.analysis.alternativePlan);
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

  function generateBranch() {
    if (!trace || !analysis || branchPlan.length === 0) return;
    setError(null);
    setVerification(null);
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
    setVerification(null);
    setError(null);
    setPaidCreditsConfirmed(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={reset} aria-label="Reset Forkpoint">
          <span className="brand-mark"><GitBranch size={17} /></span>
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
        <section className="empty-state">
          <div className="empty-eyebrow"><CircleDot size={14} /> EXECUTION FORENSICS</div>
          <h1>Find the moment<br />the agent went off course.</h1>
          <p>
            Import an observable agent trace. Forkpoint locates the earliest
            unsupported assumption, maps its downstream impact, and replays a
            corrected branch.
          </p>
          <div className="empty-actions">
            <button className="primary-button" onClick={() => loadTraceLocally(demoTrace)}>
              <Play size={16} fill="currentColor" />
              Load built-in investigation
            </button>
            <button className="secondary-button" onClick={() => fileInput.current?.click()}>
              <Upload size={16} />
              Import JSON trace
            </button>
          </div>
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
          <div className="empty-proof">
            <div><Search size={17} /><span><strong>Diagnose</strong> earliest causal error</span></div>
            <div><GitBranch size={17} /><span><strong>Branch</strong> with corrected context</span></div>
            <div><ShieldCheck size={17} /><span><strong>Verify</strong> in an isolated fixture</span></div>
          </div>
        </section>
      ) : (
        <>
          <section className="workspace-grid">
            <aside className="panel timeline-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">TRACE</span>
                  <h2>Execution timeline</h2>
                </div>
                <span className="count-badge">{trace.events.length}</span>
              </div>
              <div className="task-card">
                <span>ORIGINAL REQUEST</span>
                <p>{trace.task}</p>
              </div>
              <div className="timeline-list">
                {trace.events.map((event, index) => {
                  const isForkpoint = event.id === analysis?.firstErrorEventId;
                  const isAffected = analysis?.affectedEventIds.includes(event.id);
                  return (
                    <button
                      key={event.id}
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
                        <small>{eventDetail(event)}</small>
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
                  <h2>Decision graph</h2>
                </div>
                <div className="legend">
                  <span><i className="legend-neutral" />Evidence</span>
                  <span><i className="legend-fail" />Failure path</span>
                </div>
              </div>
              {loading === "analysis" ? (
                <div className="loading-state">
                  <LoaderCircle className="spin" size={24} />
                  <strong>Tracing causal dependencies</strong>
                  <span>Locating the earliest unsupported decision…</span>
                </div>
              ) : analysis ? (
                <div className="flow-wrap">
                  <ReactFlow
                    nodes={graph.nodes}
                    edges={graph.edges}
                    fitView
                    fitViewOptions={{ padding: 0.22 }}
                    minZoom={0.35}
                    maxZoom={1.5}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable
                    onNodeClick={(_, node) => setSelectedId(node.id)}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background color="#2b2e36" gap={24} size={1} />
                    <Controls showInteractive={false} />
                  </ReactFlow>
                  {analysis.firstErrorEventId && (
                    <button
                      className="focus-forkpoint"
                      onClick={() => setSelectedId(analysis.firstErrorEventId)}
                    >
                      <CircleDot size={14} /> Focus Forkpoint
                    </button>
                  )}
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
                  <section className={`selected-event-card ${
                    selectedEvent.id === analysis.firstErrorEventId ? "forkpoint-card" : ""
                  }`}>
                    <div className="selected-event-top">
                      <span className={`type-pill ${eventMeta[selectedEvent.type].className}`}>
                        {selectedEvent.id === analysis.firstErrorEventId
                          ? "FORKPOINT"
                          : eventMeta[selectedEvent.type].label}
                      </span>
                      <span className="mono">{selectedEvent.id}</span>
                    </div>
                    <h3>{eventTitle(selectedEvent)}</h3>
                    <p>{eventDetail(selectedEvent)}</p>
                    {selectedEvent.path && (
                      <code><FileCode2 size={13} /> {selectedEvent.path}</code>
                    )}
                  </section>

                  {selectedEvent.id === analysis.firstErrorEventId && (
                    <section className="diagnosis-block">
                      <div className="diagnosis-title">
                        <AlertTriangle size={16} />
                        <span>FIRST CAUSAL ERROR</span>
                        <strong>{Math.round(analysis.confidence * 100)}%</strong>
                      </div>
                      <h3>{analysis.firstErrorTitle}</h3>
                      <p>{analysis.firstErrorExplanation}</p>
                    </section>
                  )}

                  {analysis.insufficientEvidence && (
                    <section className="insufficient-block">
                      <AlertTriangle size={16} />
                      <div>
                        <strong>Insufficient evidence</strong>
                        <p>The trace does not support a confident causal diagnosis.</p>
                      </div>
                    </section>
                  )}

                  <section className="evidence-block">
                    <h3>Trace evidence</h3>
                    {analysis.supportingEvidenceEventIds.map((id) => {
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
                    <h3>Propagation</h3>
                    <p>{analysis.affectedEventIds.length} downstream events were influenced.</p>
                    <div className="impact-strip">
                      {analysis.affectedEventIds.slice(0, 9).map((id) => (
                        <button key={id} onClick={() => setSelectedId(id)}>
                          {id.replace("event-", "")}
                        </button>
                      ))}
                    </div>
                  </section>
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
                  onClick={generateBranch}
                  disabled={loading !== null || correctedAssumption.trim().length < 3}
                >
                  <Sparkles size={16} />
                  Generate branch
                </button>
                <button
                  className="verify-button"
                  onClick={runVerification}
                  disabled={loading !== null || !presentation?.verificationAvailable}
                  title={
                    presentation?.verificationAvailable
                      ? undefined
                      : "Safe verification is available only for the built-in fixture."
                  }
                >
                  {loading === "verify" ? <LoaderCircle className="spin" size={16} /> : <Play size={16} fill="currentColor" />}
                  {presentation?.verificationButtonLabel}
                </button>
              </div>

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
                        : presentation?.verificationAvailable
                          ? "READY"
                          : "PLAN READY"}
                    </span>
                  </header>
                  <ol>
                    {branchPlan.map((step, index) => (
                      <li key={`${index}-${step}`}>
                        <span>{index + 1}</span>
                        <p>{step}</p>
                      </li>
                    ))}
                  </ol>
                  <footer className={verification?.passed ? "verified-footer" : ""}>
                    {verification?.passed ? (
                      <><Check size={15} /> {verification.output}</>
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
          )}
        </>
      )}
    </main>
  );
}
