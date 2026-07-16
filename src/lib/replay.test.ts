import { describe, expect, it } from "vitest";
import { replayDemo } from "@/lib/replay";

describe("constrained replay", () => {
  it("creates and verifies the corrected App Router branch", async () => {
    const result = await replayDemo("This project uses Next.js App Router.");
    expect(result.passed).toBe(true);
    expect(result.after).toBe("Passed");
    expect(result.output).toMatch(/PASS \/settings/);
  });

  it("rejects assumptions outside the allowlisted demo replay", async () => {
    await expect(replayDemo("Use a custom shell script.")).rejects.toThrow(
      /only supports/i,
    );
  });
});
