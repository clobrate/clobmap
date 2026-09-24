// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { MouseEvent } from "react";

const mockOpenExternal = vi.fn();
vi.mock("../openExternal", () => ({
  openExternal: (...args: unknown[]) => mockOpenExternal(...args),
}));

// Deterministic markdown renderer: wrap the input so assertions are simple.
// `mm.throwWith` lets a single test force the render to throw (an Error or a
// non-Error) so the catch branch is exercised on the real, statically-
// imported module.
const mm = vi.hoisted(() => ({ throwWith: null as null | unknown }));
vi.mock("micromark", () => ({
  micromark: (s: string) => {
    if (mm.throwWith !== null) throw mm.throwWith;
    return `<p>${s}</p>`;
  },
}));

import { useMarkdownHtml } from "../useMarkdownHtml";

/** Build a minimal React.MouseEvent whose target is `el`. */
function clickEventOn(el: Element): MouseEvent<HTMLElement> {
  return {
    target: el,
    preventDefault: vi.fn(),
  } as unknown as MouseEvent<HTMLElement>;
}

describe("useMarkdownHtml", () => {
  beforeEach(() => {
    mockOpenExternal.mockReset();
    mm.throwWith = null;
  });
  afterEach(cleanup);

  describe("rendering", () => {
    it("renders markdown to HTML via micromark", async () => {
      const { result } = renderHook(() => useMarkdownHtml("hello"));
      await waitFor(() => expect(result.current.html).toBe("<p>hello</p>"));
    });

    it("re-renders when content changes", async () => {
      const { result, rerender } = renderHook(({ c }) => useMarkdownHtml(c), {
        initialProps: { c: "one" },
      });
      await waitFor(() => expect(result.current.html).toBe("<p>one</p>"));
      rerender({ c: "two" });
      await waitFor(() => expect(result.current.html).toBe("<p>two</p>"));
    });
  });

  describe("onLinkClick", () => {
    it("opens http(s) links externally and prevents default navigation", () => {
      const { result } = renderHook(() => useMarkdownHtml(""));
      const a = document.createElement("a");
      a.setAttribute("href", "https://example.com");
      const e = clickEventOn(a);
      result.current.onLinkClick(e);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(mockOpenExternal).toHaveBeenCalledWith("https://example.com");
    });

    it("opens mailto links externally", () => {
      const { result } = renderHook(() => useMarkdownHtml(""));
      const a = document.createElement("a");
      a.setAttribute("href", "mailto:x@y.com");
      result.current.onLinkClick(clickEventOn(a));
      expect(mockOpenExternal).toHaveBeenCalledWith("mailto:x@y.com");
    });

    it("resolves the anchor when the click lands on a child element", () => {
      const { result } = renderHook(() => useMarkdownHtml(""));
      const a = document.createElement("a");
      a.setAttribute("href", "https://nested.example");
      const span = document.createElement("span");
      a.appendChild(span);
      result.current.onLinkClick(clickEventOn(span));
      expect(mockOpenExternal).toHaveBeenCalledWith("https://nested.example");
    });

    it("drops unsafe schemes (e.g. javascript:) but still prevents default", () => {
      const { result } = renderHook(() => useMarkdownHtml(""));
      const a = document.createElement("a");
      a.setAttribute("href", "javascript:alert(1)");
      const e = clickEventOn(a);
      result.current.onLinkClick(e);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(mockOpenExternal).not.toHaveBeenCalled();
    });

    it("is a no-op when the click is not on an anchor", () => {
      const { result } = renderHook(() => useMarkdownHtml(""));
      const div = document.createElement("div");
      const e = clickEventOn(div);
      result.current.onLinkClick(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(mockOpenExternal).not.toHaveBeenCalled();
    });

    it("prevents default but does not open when the anchor has no href", () => {
      const { result } = renderHook(() => useMarkdownHtml(""));
      const a = document.createElement("a");
      const e = clickEventOn(a);
      result.current.onLinkClick(e);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(mockOpenExternal).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("shows a Preview-failed message when the renderer throws an Error", async () => {
      mm.throwWith = new Error("boom");
      const { result } = renderHook(() => useMarkdownHtml("x"));
      await waitFor(() => expect(result.current.html).toContain("Preview failed: boom"));
    });

    it("stringifies a non-Error thrown by the renderer", async () => {
      mm.throwWith = "raw failure";
      const { result } = renderHook(() => useMarkdownHtml("x"));
      await waitFor(() => expect(result.current.html).toContain("Preview failed: raw failure"));
    });

    it("escapes HTML in the error message", async () => {
      mm.throwWith = new Error("<script>bad</script>");
      const { result } = renderHook(() => useMarkdownHtml("x"));
      await waitFor(() => expect(result.current.html).toContain("&lt;script&gt;"));
    });

    it("does not set state if unmounted before the render resolves", async () => {
      const { result, unmount } = renderHook(() => useMarkdownHtml("late"));
      // Unmount synchronously, before the dynamic micromark import resolves;
      // the cancelled guard should short-circuit the pending render.
      unmount();
      await Promise.resolve();
      await Promise.resolve();
      // No throw / no act warning is the signal; html never populated.
      expect(result.current.html).toBe("");
    });
  });
});
