// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The prompt is desktop-only; simulate Tauri desktop.
vi.mock("../../lib/env", () => ({ isTauri: () => true, isMobile: () => false }));

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockLoadDismissed = vi.fn<() => Promise<boolean>>();
const mockSaveDismissed = vi.fn<(v: boolean) => Promise<void>>();
vi.mock("../../lib/settings", () => ({
  loadCliPromptDismissed: () => mockLoadDismissed(),
  saveCliPromptDismissed: (v: boolean) => mockSaveDismissed(v),
}));

import { CliInstallPrompt } from "../CliInstallPrompt";

interface CliStatus {
  installed: boolean;
  is_ours: boolean;
  path: string | null;
  target: string | null;
}
const NOT_INSTALLED: CliStatus = {
  installed: false,
  is_ours: false,
  path: null,
  target: "/Applications/clobmap.app/Contents/MacOS/clobmap-cli",
};

function statusReturns(status: CliStatus): void {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "cli_status") return Promise.resolve(status);
    if (cmd === "cli_install") return Promise.resolve("/usr/local/bin/clobmap");
    return Promise.reject(new Error(`unexpected command ${cmd}`));
  });
}

const dialog = () => screen.queryByRole("dialog", { name: /install command-line tool/i });

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadDismissed.mockResolvedValue(false);
  statusReturns(NOT_INSTALLED);
});
afterEach(cleanup);

