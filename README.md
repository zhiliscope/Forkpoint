# Forkpoint

> **Forkpoint finds the moment an AI agent’s execution went off course—and
> lets developers replay from there.**

Forkpoint is an AI Agent Time-Travel Debugger built for OpenAI Build Week. Give
it an observable agent execution trace and it finds the earliest unsupported
assumption, explains how that decision propagated through later tool calls and
file changes, and creates a corrected branch from that point.

**Hackathon category:** Developer Tools<br />
**Live demo:** [https://forkpoint-beta.vercel.app](https://forkpoint-beta.vercel.app)<br />
**Repository:** [github.com/zhiliscope/Forkpoint](https://github.com/zhiliscope/Forkpoint)<br />
**License:** [MIT](LICENSE)

## Why Forkpoint

The final error is often only the last symptom.

An agent may report a missing dependency, broken build, or failed test, while
the real mistake happened much earlier: it guessed the framework, package
manager, repository convention, or deployment target before inspecting the
available evidence. Traditional logs preserve chronology but do not identify
that first causal decision or show what would have happened with corrected
context.

Forkpoint converts a trace into a causal investigation:

1. **Import trace** — validate and normalize a JSON agent trace.
2. **Identify the Forkpoint** — locate the earliest unsupported or incorrect
   assumption, not merely the final error.
3. **Inspect causal propagation** — connect that assumption to downstream tool
   calls, file edits, tests, and the final outcome.
4. **Edit the assumption** — supply corrected context at the failure point.
5. **Generate an alternative branch** — ask GPT-5.6 for a corrected execution
   plan from that point.
6. **Run safe verification** — for the built-in investigation, replay a fixed,
   allowlisted change in an isolated fixture and show the real result.

## Judge quick start

Open the public demo: [https://forkpoint-beta.vercel.app](https://forkpoint-beta.vercel.app)

### Run locally

Requirements:

- Node.js 20.9 or newer
- npm

```bash
git clone https://github.com/zhiliscope/Forkpoint.git
cd Forkpoint
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The built-in investigation works without an API key. Leaving
`OPENAI_API_KEY` blank activates the clearly labeled **Demo Analysis** only for
that one trace.

## Three-minute judging path

1. Click **Load built-in investigation**.
2. Read the request: add a settings page to an existing application.
3. Forkpoint focuses `event-2`, where the agent prematurely assumed React
   Router. Notice that it does **not** treat the later missing-module compiler
   error as the root cause.
4. Click timeline events, graph nodes, cited evidence, and propagation IDs to
   inspect how the assumption led to edits in `src/pages/Settings.tsx` and
   `src/App.tsx`, then to the failed build.
5. In **Corrected context**, use:

   ```text
   This project uses Next.js App Router.
   ```

6. Click **Generate branch** to create the corrected plan.
7. Click **Run safe verification**.
8. Confirm the side-by-side comparison ends with:

   ```text
   Failed → Passed
   ```

This result is not an animation. Forkpoint copies the dedicated fixture,
creates `app/settings/page.tsx`, runs a fixed local verifier, reports its output,
and removes the temporary replay directory.

## Live GPT-5.6 test with the non-demo example

The repository includes a realistic 20-event custom trace:

[`examples/ci-pnpm-frozen-lockfile.json`](examples/ci-pnpm-frozen-lockfile.json)

It follows an agent asked to fix CI in a TypeScript monorepo. The repository
clearly uses pnpm, but the agent assumes npm, creates `package-lock.json`,
rewrites CI around npm, dismisses contradictory package-manager evidence, and
causes the protected `pnpm install --frozen-lockfile` job to fail.

To test the real GPT-backed path:

1. Create `.env.local` from the safe placeholder file:

   ```bash
   cp .env.example .env.local
   ```

2. Add your own key locally. Never commit this file:

   ```dotenv
   OPENAI_API_KEY=<your-openai-api-key>
   OPENAI_MODEL=gpt-5.6
   ```

3. Restart the application:

   ```bash
   npm run dev
   ```

4. Click **Import JSON trace** and select:

   ```text
   examples/ci-pnpm-frozen-lockfile.json
   ```

5. Forkpoint should render all 20 timeline events, send the validated trace to
   GPT-5.6 from the server, and return a structured causal diagnosis and
   alternative plan.

There is no hard-coded Demo Analysis result for this example. Without an API
key, the trace still validates and renders, then Forkpoint honestly reports
that an API key is required for custom analysis.

## Why GPT-5.6 and Codex are essential

### GPT-5.6 is the causal analysis engine

For custom traces, GPT-5.6 is responsible for the product’s central reasoning
task:

- distinguish the earliest causal mistake from the final symptom;
- connect assumptions to supporting, ignored, or contradictory evidence;
- identify downstream affected events and propagation edges;
- express confidence or explicitly report insufficient evidence;
- create a corrected assumption, alternative plan, and verification suggestion.

The server uses the official OpenAI JavaScript SDK and Responses API with a
Zod-derived structured output format. Forkpoint then validates the output again
against the original event IDs. Removing GPT-5.6 would remove general causal
diagnosis for non-demo traces, leaving only the single deterministic offline
investigation.

The default model is `gpt-5.6`, the documented alias for GPT-5.6 Sol:
[OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

### Codex was the engineering and evaluation agent

Codex was used throughout the implementation session to inspect the repository,
translate the product brief into architecture, build the UI and APIs, implement
the replay safety boundary, create tests, run browser-driven demo verification,
and prepare the public repository.

That role is substantive rather than decorative: Forkpoint’s workflow was
designed from repeated observation of coding-agent execution—explicit
assumptions, concise reasoning summaries, tool calls, file operations, and test
outcomes—and the MVP was iterated through the same agentic development loop it
is intended to debug.

At runtime, this MVP accepts the documented normalized JSON format. It does not
claim a native Codex session-export adapter; native Codex and Agents SDK trace
adapters are future work.

## Architecture

| Layer | Implementation |
| --- | --- |
| Application | Next.js App Router, React, TypeScript |
| Interface | Tailwind CSS, Geist, Lucide icons |
| Causal graph | React Flow (`@xyflow/react`) |
| Trace validation | Zod |
| AI analysis | Official OpenAI SDK, Responses API, GPT-5.6 structured output |
| State | Browser memory; no database |
| Verification | Isolated fixture copy plus a fixed Node verifier |
| Tests | Vitest, TypeScript, ESLint, Next.js production build |

The main server routes are:

- `POST /api/analyze` — validates the uploaded trace and returns GPT-5.6 or
  clearly labeled built-in demo analysis.
- `POST /api/branch` — generates a corrected plan from the edited assumption.
- `POST /api/verify` — runs only the constrained built-in replay.

The supported normalized trace schema is documented in
[`docs/trace-schema.md`](docs/trace-schema.md). Supported event types are:

`user_request`, `assumption`, `reasoning_summary`, `tool_call`, `tool_result`,
`file_read`, `file_edit`, `observation`, `test_result`, and `final_result`.

## Safety boundaries

- API credentials are read only in server code and are never sent to the
  browser.
- `.env` and `.env.local` are ignored by Git.
- Uploads must be JSON, are limited to 300 KB and 250 events, and must pass a
  strict Zod schema.
- Evidence references must point to event IDs in the same trace.
- Structured model output is rejected if it introduces unknown graph event IDs.
- The UI renders text through React and does not inject raw model HTML.
- Hidden chain-of-thought is neither requested nor exposed; Forkpoint analyzes
  observable events and concise reasoning summaries.
- Replay is available only for the built-in scenario.
- Replay validates path containment, uses a dedicated temporary directory, and
  performs one fixed allowlisted file operation.
- No model-generated or user-provided shell command is executed.
- The verifier uses a fixed executable and arguments, bounded output, and a
  five-second timeout.
- Temporary replay files are removed in a `finally` block.
- The developer’s repository and original fixture are never modified by replay.

## Environment variables

The committed [`.env.example`](.env.example) contains placeholders only:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6
```

Copy it to the ignored local file:

```bash
cp .env.example .env.local
```

Then add your own credential locally:

```dotenv
OPENAI_API_KEY=<your-openai-api-key>
OPENAI_MODEL=gpt-5.6
```

Never commit `.env.local` or paste a real key into an issue, screenshot, demo
recording, or trace file.

## Tests

Run the complete local verification suite:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected results for the current repository:

- `npm test` — **2 test files, 6 tests passed**
- `npm run lint` — exits successfully with no ESLint errors
- `npm run typecheck` — exits successfully with no TypeScript errors
- `npm run build` — compiles successfully and produces `/`, `/api/analyze`,
  `/api/branch`, and `/api/verify`

Optional browser regression review:

```bash
npm run dev
```

With local Chrome debugging enabled, the repository’s
`scripts/browser-review.mjs` exercises the landing page, built-in trace,
timeline and graph selection, branch generation, verification, JSON import, and
mobile layout.

## Current MVP scope and limitations

- Accepts one normalized custom JSON trace format.
- Does not yet ingest native Codex, Agents SDK, LangSmith, or OpenTelemetry
  exports.
- Stores the current investigation only in browser memory.
- Has no accounts, database, collaboration, or saved investigation links.
- Deterministic offline analysis supports only the built-in Next.js routing
  investigation and is always labeled **Demo Analysis**.
- GPT-5.6 analysis and branch planning support custom traces when configured.
- Executable replay supports only the built-in safe fixture; uploaded custom
  traces are never used to modify a repository.
- The graph is optimized for compact hackathon traces rather than thousands of
  events.

## Developer Tools category

Forkpoint is infrastructure for developers building and evaluating AI agents.
It shortens the path from “the agent failed” to “this was the first unsupported
decision, these actions depended on it, and this corrected branch changes the
outcome.” That makes it useful for prompt iteration, tool-policy debugging,
agent evaluation, incident review, and regression analysis—not as another log
viewer, but as a causal debugger for agent behavior.

## License

Forkpoint is open source under the [MIT License](LICENSE).
