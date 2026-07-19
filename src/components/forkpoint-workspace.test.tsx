import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ForkpointWorkspace } from "@/components/forkpoint-workspace";

describe("Forkpoint page load", () => {
  it("renders the landing page without making any request", () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    try {
      const html = renderToStaticMarkup(<ForkpointWorkspace />);
      expect(html).toContain('class="app-shell"');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
