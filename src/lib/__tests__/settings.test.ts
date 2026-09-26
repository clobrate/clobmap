// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Configurable platform. Defaults to desktop web in beforeEach.
const env = vi.hoisted(() => ({ tauri: false, mobile: false }));
vi.mock("../env", () => ({
  isTauri: () => env.tauri,
  isMobile: () => env.mobile,
}));

import { loadSettings, saveNoteletsModePref } from "../settings";

beforeEach(() => {
  env.tauri = false;
  env.mobile = false;
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe("settings — noteletsMode (web)", () => {
  it("defaults to scroll on desktop when nothing is stored", async () => {
    expect((await loadSettings()).noteletsMode).toBe("scroll");
  });

  it("defaults to page on mobile", async () => {
    env.mobile = true;
    expect((await loadSettings()).noteletsMode).toBe("page");
  });

  it("round-trips a saved value", async () => {
    await saveNoteletsModePref("page");
    expect(localStorage.getItem("clobmap-notelets-mode")).toBe("page");
    expect((await loadSettings()).noteletsMode).toBe("page");
  });

  it("ignores an invalid stored value (falls back to the platform default)", async () => {
    localStorage.setItem("clobmap-notelets-mode", "bogus");
    expect((await loadSettings()).noteletsMode).toBe("scroll");
  });
});
