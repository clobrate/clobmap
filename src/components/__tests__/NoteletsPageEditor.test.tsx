// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// CodeMirror uses ResizeObserver, which jsdom lacks.
class ROStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type NoteState = Partial<ReturnType<typeof import("../../lib/useNodeNotes").useNodeNotes>>;
const state: { current: NoteState } = { current: {} };
const saveMock = vi.fn(async () => true);

vi.mock("../../lib/useNodeNotes", () => ({
  useNodeNotes: () => ({
    content: "",
    setContent: vi.fn(),
    loaded: null,
    hasLoaded: true,
    save: saveMock,
    saving: false,
    error: null,
    autoSavedAt: null,
    isDirty: false,
    readOnly: false,
    overLimit: false,
    ...state.current,
  }),
}));

import { NoteletsPageEditor } from "../NoteletsPageEditor";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ROStub);
  saveMock.mockClear();
  state.current = {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NoteletsPageEditor", () => {
  it("mounts a labelled editor once notes have loaded", () => {
    state.current = { content: "hello world" };
    const { container } = render(
      <NoteletsPageEditor nodeId="n1" title="Venue" onExit={() => {}} />,
    );
    expect(screen.getByRole("textbox", { name: "Notes for Venue" })).toBeInTheDocument();
    // CodeMirror mounted its editor into the container.
    expect(container.querySelector(".cm-editor")).not.toBeNull();
  });

  it("does not mount the editor until notes have loaded", () => {
    state.current = { hasLoaded: false };
    const { container } = render(
      <NoteletsPageEditor nodeId="n1" title="Venue" onExit={() => {}} />,
    );
    expect(container.querySelector(".cm-editor")).toBeNull();
  });

  it("shows the character count", () => {
    state.current = { content: "abcde" };
    render(<NoteletsPageEditor nodeId="n1" title="V" onExit={() => {}} />);
    expect(screen.getByText(/5 chars/)).toBeInTheDocument();
  });

  it("surfaces the over-limit warning", () => {
    state.current = { content: "x".repeat(801), overLimit: true };
    render(<NoteletsPageEditor nodeId="n1" title="V" onExit={() => {}} />);
    expect(screen.getByText(/Over limit/)).toBeInTheDocument();
  });

  it("reflects save status (saving / unsaved / saved)", () => {
    state.current = { saving: true };
    const { rerender } = render(
      <NoteletsPageEditor nodeId="n1" title="V" onExit={() => {}} />,
    );
    expect(screen.getByText("Saving…")).toBeInTheDocument();

    state.current = { isDirty: true };
    rerender(<NoteletsPageEditor nodeId="n1" title="V2" onExit={() => {}} />);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    state.current = { autoSavedAt: 123 };
    rerender(<NoteletsPageEditor nodeId="n1" title="V3" onExit={() => {}} />);
    expect(screen.getByText("Saved automatically")).toBeInTheDocument();
  });

  it("shows an error message when present", () => {
    state.current = { error: "disk full" };
    render(<NoteletsPageEditor nodeId="n1" title="V" onExit={() => {}} />);
    expect(screen.getByText("disk full")).toBeInTheDocument();
  });

  describe("exit-flush (save before unmount)", () => {
    it("Esc saves THEN exits", async () => {
      const onExit = vi.fn();
      const { container } = render(
        <NoteletsPageEditor nodeId="n1" title="V" onExit={onExit} />,
      );
      const cm = container.querySelector<HTMLElement>(".cm-content")!;
      fireEvent.keyDown(cm, { key: "Escape" });
      await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
      expect(saveMock).toHaveBeenCalled();
      // Save resolved before onExit ran.
      expect(saveMock.mock.invocationCallOrder[0]).toBeLessThan(
        onExit.mock.invocationCallOrder[0]!,
      );
    });

    it("blur saves and exits", async () => {
      const onExit = vi.fn();
      const { container } = render(
        <NoteletsPageEditor nodeId="n1" title="V" onExit={onExit} />,
      );
      const cm = container.querySelector<HTMLElement>(".cm-content")!;
      fireEvent.blur(cm);
      await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
      expect(saveMock).toHaveBeenCalled();
    });

    it("exits only once when Esc is followed by blur", async () => {
      const onExit = vi.fn();
      const { container } = render(
        <NoteletsPageEditor nodeId="n1" title="V" onExit={onExit} />,
      );
      const cm = container.querySelector<HTMLElement>(".cm-content")!;
      fireEvent.keyDown(cm, { key: "Escape" });
      fireEvent.blur(cm);
      await waitFor(() => expect(onExit).toHaveBeenCalled());
      // The double-exit guard means exactly one exit, regardless of extra events.
      expect(onExit).toHaveBeenCalledTimes(1);
    });
  });
});
