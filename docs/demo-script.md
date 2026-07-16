# Forkpoint demo script

**Target length:** approximately 2 minutes 30 seconds

**Format:** spoken narration with short on-screen action notes

## 0:00–0:15 — The problem

**On screen:** Start on the Forkpoint landing page.

**Narration:**

“AI agent failures produce long execution logs, but the final error rarely tells
us where the reasoning first went wrong. Developers can see what happened, yet
still spend hours finding the early assumption that caused everything after
it.”

## 0:15–0:28 — Introduce Forkpoint

**On screen:** Hold on the product title and primary action.

**Narration:**

“Forkpoint is an AI Agent Time-Travel Debugger. It finds the earliest
unsupported assumption in an observable agent trace, explains its downstream
impact, and lets us replay from that exact point with corrected context.”

## 0:28–0:42 — Load the investigation

**On screen:** Click **Load built-in investigation**.

**Narration:**

“Here, an agent was asked to add a settings page. Forkpoint validates the trace
and turns the complete execution into a chronological timeline and a causal
decision graph.”

## 0:42–1:02 — Find the Forkpoint

**On screen:** Point to the timeline, then the graph. Select `event-2`,
**Assumed React Router**.

**Narration:**

“The build eventually reports a missing React Router dependency, but Forkpoint
does not mistake that final compiler error for the root cause. It identifies
event two as the Forkpoint: the agent assumed React Router before establishing
which routing system the repository actually used.”

## 1:02–1:22 — Inspect evidence and propagation

**On screen:** Click the cited evidence and propagation IDs. Highlight the
`package.json` and `app/` evidence, wrong file edits, and failed tests.

**Narration:**

“The evidence panel shows what supported the diagnosis and what the agent
ignored: this was a Next.js App Router project. The graph then traces how that
unsupported assumption selected the wrong files, introduced the wrong import,
triggered the build failure, and left the requested route missing.”

## 1:22–1:42 — Correct the branch

**On screen:** In **Corrected context**, enter:

```text
This project uses Next.js App Router.
```

Then click **Generate branch**.

**Narration:**

“Now I replace the bad assumption with: ‘This project uses Next.js App Router.’
Forkpoint generates a new branch that first checks the repository conventions,
creates the correct route, and avoids introducing a second router.”

## 1:42–2:02 — Run safe verification

**On screen:** Click **Run safe verification**. Show the verification checks.

**Narration:**

“The replay is deliberately constrained. Forkpoint copies a dedicated fixture,
performs only an allowlisted file change, runs a fixed verifier with path and
timeout protections, and never executes model-generated shell commands or
modifies the real repository.”

## 2:02–2:20 — Show the outcome

**On screen:** Hold on the side-by-side branches and **Failed → Passed**.

**Narration:**

“The original branch remains visible beside the corrected branch, and the
result changes from failed to passed. This is a real file-state verification,
not a simulated success animation.”

## 2:20–2:42 — Why GPT-5.6 and Codex

**On screen:** Slowly pan across the diagnosis, graph, corrected plan, and
verification output.

**Narration:**

“GPT-5.6 performs the causal trace analysis: separating the first unsupported
decision from later symptoms, connecting evidence to affected events, and
generating the corrected plan. Codex performs the engineering loop around it:
implementation, file-state verification, automated testing, browser review,
and validation of the constrained replay.”

## 2:42–2:52 — Close

**On screen:** Return to the Forkpoint name with the verified result still
visible.

**Narration:**

“Forkpoint is a Developer Tool for teams building AI agents: less time reading
logs, faster root-cause analysis, and a safe way to prove that corrected context
actually changes the outcome.”
