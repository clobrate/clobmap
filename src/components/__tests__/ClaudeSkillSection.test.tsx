// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { ClaudeSkillSection, type SkillStatus } from "../ClaudeSkillSection";

const PATH = "/Users/me/.claude/skills/clobmap";
const NOT_INSTALLED: SkillStatus = {
  claude_detected: true,
  installed: false,
  is_ours: false,
  path: PATH,
  version: null,
};
const OURS: SkillStatus = { ...NOT_INSTALLED, installed: true, is_ours: true, version: "2.3.0" };

/** `skill_status` returns each given status in turn (the last one repeats). */
function statusSequence(...statuses: SkillStatus[]): void {
  let i = 0;
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "skill_status")
      return Promise.resolve(statuses[Math.min(i++, statuses.length - 1)]);
    if (cmd === "skill_install") return Promise.resolve(PATH);
    if (cmd === "skill_uninstall") return Promise.resolve(null);
    return Promise.reject(new Error(`unexpected command ${cmd}`));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("ClaudeSkillSection", () => {
  it("says Claude Code wasn't found, with no button or plugin note", async () => {
    statusSequence({ ...NOT_INSTALLED, claude_detected: false });
    render(<ClaudeSkillSection />);
    expect(await screen.findByText(/Claude Code not found/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/clobmap@clobmap/)).not.toBeInTheDocument();
  });

  it("offers Install when not installed, and names the plugin as the alternative", async () => {
    statusSequence(NOT_INSTALLED);
    render(<ClaudeSkillSection />);
    expect(
      await screen.findByRole("button", { name: /install claude code skill/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/clobmap@clobmap/)).toBeInTheDocument();
  });

  it("shows the path and Remove when installed by clobmap", async () => {
    statusSequence(OURS);
    render(<ClaudeSkillSection />);
    expect(await screen.findByText(`Installed at ${PATH}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("refuses to offer anything for a folder clobmap didn't create", async () => {
    statusSequence({ ...NOT_INSTALLED, installed: true });
    render(<ClaudeSkillSection />);
    expect(await screen.findByText(/different “clobmap” skill/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("Install calls skill_install, confirms, and re-reads status", async () => {
    statusSequence(NOT_INSTALLED, OURS);
    render(<ClaudeSkillSection />);
    await userEvent.click(
      await screen.findByRole("button", { name: /install claude code skill/i }),
    );

    expect(mockInvoke).toHaveBeenCalledWith("skill_install");
    expect(await screen.findByText(/Start a new Claude Code session/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("Remove calls skill_uninstall and returns to Install", async () => {
    statusSequence(OURS, NOT_INSTALLED);
    render(<ClaudeSkillSection />);
    await userEvent.click(await screen.findByRole("button", { name: /remove/i }));

    expect(mockInvoke).toHaveBeenCalledWith("skill_uninstall");
    expect(await screen.findByText("Removed.")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /install claude code skill/i }),
    ).toBeInTheDocument();
  });

  it("shows the backend's error when install is refused", async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      cmd === "skill_status"
        ? Promise.resolve(NOT_INSTALLED)
        : Promise.reject("A different 'clobmap' skill already exists at x"),
    );
    render(<ClaudeSkillSection />);
    await userEvent.click(
      await screen.findByRole("button", { name: /install claude code skill/i }),
    );
    expect(
      await screen.findByText(/A different 'clobmap' skill already exists/),
    ).toBeInTheDocument();
  });

  it("shows an error if the status can't be read", async () => {
    mockInvoke.mockRejectedValue("HOME is not set.");
    render(<ClaudeSkillSection />);
    await waitFor(() => expect(screen.getByText("HOME is not set.")).toBeInTheDocument());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