describe("CliInstallPrompt", () => {
  it("offers to install when a bundle exists and nothing of ours is on PATH", async () => {
    render(<CliInstallPrompt />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /install now/i })).toBeInTheDocument();
  });

  it("stays hidden when the CLI is already installed (is_ours)", async () => {
    statusReturns({ ...NOT_INSTALLED, installed: true, is_ours: true, path: "/usr/local/bin/clobmap" });
    render(<CliInstallPrompt />);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("cli_status"));
    expect(dialog()).not.toBeInTheDocument();
  });

  it("stays hidden in dev (no bundled target)", async () => {
    statusReturns({ ...NOT_INSTALLED, target: null });
    render(<CliInstallPrompt />);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("cli_status"));
    expect(dialog()).not.toBeInTheDocument();
  });

  it("never probes or shows when permanently dismissed", async () => {
    mockLoadDismissed.mockResolvedValue(true);
    render(<CliInstallPrompt />);
    await waitFor(() => expect(mockLoadDismissed).toHaveBeenCalled());
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(dialog()).not.toBeInTheDocument();
  });

  it("Install now calls cli_install and confirms", async () => {
    render(<CliInstallPrompt />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /install now/i }));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("cli_install"));
    expect(await screen.findByText(/installed/i)).toBeInTheDocument();
  });

  it("Don't ask again persists the choice and hides", async () => {
    render(<CliInstallPrompt />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /don't ask again/i }));
    await waitFor(() => expect(mockSaveDismissed).toHaveBeenCalledWith(true));
    expect(dialog()).not.toBeInTheDocument();
  });

  it("Later dismisses without persisting", async () => {
    render(<CliInstallPrompt />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /later/i }));
    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
    expect(mockSaveDismissed).not.toHaveBeenCalled();
  });

  describe("Claude Code skill checkbox", () => {
    const SKILL_ABSENT = {
      claude_detected: true,
      installed: false,
      is_ours: false,
      path: "/Users/me/.claude/skills/clobmap",
      version: null,
    };
    /** cli_status → NOT_INSTALLED; skill_status → `skill`; installs per `fail`. */
    function withSkill(
      skill: typeof SKILL_ABSENT | Error,
      fail: { cli?: string; skill?: string } = {},
    ): void {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "cli_status") return Promise.resolve(NOT_INSTALLED);
        if (cmd === "skill_status")
          return skill instanceof Error ? Promise.reject(skill) : Promise.resolve(skill);
        if (cmd === "cli_install")
          return fail.cli ? Promise.reject(fail.cli) : Promise.resolve("/usr/local/bin/clobmap");
        if (cmd === "skill_install")
          return fail.skill ? Promise.reject(fail.skill) : Promise.resolve(SKILL_ABSENT.path);
        return Promise.reject(new Error(`unexpected command ${cmd}`));
      });
    }
    const checkbox = () => screen.queryByRole("checkbox", { name: /teach claude code/i });

    it("is offered, checked, when Claude Code is present and the skill isn't", async () => {
      withSkill(SKILL_ABSENT);
      render(<CliInstallPrompt />);
      await waitFor(() => expect(dialog()).toBeInTheDocument());
      expect(checkbox()).toBeChecked();
    });

    it.each([
      ["Claude Code isn't installed", { ...SKILL_ABSENT, claude_detected: false }],
      ["a skill is already there", { ...SKILL_ABSENT, installed: true }],
      ["skill status fails", new Error("HOME is not set.")],
    ])("is hidden when %s", async (_label, skill) => {
      withSkill(skill);
      render(<CliInstallPrompt />);
      await waitFor(() => expect(dialog()).toBeInTheDocument());
      expect(checkbox()).not.toBeInTheDocument();
    });

    it("checked: Install now installs the CLI and the skill", async () => {
      withSkill(SKILL_ABSENT);
      render(<CliInstallPrompt />);
      await waitFor(() => expect(dialog()).toBeInTheDocument());
      await userEvent.click(screen.getByRole("button", { name: /install now/i }));
      await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("skill_install"));
      expect(mockInvoke).toHaveBeenCalledWith("cli_install");
      expect(await screen.findByText(/Run it from your terminal/)).toBeInTheDocument();
      expect(screen.getByText(/Claude Code skill installed/)).toBeInTheDocument();
    });

    it("unchecked: Install now installs only the CLI", async () => {
      withSkill(SKILL_ABSENT);
      render(<CliInstallPrompt />);
      await waitFor(() => expect(dialog()).toBeInTheDocument());
      await userEvent.click(checkbox()!);
      await userEvent.click(screen.getByRole("button", { name: /install now/i }));
      await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("cli_install"));
      expect(mockInvoke).not.toHaveBeenCalledWith("skill_install");
    });

    it("a skill failure doesn't hide the CLI success, and the prompt stays up", async () => {
      withSkill(SKILL_ABSENT, { skill: "A different 'clobmap' skill already exists at x" });
      render(<CliInstallPrompt />);
      await waitFor(() => expect(dialog()).toBeInTheDocument());
      await userEvent.click(screen.getByRole("button", { name: /install now/i }));
      expect(await screen.findByText(/Run it from your terminal/)).toBeInTheDocument();
      expect(
        screen.getByText(/Couldn't install the Claude Code skill: A different/),
      ).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 2600));
      expect(dialog()).toBeInTheDocument();
    }, 10_000);

    it("shows a fallback message when the CLI install fails with a non-string error", async () => {
      mockInvoke.mockImplementation((cmd: string) =>
        cmd === "cli_status"
          ? Promise.resolve(NOT_INSTALLED)
          : cmd === "skill_status"
            ? Promise.resolve({ ...SKILL_ABSENT, claude_detected: false })
            : Promise.reject(new Error("boom")),
      );
      render(<CliInstallPrompt />);
      await waitFor(() => expect(dialog()).toBeInTheDocument());
      await userEvent.click(screen.getByRole("button", { name: /install now/i }));
      expect(await screen.findByText(/try Settings → Command-line tool/)).toBeInTheDocument();
    });

    it("does nothing if unmounted while the skill status is still loading", async () => {
      let resolveSkill: (s: typeof SKILL_ABSENT) => void = () => {};
      mockInvoke.mockImplementation((cmd: string) =>
        cmd === "cli_status"
          ? Promise.resolve(NOT_INSTALLED)
          : new Promise((r) => {
              resolveSkill = r;
            }),
      );
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const { unmount } = render(<CliInstallPrompt />);
      await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("skill_status"));
      unmount();
      resolveSkill(SKILL_ABSENT);
      await new Promise((r) => setTimeout(r, 0));
      expect(errors).not.toHaveBeenCalled(); // no state update after unmount
      errors.mockRestore();
    });

    it("a CLI failure doesn't stop the skill install", async () => {
      withSkill(SKILL_ABSENT, { cli: "Authorization was cancelled or failed." });
      render(<CliInstallPrompt />);
      await waitFor(() => expect(dialog()).toBeInTheDocument());
      await userEvent.click(screen.getByRole("button", { name: /install now/i }));
      expect(await screen.findByText("Authorization was cancelled or failed.")).toBeInTheDocument();
      expect(screen.getByText(/Claude Code skill installed/)).toBeInTheDocument();
    });
  });
});
