// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mockLoad = vi.fn<typeof import("../../lib/notes").loadNotes>();
vi.mock("../../lib/notes", async () => {
  const actual = await vi.importActual<typeof import("../../lib/notes")>("../../lib/notes");
  return {
    ...actual,
    loadNotes: (...args: Parameters<typeof actual.loadNotes>) => mockLoad(...args),
  };
});

// Deterministic markdown → HTML so we can assert on output.
vi.mock("micromark", () => ({
  micromark: (s: string) => `<p data-md>${s}</p>`,
}));

import { NoteletsPage } from "../NoteletsPage";
import type { PageEntry } from "../../lib/notelets";
import type { MindNode } from "../../model";

function page(node: Partial<MindNode> & { id: string }, depth = 0): PageEntry {
  return {
    node: { text: node.id, children: [], ...node },
    depth,
    subjectId: null,
  };
}

beforeEach(() => {
  cleanup();
  mockLoad.mockReset();
  mockLoad.mockImplementation(async (raw) => ({
    content: raw ?? "",
    isPathRef: false,
    resolvedPath: null,
    readOnly: false,
  }));
});

describe("NoteletsPage", () => {
  it("renders the node title as a heading with a data-page-id", async () => {
    const { container } = render(
      <NoteletsPage page={page({ id: "n1", text: "Venue" })} />,
    );
    expect(screen.getByRole("heading", { name: "Venue" })).toBeInTheDocument();
    expect(container.querySelector('[data-page-id="n1"]')).not.toBeNull();
  });

  it("renders notes as markdown when the node has content", async () => {
    const { container } = render(
      <NoteletsPage page={page({ id: "n1", text: "Venue", notes: "# hi" })} />,
    );
    await waitFor(() => {
      expect(container.querySelector("[data-md]")?.textContent).toBe("# hi");
    });
  });

  it("renders no body for a note-less node (heading only)", async () => {
    const { container } = render(<NoteletsPage page={page({ id: "n1", text: "Empty" })} />);
    // Give the load effect a tick to settle.
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(container.querySelector(".clobmap-md")).toBeNull();
  });

  it("shows the read-only/sidecar message banner when loadNotes returns one", async () => {
    mockLoad.mockResolvedValueOnce({
      content: "",
      isPathRef: true,
      resolvedPath: null,
      readOnly: true,
      message: "Sidecar notes files aren't accessible in browser builds.",
    });
    render(<NoteletsPage page={page({ id: "n1", text: "Sidecar", notes: "./a.md" })} />);
    await waitFor(() => {
      expect(screen.getByText(/Sidecar notes files aren't accessible/)).toBeInTheDocument();
    });
  });

  it("does not render an editable control (read-only)", async () => {
    render(<NoteletsPage page={page({ id: "n1", text: "Venue", notes: "body" })} />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
