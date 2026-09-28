// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusBar } from "../StatusBar";
import { useDocumentStore } from "../../store/document";
import { useUIStore } from "../../store/ui";
import type { MindDocument } from "../../model";

function docWith(notes?: string): MindDocument {
  return { title: "T", root: { id: "n1", text: "Root", notes, children: [] } };
}

beforeEach(() => {
  cleanup();
  useDocumentStore.setState({
    parseError: null,
    isDirty: false,
    currentFilePath: "/tmp/d.clobmap.yaml",
  });
  useUIStore.setState({
    autoSave: false,
    viewMode: "notelets",
    noteletsMode: "page",
    selectedNodeId: "n1",
  });
});

describe("StatusBar — Notelets page note file", () => {
  it("shows the current page's note file (stripped ./) in page mode", () => {
    useDocumentStore.setState({ parsedDoc: docWith("./notelets/n1-Root.md") });
    render(<StatusBar />);
    expect(screen.getByLabelText(/Note file:/)).toHaveTextContent("notelets/n1-Root.md");
  });

  it("shows nothing for an inline note (no file)", () => {
    useDocumentStore.setState({ parsedDoc: docWith("just inline text") });
    render(<StatusBar />);
    expect(screen.queryByLabelText(/Note file:/)).toBeNull();
  });

  it("shows nothing in scroll mode", () => {
    useUIStore.setState({ noteletsMode: "scroll" });
    useDocumentStore.setState({ parsedDoc: docWith("./notelets/n1-Root.md") });
    render(<StatusBar />);
    expect(screen.queryByLabelText(/Note file:/)).toBeNull();
  });

  it("shows nothing outside the Notelets view", () => {
    useUIStore.setState({ viewMode: "mindmap" });
    useDocumentStore.setState({ parsedDoc: docWith("./notelets/n1-Root.md") });
    render(<StatusBar />);
    expect(screen.queryByLabelText(/Note file:/)).toBeNull();
  });
});
