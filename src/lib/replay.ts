import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const PROJECT_ROOT = process.cwd();
const FIXTURE_ROOT = path.resolve(PROJECT_ROOT, "demo/demo-app");
const RUNS_ROOT = path.resolve(PROJECT_ROOT, ".forkpoint-runs");

function assertInside(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Replay path escaped the dedicated run directory.");
  }
}

function runFixedVerifier(cwd: string, timeoutMs = 5_000) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["verify.mjs"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
      },
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Verification timed out."));
    }, timeoutMs);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, output: output.trim().slice(0, 4_000) });
    });
  });
}

export async function replayDemo(correctedAssumption: string) {
  if (!/next\.?js app router/i.test(correctedAssumption)) {
    throw new Error(
      "Constrained replay only supports the corrected Next.js App Router assumption.",
    );
  }

  await mkdir(RUNS_ROOT, { recursive: true });
  const runDirectory = path.resolve(RUNS_ROOT, randomUUID());
  assertInside(RUNS_ROOT, runDirectory);
  try {
    await cp(FIXTURE_ROOT, runDirectory, { recursive: true });

    const settingsDirectory = path.resolve(runDirectory, "app/settings");
    const settingsFile = path.resolve(settingsDirectory, "page.tsx");
    assertInside(runDirectory, settingsFile);
    await mkdir(settingsDirectory, { recursive: true });
    await writeFile(
      settingsFile,
      `export default function SettingsPage() {
  return (
    <main>
      <h1>Settings</h1>
      <p>Manage your Forkpoint demo preferences.</p>
    </main>
  );
}
`,
      "utf8",
    );

    const result = await runFixedVerifier(runDirectory);
    const passed = result.code === 0;
    return {
      passed,
      before: "Failed",
      after: passed ? "Passed" : "Failed",
      output: result.output,
      checks: [
        { label: "Fixture identified as Next.js App Router", passed },
        { label: "Created app/settings/page.tsx", passed },
        { label: "No React Router dependency introduced", passed },
      ],
    };
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
}
