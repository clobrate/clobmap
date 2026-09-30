import { expect, test, type Page } from "@playwright/test";

/**
 * Claude Code skill install UI (docs/clobmap-skill-app-install-product-doc.md).
 *
 * These surfaces only render in the desktop app, so this spec fakes the Tauri
 * bridge (`window.__TAURI_INTERNALS__`) in the web build: `cli_*` / `skill_*`
 * commands are answered from a small in-page state machine that mirrors the
 * Rust contract, the store plugin gets just enough to load/save settings, and
 * everything else resolves to null. What's under test is the real UI wiring —
 * the first-run prompt, the Settings menu, and the commands they send — not
 * the file writes (those are covered by skill_tool.rs / skill-install.ts).
 */

interface Scenario {
  claudeDetected: boolean;
  /** "absent" | "ours" | "foreign" */
  skill: "absent" | "ours" | "foreign";
  cliInstalled: boolean;
  /** Make skill_install reject with this message. */
  skillInstallError?: string;
}

const SKILL_PATH = "/Users/me/.claude/skills/clobmap";

async function fakeTauri(page: Page, scenario: Scenario): Promise<void> {
  await page.addInitScript(
    ({ scenario, skillPath }) => {
      const state = { ...scenario, calls: [] as string[] };
      (window as unknown as { __fake: typeof state }).__fake = state;
      const skillStatus = () => ({
        claude_detected: state.claudeDetected,
        installed: state.skill !== "absent",
        is_ours: state.skill === "ours",
        path: skillPath,
        version: state.skill === "ours" ? "2.3.0" : null,
      });
      const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
        cli_status: () => ({
          installed: state.cliInstalled,
          is_ours: state.cliInstalled,
          path: state.cliInstalled ? "/usr/local/bin/clobmap" : null,
          target: "/Applications/clobmap.app/Contents/MacOS/clobmap-cli",
        }),
        cli_install: () => {
          state.cliInstalled = true;
          return "/usr/local/bin/clobmap";
        },
        cli_uninstall: () => {
          state.cliInstalled = false;
          return null;
        },
        skill_status: skillStatus,
        skill_install: () => {
          if (state.skillInstallError) throw state.skillInstallError;
          if (!state.claudeDetected) throw "Claude Code wasn't found on this computer.";
          if (state.skill === "foreign") throw "A different 'clobmap' skill already exists.";
          state.skill = "ours";
          return skillPath;
        },
        skill_uninstall: () => {
          state.skill = "absent";
          return null;
        },
        "plugin:store|load": () => 1,
        "plugin:store|get": () => [null, false],
      };
      let nextCallback = 1;
      (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, args: Record<string, unknown>) => {
          state.calls.push(cmd);
          const handler = handlers[cmd];
          return handler ? handler(args) : null;
        },
        transformCallback: () => nextCallback++,
        unregisterCallback: () => {},
        convertFileSrc: (p: string) => p,
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { windowLabel: "main", label: "main" },
        },
        plugins: {},
      };
    },
    { scenario, skillPath: SKILL_PATH },
  );
}

const calls = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __fake: { calls: string[] } }).__fake.calls);

async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

const prompt = (page: Page) => page.getByRole("dialog", { name: /install command-line tool/i });
const skillCheckbox = (page: Page) =>
  page.getByRole("checkbox", { name: /teach claude code/i });

