# Forkpoint

**Forkpoint finds the moment an AI agent’s execution went off course—and lets
developers replay from there.**

Forkpoint is an AI Agent Time-Travel Debugger built for OpenAI Build Week. It
accepts a normalized JSON agent trace, finds the earliest unsupported or
incorrect assumption, maps how that decision propagated through later actions,
and branches from that point with corrected context.

Hackathon category: **Developer Tools**

## The problem

Agent failures rarely begin at the final compiler error. A build may fail
because of an import added minutes earlier, which was caused by a framework
assumption made before the agent inspected the repository. Ordinary logs show
what happened in order; they do not explain which earlier decision caused the
failure or what a corrected execution would look like.

Forkpoint turns observable execution events into a causal investigation:

1. Import and validate a normalized JSON trace.
2. Read every event in a chronological timeline.
3. Diagnose the earliest unsupported assumption with cited trace evidence.
4. Explore the meaningful decisions and effects in an interactive causal graph.
5. Correct the context at the Forkpoint.
6. Generate an alternative execution plan.
7. Compare the original and corrected branches.
8. Run a constrained, real verification for the included demo fixture.

## Three-minute demo

1. Start the app and click **Load built-in investigation**.
2. Forkpoint loads a trace in which an agent is asked to add a settings page.
3. The agent assumes React Router after reading an ambiguous `src/App.tsx`, then
   adds the wrong routing structure and receives a compiler error.
4. The graph focuses event 2 as the Forkpoint—the unsupported framework
   assumption—rather than event 8, the final missing-module symptom.
5. Inspect the cited evidence and propagation path.
6. Keep or edit the corrected context:
   `This project uses Next.js App Router.`
7. Click **Generate branch**, then **Run safe verification**.
8. Forkpoint copies the dedicated demo fixture, creates
   `app/settings/page.tsx`, runs a fixed verifier, removes the run directory,
   and displays **Failed → Passed**.

The built-in path works without an API key and is visibly labeled
**Demo Analysis**.

## Architecture

- Next.js App Router, React, TypeScript, and Tailwind CSS
- React Flow (`@xyflow/react`) for the causal graph
- Zod for trace, API, and model-output validation
- Official OpenAI JavaScript SDK with the Responses API
- GPT-5.6 (`gpt-5.6`) for structured causal diagnosis and branch generation
- Vitest for schema and replay tests
- Browser state only; no database

The analysis endpoint uses `responses.parse` with a Zod-derived structured text
format. The returned graph references are checked again against the input trace,
so model output cannot introduce arbitrary event IDs.

OpenAI currently documents `gpt-5.6` as the alias for GPT-5.6 Sol and supports
both the Responses API and Structured Outputs:
[model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

## Local setup

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The demo does not require credentials. To enable GPT-backed analysis for
uploaded traces:

```bash
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.6
```

The key is read only inside server route handlers. It is never included in
client code or logs.

## Supported trace schema

The MVP accepts only the documented normalized JSON trace—not native Codex,
Agents SDK, LangSmith, or OpenTelemetry exports. See
[`docs/trace-schema.md`](docs/trace-schema.md) and the built-in fixture in
`src/lib/demo.ts`. A directly uploadable copy is included at
`demo/demo-trace.json`.

The supported event types are:

`user_request`, `assumption`, `reasoning_summary`, `tool_call`, `tool_result`,
`file_read`, `file_edit`, `observation`, `test_result`, and `final_result`.

Uploads are JSON-only, limited to 300 KB and 250 events. Event IDs must be
unique; evidence and diagnosis references must point to events in the trace.

## GPT-5.6 usage

When `OPENAI_API_KEY` is configured, Forkpoint sends the normalized observable
trace to GPT-5.6 through the server-side Responses API. The prompt asks for:

- the first causally relevant unsupported assumption;
- supporting and ignored evidence IDs;
- affected events and propagation edges;
- confidence and an explicit insufficient-evidence state;
- corrected context, an alternative plan, and a verification suggestion.

The model is instructed not to expose or infer hidden chain-of-thought. The
product uses only explicit assumptions, decisions, concise reasoning summaries,
tool calls, file operations, observations, tests, and outcomes.

Malformed structured output is rejected. A response referencing an unknown
event ID is rejected even if it otherwise matches the schema.

If the API key is absent, the deterministic fallback is available only for the
built-in `demo-next-router` trace and is labeled **Demo Analysis**. Custom traces
receive an honest configuration error.

## Constrained branch replay

Autonomous replay is intentionally limited in this MVP.

For the built-in trace only, the server:

1. verifies the corrected assumption matches the supported App Router scenario;
2. copies `demo/demo-app` into `.forkpoint-runs/<random-id>`;
3. validates every destination remains inside that run directory;
4. performs one fixed allowlisted edit: create `app/settings/page.tsx`;
5. launches the current Node executable with the fixed argument `verify.mjs`;
6. enforces a five-second timeout and captures bounded output;
7. deletes the isolated run directory.

No shell is used. No command from the model or user is executed. The original
fixture and the developer’s repository are never modified by replay.

The verifier genuinely checks that:

- the fixture declares Next.js;
- `app/settings/page.tsx` exists and has the expected route component;
- no `react-router-dom` dependency was introduced.

## Safety boundaries

- Server-side API credentials only
- Strict Zod schemas and post-model event-ID validation
- JSON upload type, size, and event-count limits
- React text rendering; no raw HTML injection
- Demo-only replay with path-containment checks
- Fixed executable and arguments, no shell, timeout, bounded output
- Temporary run cleanup after success or verification failure
- No database and no secret logging

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm test
```

## Current limitations

- One normalized custom JSON format
- No native trace adapters
- No persistent investigations or multi-user state
- The deterministic fallback and executable replay support only the included
  Next.js routing scenario
- Uploaded traces can receive GPT analysis and plan generation, but not
  autonomous repository edits
- Graph layout is optimized for compact hackathon traces, not thousands of nodes

## Roadmap

- Native OpenAI Agents SDK and Codex trace adapters
- User-defined safe replay policies and sandbox providers
- Diff-aware repository evidence collection
- Saved investigations and shareable branch reports
- Trace comparisons across model, prompt, and tool-policy versions
- Evaluation datasets for first-causal-error accuracy

## Human and Codex collaboration

Codex was used throughout the implementation session to inspect the repository,
translate the product brief into architecture, write the application, implement
the safety boundary, add tests and documentation, and verify the finished flow.

The human-defined product and engineering decisions were:

- focus on the first causal mistake rather than the last error;
- use explicit observable trace data, never hidden chain-of-thought;
- provide a real GPT-5.6 path and an honestly labeled offline demo;
- constrain replay to a safe, deterministic fixture for the MVP;
- keep the interface dense, serious, and useful in a sub-three-minute demo.

## License

MIT. See [`LICENSE`](LICENSE).
