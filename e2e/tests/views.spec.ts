import { expect, test, type Page } from "@playwright/test";
import { nodeByText, selectNode } from "../helpers/mindmap";

async function activeView(page: Page): Promise<string> {
  const tab = page.locator('[role="tab"][aria-selected="true"]');
  return (await tab.textContent())?.trim() ?? "";
}

test.describe("view modes & split (§9)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test("9.1 Cmd+/ cycles YAML → Split → Mind-map → YAML", async ({ page }) => {
    expect(await activeView(page)).toBe("Mind-map");
    await page.keyboard.press("Meta+/");
    expect(await activeView(page)).toBe("YAML");
    await page.keyboard.press("Meta+/");
    expect(await activeView(page)).toBe("Split");
    await page.keyboard.press("Meta+/");
    expect(await activeView(page)).toBe("Mind-map");
  });

  test("9.1 clicking view tabs switches the active surface", async ({ page }) => {
    await page.getByRole("tab", { name: "YAML" }).click();
    expect(await activeView(page)).toBe("YAML");
    await page.getByRole("tab", { name: "Mind-map" }).click();
    expect(await activeView(page)).toBe("Mind-map");
  });

  test("9.4 the YAML view renders the active document's text", async ({ page }) => {
    await page.getByRole("tab", { name: "YAML" }).click();
    // CodeMirror virtualizes, so we only check the visible top of the doc.
    await expect(page.locator(".cm-content")).toContainText("Wedding planning");
    await expect(page.locator(".cm-content")).toContainText("Our wedding");
  });

  test("9.4 Split shows BOTH the YAML editor and the mind-map", async ({ page }) => {
    await page.getByRole("tab", { name: "Split" }).click();
    // Both surfaces visible side by side / stacked.
    await expect(page.locator(".cm-content")).toBeVisible();
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test("9.5 selecting a node, then switching to YAML, jumps the cursor to that node's line", async ({
    page,
  }) => {
    // Pick a node deep enough that its YAML line isn't already the active
    // line by accident on first paint.
    await selectNode(page, "Reception");
    await page.getByRole("tab", { name: "YAML" }).click();
    // CodeMirror highlights the active line via .cm-activeLine. Reception
    // is `id: n4` per the welcome-doc fixture (n1=root, n2=Venue, n3=Ceremony,
    // n4=Reception).
    await expect(page.locator(".cm-activeLine")).toContainText("id: n4");
  });

  test("Cmd+F opens the YAML editor's search panel and finds matches", async ({ page }) => {
    await page.getByRole("tab", { name: "YAML" }).click();
    const editor = page.locator(".cm-content");
    await editor.click();
    // No search panel before the shortcut fires.
    await expect(page.locator(".cm-search.cm-panel")).toHaveCount(0);
    await page.keyboard.press("Meta+f");
    const panel = page.locator(".cm-search.cm-panel");
    await expect(panel).toBeVisible();
    // Typing in the panel's input highlights matches in the doc; the
    // selected match gets the .cm-searchMatch-selected class.
    const input = panel.locator('input[main-field="true"]');
    await input.click();
    await page.keyboard.type("Venue");
    // CodeMirror's search highlight is keyed off the input's value via
    // a CodeMirror-internal listener; pressing Enter commits the query
    // and selects the first match so it's visible in the editor's DOM.
    await page.keyboard.press("Enter");
    await expect(page.locator(".cm-searchMatch").first()).toBeVisible();
    // Escape closes the panel.
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  test("9.4 inline parse errors don't blank the canvas — last-good tree stays", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: "Split" }).click();
    await expect(nodeByText(page, "Our wedding")).toBeVisible();

    // Insert garbage at the start of the YAML to break parsing.
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press("Meta+Home");
    await page.keyboard.type("@@@INVALID@@@\n");

    // Wait past the debounced parse window and confirm the canvas
    // *still* shows the previously-valid tree.
    await page.waitForTimeout(300);
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
    await expect(nodeByText(page, "Venue")).toBeVisible();
  });
});
