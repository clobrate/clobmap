import { expect, test, type Page } from "@playwright/test";
import { nodeByText, selectNode } from "../helpers/mindmap";

const ROOT = "Our wedding";

/**
 * Read the YAML the editor is currently holding via the debounced draft
 * in localStorage. Same trick as other YAML-snapshot tests.
 */
async function yamlText(page: Page): Promise<string> {
  await page.waitForTimeout(750);
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("clobmap-draft");
    if (!raw) return "";
    try {
      const parsed = JSON.parse(raw) as { yamlText?: string };
      return parsed.yamlText ?? "";
    } catch {
      return "";
    }
  });
}

test.describe("tags — Phase B (data-node UI)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, ROOT)).toBeVisible();
  });

  test("T opens the tag editor; Enter commits a tag; tag indicator updates on the node", async ({
    page,
  }) => {
    await selectNode(page, "Venue");
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole("textbox", { name: "Add tag" });
    await input.fill("urgent");
    await page.keyboard.press("Enter");
    // Chip appears inside the editor.
    await expect(dialog.locator("text=urgent")).toBeVisible();
    // Done closes the editor.
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);
    // The node now shows an "Edit tags (N)" affordance instead of the
    // empty "Add tags (T)" hint — we surface the count via aria-label
    // / tooltip rather than rendering the tag text on the node.
    const venue = page
      .locator(".react-flow__node")
      .filter({ has: nodeByText(page, "Venue") });
    await expect(venue.getByRole("button", { name: /^Edit tags \(1\)/ })).toBeVisible();
  });

  test("comma-separated input adds multiple tags in one commit", async ({ page }) => {
    await selectNode(page, "Venue");
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
    const input = dialog.getByRole("textbox", { name: "Add tag" });
    await input.fill("alpha, beta, gamma");
    await page.keyboard.press("Enter");
    for (const t of ["alpha", "beta", "gamma"]) {
      await expect(dialog.locator(`text=${t}`).first()).toBeVisible();
    }
    await dialog.getByRole("button", { name: "Done" }).click();
    const yaml = await yamlText(page);
    expect(yaml).toMatch(/- alpha/);
    expect(yaml).toMatch(/- beta/);
    expect(yaml).toMatch(/- gamma/);
  });

  test("× removes a tag from the node and YAML reflects it", async ({ page }) => {
    await selectNode(page, "Venue");
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
    const input = dialog.getByRole("textbox", { name: "Add tag" });
    await input.fill("removeme");
    await page.keyboard.press("Enter");
    await expect(dialog.locator("text=removeme")).toBeVisible();
    await dialog.getByRole("button", { name: "Remove tag removeme" }).click();
    await expect(dialog.locator("text=No tags yet.")).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();
    const yaml = await yamlText(page);
    expect(yaml).not.toMatch(/- removeme/);
  });

  test("Edit tags… in the context menu opens the same editor", async ({ page }) => {
    const venue = page
      .locator(".react-flow__node")
      .filter({ has: nodeByText(page, "Venue") });
    await venue.click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Edit tags/ }).click();
    await expect(page.getByRole("dialog", { name: /^Edit tags for/ })).toBeVisible();
  });

  test("YAML round-trip writes tags as a block list (one entry per line)", async ({
    page,
  }) => {
    await selectNode(page, "Venue");
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
    const input = dialog.getByRole("textbox", { name: "Add tag" });
    await input.fill("urgent");
    await page.keyboard.press("Enter");
    await dialog.getByRole("button", { name: "Done" }).click();
    const yaml = await yamlText(page);
    // Block list under tags:, not inline `tags: [urgent]`.
    expect(yaml).toMatch(/tags:\s*\n\s+- urgent/);
  });

  test("clicking Done with unsaved input commits before closing", async ({ page }) => {
    // Regression: previously, typing "Hello, World" then clicking Done
    // (without pressing Enter first) silently dropped the input. Now
    // Done flushes pending text, so the tags persist.
    await selectNode(page, "Venue");
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
    const input = dialog.getByRole("textbox", { name: "Add tag" });
    await input.fill("Hello, World");
    // No Enter — go straight to Done.
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);

    // Re-open the editor and confirm both tags are persisted.
    await selectNode(page, "Venue");
    await page.keyboard.press("t");
    const dialog2 = page.getByRole("dialog", { name: /^Edit tags for/ });
    await expect(dialog2.locator("text=Hello").first()).toBeVisible();
    await expect(dialog2.locator("text=World").first()).toBeVisible();
    await expect(dialog2.locator("text=No tags yet.")).toHaveCount(0);
  });
});