test.describe("Claude Code skill — first-run prompt", () => {
  test("checked by default: Install now installs the CLI and the skill", async ({ page }) => {
    await fakeTauri(page, { claudeDetected: true, skill: "absent", cliInstalled: false });
    await page.goto("/app/");

    await expect(prompt(page)).toBeVisible();
    await expect(skillCheckbox(page)).toBeChecked();
    await prompt(page).getByRole("button", { name: /install now/i }).click();

    await expect(prompt(page).getByText(/Run it from your terminal/)).toBeVisible();
    await expect(prompt(page).getByText(/Claude Code skill installed/)).toBeVisible();
    expect(await calls(page)).toEqual(expect.arrayContaining(["cli_install", "skill_install"]));
    await expect(prompt(page)).toBeHidden({ timeout: 5_000 }); // auto-closes on success
  });

  test("unchecked: only the CLI is installed", async ({ page }) => {
    await fakeTauri(page, { claudeDetected: true, skill: "absent", cliInstalled: false });
    await page.goto("/app/");

    await skillCheckbox(page).uncheck();
    await prompt(page).getByRole("button", { name: /install now/i }).click();
    await expect(prompt(page).getByText(/Run it from your terminal/)).toBeVisible();
    expect(await calls(page)).toContain("cli_install");
    expect(await calls(page)).not.toContain("skill_install");
  });

  test("no checkbox when Claude Code isn't installed", async ({ page }) => {
    await fakeTauri(page, { claudeDetected: false, skill: "absent", cliInstalled: false });
    await page.goto("/app/");

    await expect(prompt(page)).toBeVisible();
    await expect(skillCheckbox(page)).toHaveCount(0);
  });

  test("a skill failure is shown and keeps the prompt open", async ({ page }) => {
    await fakeTauri(page, {
      claudeDetected: true,
      skill: "absent",
      cliInstalled: false,
      skillInstallError: "A different 'clobmap' skill already exists at x",
    });
    await page.goto("/app/");

    await prompt(page).getByRole("button", { name: /install now/i }).click();
    await expect(prompt(page).getByText(/Run it from your terminal/)).toBeVisible();
    await expect(prompt(page).getByText(/Couldn't install the Claude Code skill/)).toBeVisible();
    await page.waitForTimeout(3_000);
    await expect(prompt(page)).toBeVisible();
  });
});

test.describe("Claude Code skill — Settings", () => {
  test("install and remove from Settings, independent of the CLI", async ({ page }) => {
    // Existing customer: CLI already installed, so no first-run prompt (S4).
    await fakeTauri(page, { claudeDetected: true, skill: "absent", cliInstalled: true });
    await page.goto("/app/");
    await expect(prompt(page)).toHaveCount(0);

    await openSettings(page);
    const menu = page.getByRole("menu");
    await expect(menu.getByText("Command-line tool")).toBeVisible();
    await expect(menu.getByText("Claude Code skill", { exact: true })).toBeVisible();
    await expect(menu.getByText(/clobmap@clobmap/)).toBeVisible();

    await menu.getByRole("button", { name: "Install Claude Code skill" }).click();
    await expect(menu.getByText(`Installed at ${SKILL_PATH}`)).toBeVisible();
    await expect(menu.getByText(/Start a new Claude Code session/)).toBeVisible();

    await menu.getByRole("button", { name: "Remove" }).click();
    await expect(menu.getByText("Removed.")).toBeVisible();
    await expect(menu.getByRole("button", { name: "Install Claude Code skill" })).toBeVisible();

    const sent = await calls(page);
    expect(sent).toEqual(expect.arrayContaining(["skill_install", "skill_uninstall"]));
    expect(sent).not.toContain("cli_install");
    expect(sent).not.toContain("cli_uninstall");
  });

  test("Claude Code not found: no install button", async ({ page }) => {
    await fakeTauri(page, { claudeDetected: false, skill: "absent", cliInstalled: true });
    await page.goto("/app/");
    await openSettings(page);
    const menu = page.getByRole("menu");
    await expect(menu.getByText("Claude Code not found on this computer.")).toBeVisible();
    await expect(menu.getByRole("button", { name: "Install Claude Code skill" })).toHaveCount(0);
  });

  test("a skill folder clobmap didn't create is reported, not offered", async ({ page }) => {
    await fakeTauri(page, { claudeDetected: true, skill: "foreign", cliInstalled: true });
    await page.goto("/app/");
    await openSettings(page);
    const menu = page.getByRole("menu");
    await expect(menu.getByText(/different “clobmap” skill is already installed/)).toBeVisible();
    await expect(menu.getByRole("button", { name: "Install Claude Code skill" })).toHaveCount(0);
    await expect(menu.getByRole("button", { name: "Remove" })).toHaveCount(0);
  });
});
