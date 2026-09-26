// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockLoad = vi.fn<typeof import("../../lib/notes").loadNotes>();
vi.mock("../../lib/notes", async () => {
  const actual = await vi.importActual<typeof import("../../lib/notes")>("../../lib/notes");
  return {
    ...actual,
    loadNotes: (...args: Parameters<typeof actual.loadNotes>) => mockLoad(...args),
  };
});

const mockOpenExternal = vi.fn();
vi.mock("../../lib/openExternal", () => ({
  openExternal: (...args: unknown[]) => mockOpenExternal(...args),
}));

// Deterministic markdown → HTML: wrap in <p data-md>, and turn
// [text](url) into an anchor so we can exercise the link-click branch.
vi.mock("micromark", () => ({
  micromark: (s: string) =>
    `<p data-md>${s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')}</p>`,
}));

// Stub the CodeMirror editor — this file tests NoteletsPage's wiring, not the
// editor itself (covered by NoteletsPageEditor.test.tsx).
vi.mock("../NoteletsPageEditor", () => ({
  NoteletsPageEditor: ({ nodeId }: { nodeId: string }) => (
    <div data-testid="page-editor">{nodeId}</div>
  ),
}));

import { NoteletsPage } from "../NoteletsPage";
import { useUIStore } from "../../store/ui";
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
  useUIStore.setState({ selectedNodeId: null });
  mockOpenExternal.mockReset();
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

  it("does not render an editor until edit mode is entered", async () => {
    render(<NoteletsPage page={page({ id: "n1", text: "Venue", notes: "body" })} />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(screen.queryByTestId("page-editor")).not.toBeInTheDocument();
  });

  describe("click-to-edit wiring", () => {
    it("renders the editor when isEditing", async () => {
      render(
        <NoteletsPage
          page={page({ id: "n1", text: "Venue", notes: "body" })}
          isEditing
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId("page-editor")).toHaveTextContent("n1");
      });
    });

    it("clicking a rendered body enters edit and selects the node", async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      const { container } = render(
        <NoteletsPage
          page={page({ id: "n1", text: "Venue", notes: "# hi" })}
          onEdit={onEdit}
        />,
      );
      await waitFor(() => expect(container.querySelector(".clobmap-md")).not.toBeNull());
      await user.click(container.querySelector(".clobmap-md")!);
      expect(onEdit).toHaveBeenCalled();
      expect(useUIStore.getState().selectedNodeId).toBe("n1");
    });

    it("empty page: clicking 'add notes' enters edit", async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      render(<NoteletsPage page={page({ id: "n1", text: "Empty" })} onEdit={onEdit} />);
      const button = await screen.findByRole("button", { name: /add notes/i });
      await user.click(button);
      expect(onEdit).toHaveBeenCalled();
      expect(useUIStore.getState().selectedNodeId).toBe("n1");
    });

    it("clicking a link opens it externally and does NOT enter edit", async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      const { container } = render(
        <NoteletsPage
          page={page({ id: "n1", text: "V", notes: "[site](https://example.com)" })}
          onEdit={onEdit}
        />,
      );
      await waitFor(() => expect(container.querySelector("a")).not.toBeNull());
      await user.click(container.querySelector("a")!);
      expect(mockOpenExternal).toHaveBeenCalledWith("https://example.com");
      expect(onEdit).not.toHaveBeenCalled();
    });

    it("read-only page is not clickable-to-edit (no affordance, no onEdit)", async () => {
      mockLoad.mockResolvedValueOnce({
        content: "",
        isPathRef: true,
        resolvedPath: null,
        readOnly: true,
        message: "Sidecar notes files aren't accessible in browser builds.",
      });
      const onEdit = vi.fn();
      render(
        <NoteletsPage
          page={page({ id: "n1", text: "Sidecar", notes: "./a.md" })}
          onEdit={onEdit}
        />,
      );
      await waitFor(() => {
        expect(screen.getByText(/Sidecar notes files aren't accessible/)).toBeInTheDocument();
      });
      expect(screen.queryByRole("button", { name: /add notes/i })).not.toBeInTheDocument();
      expect(onEdit).not.toHaveBeenCalled();
    });
  });
});
