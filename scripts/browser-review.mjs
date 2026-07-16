import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const outputDirectory = path.join(projectRoot, ".review-artifacts");
const demoTracePath = path.join(projectRoot, "demo/demo-trace.json");
const debuggingUrl = process.env.CHROME_DEBUG_URL || "http://127.0.0.1:9222";

await mkdir(outputDirectory, { recursive: true });

const pages = await fetch(`${debuggingUrl}/json`).then((response) => response.json());
const page = pages.find((candidate) => candidate.type === "page");
if (!page) throw new Error("No Chrome page target is available.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandId = 0;
const pending = new Map();
const consoleErrors = [];
const failedResponses = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push(message.params.exceptionDetails.text);
  }
  if (
    message.method === "Log.entryAdded" &&
    message.params.entry.level === "error"
  ) {
    consoleErrors.push(message.params.entry.text);
  }
  if (
    message.method === "Network.responseReceived" &&
    message.params.response.status >= 400
  ) {
    failedResponses.push({
      status: message.params.response.status,
      url: message.params.response.url,
    });
  }
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Browser evaluation failed.");
  }
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 6_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function click(expression) {
  const clicked = await evaluate(`(() => {
    const element = ${expression};
    if (!element) return false;
    element.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not click: ${expression}`);
}

async function setInputValue(selector, value) {
  const changed = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return input.value;
  })()`);
  if (changed !== value) throw new Error(`Could not edit ${selector}.`);
}

async function screenshot(name) {
  const metrics = await send("Page.getLayoutMetrics");
  const width = Math.ceil(metrics.cssContentSize.width);
  const height = Math.ceil(metrics.cssContentSize.height);
  const image = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    fromSurface: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  await writeFile(
    path.join(outputDirectory, name),
    Buffer.from(image.data, "base64"),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await Promise.all([
  send("Runtime.enable"),
  send("Page.enable"),
  send("Network.enable"),
  send("Log.enable"),
]);

await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: "http://localhost:3000" });
await waitFor('document.readyState === "complete"');
await waitFor('document.body.innerText.includes("Load built-in investigation")');

assert(
  (await evaluate("document.title")) ===
    "Forkpoint — AI Agent Time-Travel Debugger",
  "The page title is incorrect.",
);
assert(
  (await evaluate("document.body.innerText.trim().length")) > 200,
  "The landing page is blank.",
);
assert(
  !(await evaluate(
    'Boolean(document.querySelector("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay"))',
  )),
  "A framework error overlay is visible.",
);
assert(
  (await evaluate("document.documentElement.scrollWidth <= window.innerWidth")),
  "The desktop landing page overflows horizontally.",
);
await screenshot("01-landing-desktop.png");

await click('document.querySelector(".primary-button")');
await waitFor(
  'Boolean(document.querySelector(".timeline-panel")) && document.body.innerText.includes("Unsupported framework assumption")',
);
await waitFor('document.body.innerText.includes("Unsupported framework assumption")');

assert(
  (await evaluate(
    'document.querySelector(".selected-event-top .mono")?.textContent',
  )) === "event-2",
  "The demo did not automatically focus the Forkpoint.",
);
assert(
  (await evaluate('document.querySelectorAll(".react-flow__node").length')) >= 8,
  "The causal graph did not render meaningful nodes.",
);
assert(
  await evaluate('document.body.innerText.includes("Demo Analysis")'),
  "The deterministic fallback is not labeled Demo Analysis.",
);
await screenshot("02-demo-loaded-desktop.png");

const transformBeforeZoom = await evaluate(
  'document.querySelector(".react-flow__viewport")?.style.transform',
);
await click('document.querySelector(\'button[title="Zoom In"]\')');
await waitFor(
  `document.querySelector(".react-flow__viewport")?.style.transform !== ${JSON.stringify(transformBeforeZoom)}`,
);
await click('document.querySelector(\'button[title="Zoom Out"]\')');
await click('document.querySelector(\'button[title="Fit View"]\')');

await click(
  '[...document.querySelectorAll(".timeline-item")].find((item) => item.textContent.includes("Module not found"))',
);
await waitFor(
  'document.querySelector(".selected-event-top .mono")?.textContent === "event-8"',
);

await click('document.querySelector(".focus-forkpoint")');
await waitFor(
  'document.querySelector(".selected-event-top .mono")?.textContent === "event-2"',
);

await click(
  'document.querySelector(".react-flow__node[data-id=\\"event-10\\"]")',
);
await waitFor(
  'document.querySelector(".selected-event-top .mono")?.textContent === "event-10"',
);

await click('document.querySelector(".evidence-block button")');
await waitFor(
  'document.querySelector(".selected-event-top .mono")?.textContent === "event-3"',
);

await click('document.querySelector(".impact-strip button")');
await waitFor(
  'document.querySelector(".selected-event-top .mono")?.textContent === "event-4"',
);

await click('document.querySelector(".focus-forkpoint")');
await waitFor(
  'document.querySelector(".selected-event-top .mono")?.textContent === "event-2"',
);

const editedAssumption =
  "This project uses Next.js App Router. Inspect package.json and app/ first.";
await setInputValue(".correction-row input", editedAssumption);
assert(
  (await evaluate('document.querySelector(".correction-row input")?.value')) ===
    editedAssumption,
  "The corrected assumption input did not retain the edit.",
);

await click(
  '[...document.querySelectorAll("button")].find((button) => button.textContent.includes("Generate branch"))',
);
await waitFor(
  `document.body.innerText.includes(${JSON.stringify(`Adopt the corrected context: ${editedAssumption}`)})`,
);
assert(
  await evaluate(
    'document.querySelector(".corrected-branch")?.textContent.includes("READY")',
  ),
  "The regenerated corrected branch is not ready.",
);

await click('document.querySelector(".verify-button")');
await waitFor(
  'document.querySelector(".corrected-branch")?.textContent.includes("VERIFIED")',
);
assert(
  await evaluate(
    'document.body.innerText.includes("PASS /settings exists in the Next.js App Router fixture.")',
  ),
  "The real verification output is missing.",
);
assert(
  await evaluate(
    'document.querySelector(".outcome-fail")?.textContent === "Failed" && document.querySelector(".outcome-pass")?.textContent === "Passed"',
  ),
  "The Failed to Passed result did not render.",
);
await screenshot("03-demo-verified-desktop.png");

await click('document.querySelector(".icon-button")');
await waitFor('document.body.innerText.includes("Load built-in investigation")');

await click(
  '[...document.querySelectorAll("button")].find((button) => button.textContent.includes("Import JSON trace"))',
);
const documentNode = await send("DOM.getDocument");
const fileInputNode = await send("DOM.querySelector", {
  nodeId: documentNode.root.nodeId,
  selector: 'input[type="file"]',
});
await send("DOM.setFileInputFiles", {
  nodeId: fileInputNode.nodeId,
  files: [demoTracePath],
});
await waitFor('document.body.innerText.includes("Causal analysis ready")');
assert(
  await evaluate('document.body.innerText.includes("Demo Analysis")'),
  "Uploading the built-in JSON trace did not complete analysis.",
);

await click('document.querySelector(".brand")');
await waitFor('document.body.innerText.includes("Load built-in investigation")');

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await send("Page.navigate", { url: "http://localhost:3000" });
await waitFor('document.body.innerText.includes("Load built-in investigation")');
await new Promise((resolve) => setTimeout(resolve, 400));
assert(
  await evaluate("document.documentElement.scrollWidth <= window.innerWidth"),
  "The mobile landing page overflows horizontally.",
);
await click('document.querySelector(".primary-button")');
await waitFor(
  'Boolean(document.querySelector(".timeline-panel")) && document.body.innerText.includes("Unsupported framework assumption")',
);
assert(
  await evaluate("document.documentElement.scrollWidth <= window.innerWidth"),
  "The mobile workspace overflows horizontally.",
);
assert(
  await evaluate(
    'Boolean(document.querySelector(".timeline-panel")) && Boolean(document.querySelector(".graph-panel")) && Boolean(document.querySelector(".diagnosis-panel"))',
  ),
  "A mobile workspace panel is missing.",
);
await screenshot("04-demo-mobile.png");

assert(consoleErrors.length === 0, `Browser errors: ${consoleErrors.join(" | ")}`);
assert(
  failedResponses.length === 0,
  `Failed browser responses: ${JSON.stringify(failedResponses)}`,
);

console.log(
  JSON.stringify(
    {
      status: "passed",
      interactions: [
        "landing page",
        "load built-in trace",
        "automatic Forkpoint focus",
        "timeline selection",
        "graph node selection",
        "graph zoom and fit controls",
        "evidence selection",
        "propagation selection",
        "Focus Forkpoint",
        "corrected-assumption editing",
        "alternative branch generation",
        "constrained verification",
        "reset icon",
        "JSON trace upload",
        "brand reset",
        "mobile layout",
      ],
      consoleErrors,
      failedResponses,
      artifacts: outputDirectory,
    },
    null,
    2,
  ),
);

socket.close();
