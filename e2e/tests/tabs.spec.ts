import { expect, test, type Page } from "@playwright/test";
import { addChild, nodeByText, selectNode } from "../helpers/mindmap";

// Welcome-doc tree the specs in this file rely on.
const ROOT = "Our wedding";

const isMac = process.platform === "darwin";
const META = isMac ? "Meta" : "Control";

async function openNewTab(page: Page): Promise<void> {
  await page.keyboard.press(`${META}+t`);
}

async function closeActiveTab(page: Page): Promise<void> {
  await page.keyboard.press(`${META}+w`);
}

function tabs(page: Page) {
  // The strip itself uses role="tablist" with name="Open documents"; each
  // tab uses role="tab". Scoping the locator to the tablist rules out the
  // view-mode tabs (YAML / Split / Mind-map) which share role="tab".
  return page.getByRole("tablist", { name: "Open documents" }).getByRole("tab");
}

test.describe("tabs (§3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, ROOT)).toBeVisible();
  });

  test("3.1 single tab — strip is hidden", async ({ page }) => {
    await expect(page.getByRole("tablist", { name: "Open documents" })).toHaveCount(0);
  });

  test("3.2 Cmd+T opens a second tab; strip appears with the new tab active", async ({ page }) => {
    await openNewTab(page);
    const all = tabs(page);
    await expect(all).toHaveCount(2);
    // The freshly-opened tab is the active one; it shows the Untitled label.
    // Scope `selected: true` to the document tablist — the view-mode toggle
    // (YAML / Split / Mind-map) also uses role="tab" with one always selected.
    const active = page
      .getByRole("tablist", { name: "Open documents" })
      .getByRole("tab", { selected: true });
    await expect(active).toHaveCount(1);
    await expect(active).toContainText("Untitled");
  });

  test("3.3 clicking an inactive tab switches; per-tab content is preserved", async ({ page }) => {
    // Tab A: welcome doc, Tab B: blank Untitled.
    await openNewTab(page);
    // The new tab seeds a single root labeled "Untitled" — verify we're on it.
    await expect(nodeByText(page, "Untitled")).toBeVisible();
    // Switch back to tab A by clicking its tab.
    await tabs(page).filter({ hasText: "Untitled" }).nth(0).click(); // Welcome tab is also "Untitled" labeled by file name
    // Actually find by index — tab A was the first one created.
    const allTabs = tabs(page);
    await allTabs.nth(0).click();
    await expect(nodeByText(page, ROOT)).toBeVisible();
    // And switching back to the second tab no longer shows the welcome root.
    await allTabs.nth(1).click();
    await expect(nodeByText(page, ROOT)).toHaveCount(0);
  });

  test("3.4 edits on tab A survive a switch to B and back", async ({ page }) => {
    await addChild(page, "Venue", "Survives switch");
    await openNewTab(page);
    // We're now on tab B — the new node from tab A shouldn't be here.
    await expect(nodeByText(page, "Survives switch")).toHaveCount(0);
    // Switch back to tab A. Wait for the welcome-doc root to be visible
    // before asserting on the specific node — under parallel-load,
    // WebKit can otherwise check before tab A's canvas finishes swapping
    // in. (Same fix pattern as the dirty-tab tests below.)
    await tabs(page).nth(0).click();
    await expect(nodeByText(page, ROOT)).toBeVisible();
    await expect(nodeByText(page, "Survives switch")).toBeVisible();
  });

  test("3.5 dirty tab + Cmd+W prompts to discard; cancel keeps the tab open", async ({ page }) => {
    // Track whether the discard prompt actually fires — registering BEFORE
    // we trigger the dirty-edit cycle eliminates any chance of a race
    // between Cmd+W and Playwright's listener wiring.
    let dialogFired = false;
    page.on("dialog", (d) => {
      dialogFired = true;
      void d.dismiss();
    });
    await addChild(page, "Venue", "Unsaved edit");
    // App.tsx mirrors `isDirty` into document.title as a leading "● " prefix.
    // Waiting for it eliminates the parallel-load race where Cmd+W could
    // fire before the store's dirty flag has settled (no dirty → no prompt).
    await expect(page).toHaveTitle(/^●/);
    await closeActiveTab(page);
    // The prompt fired (so the dirty state actually triggered the guard)
    // AND we dismissed it, so the tab stays open with the unsaved node.
    await expect(nodeByText(page, "Unsaved edit")).toBeVisible();
    expect(dialogFired).toBe(true);
  });

  test("3.5 dirty tab + Cmd+W → accept discards and closes the tab", async ({ page }) => {
    // Two tabs so closing one doesn't seed an Untitled.
    await openNewTab(page);
    // Switch back to tab A and wait for its canvas to finish swapping in
    // before mutating it. Under parallel load (WebKit), addChild can race
    // with the tab transition: by the time we press Tab, the node-click
    // pipeline for tab A's canvas isn't fully wired yet. Wait for both
    // ROOT and Venue (the parent we're about to mutate) to be visible —
    // not just present in the DOM — so the canvas's interaction layer has
    // had a chance to attach.
    await tabs(page).nth(0).click();
    await expect(nodeByText(page, ROOT)).toBeVisible();
    await expect(nodeByText(page, "Venue")).toBeVisible();
    await addChild(page, "Venue", "Will be discarded");
    // Mirror the dirty-state settle from the sibling test — guarantees
    // Cmd+W reads isDirty=true when it fires.
    await expect(page).toHaveTitle(/^●/);
    page.once("dialog", (d) => d.accept());
    await closeActiveTab(page);
    // Strip is gone now (only one tab left), and the discarded node isn't visible.
    await expect(page.getByRole("tablist", { name: "Open documents" })).toHaveCount(0);
    await expect(nodeByText(page, "Will be discarded")).toHaveCount(0);
  });

  test("3.6 closing the last tab seeds a fresh Untitled — canvas isn't blank", async ({
    page,
  }) => {
    // Closing the only (clean) tab.
    await closeActiveTab(page);
    // Strip stays hidden (still a single tab), and we see the seeded
    // Untitled root rather than a blank canvas.
    await expect(page.getByRole("tablist", { name: "Open documents" })).toHaveCount(0);
    await expect(nodeByText(page, "Untitled")).toBeVisible();
  });

  test("3.7 closing the active middle tab switches to the right neighbour", async ({ page }) => {
    await openNewTab(page); // tab B
    await openNewTab(page); // tab C (active)
    // Switch to the middle tab (B) and rename its root so we can identify
    // the active doc unambiguously.
    await tabs(page).nth(1).click();
    await selectNode(page, "Untitled");
    await page.keyboard.press("F2");
    const rename = page.getByRole("textbox", { name: "Rename node" });
    await rename.fill("MIDDLE");
    await page.keyboard.press("Enter");
    await expect(nodeByText(page, "MIDDLE")).toBeVisible();
    // Now close the dirty middle tab — accept the discard prompt.
    page.once("dialog", (d) => d.accept());
    await closeActiveTab(page);
    await expect(tabs(page)).toHaveCount(2);
    // The active tab should be the right neighbour, which is the (untouched)
    // third Untitled — MIDDLE shouldn't be visible.
    await expect(nodeByText(page, "MIDDLE")).toHaveCount(0);
    await expect(nodeByText(page, "Untitled")).toBeVisible();
  });
});
