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
});
