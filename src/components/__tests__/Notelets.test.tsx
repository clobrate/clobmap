// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// loadNotes is called by every NoteletsPage; keep it inert here.
vi.mock("../../lib/notes", async () => {
  const actual = await vi.importActual<typeof import("../../lib/notes")>("../../lib/notes");
  return {
    ...actual,
    loadNotes: async () => ({ content: "", isPathRef: false, resolvedPath: null, readOnly: false }),
  };
});
vi.mock("micromark", () => ({ micromark: (s: string) => `<p>${s}</p>` }));

import { Notelets } from "../Notelets";
import { useDocumentStore } from "../../store/document";
import { useUIStore } from "../../store/ui";
import type { MindDocument } from "../../model";

function doc(): MindDocument {
  return {
    title: "T",
    root: {
      id: "root",
      text: "Root",
      children: [
        { id: "s1", text: "Subject 1", children: [] },
        { id: "s2", text: "Subject 2", children: [] },
      ],
    },
  };
}

// jsdom has no IntersectionObserver; provide an inert stub so the scroll-spy
// effect can wire up without throwing. (Spy behavior itself is covered by
// pickActivePageId unit tests + e2e.)
class IOStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", IOStub);
  useUIStore.setState({ selectedNodeId: null });
  useDocumentStore.getState().reset("title: T", doc(), null, null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Notelets container", () => {
  it("renders the ToC sidebar and a page per node", async () => {
    render(<Notelets />);
    expect(screen.getByRole("tree", { name: "Table of contents" })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelectorAll("[data-page-id]")).toHaveLength(3);
    });
    // Heading for each node's page.
    expect(screen.getByRole("heading", { name: "Root" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Subject 2" })).toBeInTheDocument();
  });

  it("shows the empty state when there is no document", () => {
    useDocumentStore.getState().reset("garbage", null, null, null);
    render(<Notelets />);
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing to show yet/)).toBeInTheDocument();
  });

  it("clicking a sidebar row scrolls its page into view", async () => {
    const scrollSpy = vi.fn();
    // jsdom's scrollIntoView is a no-op; spy on it to prove click-to-scroll.
    Element.prototype.scrollIntoView = scrollSpy;
    const user = userEvent.setup();
    render(<Notelets />);
    await user.click(screen.getByRole("treeitem", { name: "Subject 2" }));
    expect(useUIStore.getState().selectedNodeId).toBe("s2");
    expect(scrollSpy).toHaveBeenCalled();
  });
});
