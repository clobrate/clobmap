import { expect, test, type Page } from "@playwright/test";
import { addChild, nodeByText } from "../helpers/mindmap";

const isMac = process.platform === "darwin";
const META = isMac ? "Meta" : "Control";

async function openFileMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "File" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

async function closeFileMenu(page: Page): Promise<void> {
  // Click outside the menu — heading is a stable element well away from it.
  await page.getByRole("heading", { name: "clobmap" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

test.describe("file menu (§2)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test("2.1 / 2.2 File menu lists New, New tab, Open, Save, Save As", async ({ page }) => {
    await openFileMenu(page);
    // "New" vs "New tab" both start with "New ", so the lookahead excludes
    // the latter when checking the bare "New" item. The other four labels
    // are unique enough that an anchored match is sufficient.
    // "New" / "New tab" and "Save" / "Save As…" share prefixes — use
    // negative lookaheads on the bare item, anchored matches on the rest.
    await expect(page.getByRole("menuitem", { name: /^New (?!tab)/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /^Save (?!As)/ })).toBeVisible();
    for (const label of ["New tab", "Open…", "Save As…"]) {
      await expect(page.getByRole("menuitem", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
  });

  test("2.1 File → New (via menu) opens a new tab without losing the current one", async ({
    page,
  }) => {
    // Make a recognisable edit so we can see the original tab is preserved.
    await addChild(page, "Venue", "Pre-new edit");
    await openFileMenu(page);
    await page.getByRole("menuitem", { name: /^New (?!tab)/ }).click();
    // Tab strip now shows two tabs (New opens a fresh one in the web build).
    const tabs = page.getByRole("tablist", { name: "Open documents" }).getByRole("tab");
    await expect(tabs).toHaveCount(2);
    // The new tab is active and shows the seeded "Untitled" tree (not the edit
    // from the original tab).
    await expect(nodeByText(page, "Pre-new edit")).toHaveCount(0);
    // Switch back to verify the original is intact.
    await tabs.nth(0).click();
    await expect(nodeByText(page, "Pre-new edit")).toBeVisible();
  });

  test("2.6 Recent files section is hidden when there are none", async ({ page }) => {
    // First-launch state: no recent files.
    await openFileMenu(page);
    await expect(page.getByText("Recent", { exact: true })).toHaveCount(0);
    await closeFileMenu(page);
  });

  test("Cmd+N opens a new tab (keyboard route)", async ({ page }) => {
    await page.keyboard.press(`${META}+n`);
    await expect(
      page.getByRole("tablist", { name: "Open documents" }).getByRole("tab"),
    ).toHaveCount(2);
  });

  test("Cmd+O is intercepted (does not navigate the browser away)", async ({ page }) => {
    // The browser's default Cmd+O is "open file" which would replace the
    // page — but the app should preventDefault. Just confirm we still see
    // the canvas after the keystroke. (We can't actually pick a file in
    // headless mode; the FSA picker hangs without user gesture.)
    await page.keyboard.press(`${META}+o`);
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test("File menu shows the platform-appropriate keyboard shortcut hints", async ({ page }) => {
    await openFileMenu(page);
    const newItem = page.getByRole("menuitem", { name: /^New (?!tab)/ });
    // The menu items render their shortcut via a sibling span inside the
    // button. Match it via the menuitem's text content.
    const text = (await newItem.textContent()) ?? "";
    // Either the macOS ⌘ glyph or the literal "Ctrl" — depends on the
    // browser's user-agent platform string.
    expect(text).toMatch(/⌘\+N|Ctrl\+N/);
  });
});
