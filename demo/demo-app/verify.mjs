import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (!packageJson.dependencies?.next) throw new Error("Next.js dependency is missing.");
if (packageJson.dependencies?.["react-router-dom"]) {
  throw new Error("Unexpected React Router dependency.");
}
const settingsPath = path.join(root, "app", "settings", "page.tsx");
await access(settingsPath);
const source = await readFile(settingsPath, "utf8");
if (!source.includes("SettingsPage")) throw new Error("Settings route is invalid.");
console.log("PASS /settings exists in the Next.js App Router fixture.");
