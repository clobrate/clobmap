import { expect, test } from "@playwright/test";
import { nodeByText, selectNode } from "../helpers/mindmap";

test.describe("inline rename (§5)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  async function openRename(page: import("@playwright/test").Page, target: string) {
    await selectNode(page, target);
    await page.keyboard.press("F2");
    const rename = page.getByRole("textbox", { name: "Rename node" });
    await expect(rename).toBeFocused();
    return rename;
  }

  test("5.1 Enter commits the new text", async ({ page }) => {
    const rename = await openRename(page, "Venue");
    await rename.fill("Venue (renamed)");
    await page.keyboard.press("Enter");
    await expect(rename).toHaveCount(0);
    await expect(nodeByText(page, "Venue (renamed)")).toBeVisible();
    await expect(nodeByText(page, "Venue\n")).toHaveCount(0);
  });

  test("5.1 Esc cancels and leaves the original text", async ({ page }) => {
    const rename = await openRename(page, "Venue");
    await rename.fill("Should be discarded");
    await page.keyboard.press("Escape");
    await expect(rename).toHaveCount(0);
    await expect(nodeByText(page, "Venue")).toBeVisible();
    await expect(nodeByText(page, "Should be discarded")).toHaveCount(0);
  });

  test("5.2 Shift+Enter inserts a newline instead of committing", async ({ page }) => {
    const rename = await openRename(page, "Venue");
    await rename.fill("Line one");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Line two");
    // Textarea now holds the multi-line value, popup still open.
    await expect(rename).toHaveValue("Line one\nLine two");
    await page.keyboard.press("Enter");
    await expect(rename).toHaveCount(0);
    // The committed treeitem text contains both lines; we match the first
    // line as a prefix because nodeByText anchors on the start.
    await expect(nodeByText(page, "Line one")).toBeVisible();
  });

  test("5.5 clicking outside the input commits the change", async ({ page }) => {
    const rename = await openRename(page, "Venue");
    await rename.fill("Committed by blur");
    // Click on a different node's wrapper — that's outside the rename
    // input but still a sane place to land.
    const elsewhere = page
      .locator(".react-flow__node")
      .filter({ has: nodeByText(page, "Guests") });
    await elsewhere.click();
    await expect(rename).toHaveCount(0);
    await expect(nodeByText(page, "Committed by blur")).toBeVisible();
  });

  test("5.6 a brand-new node from Tab opens focused with the seed text fully selected", async ({
    page,
  }) => {
    await selectNode(page, "Vendors");
    await page.keyboard.press("Tab");
    const rename = page.getByRole("textbox", { name: "Rename node" });
    await expect(rename).toBeFocused();
    await expect(rename).toHaveValue("New");
    // The whole seed value is pre-selected so typing replaces it
    // wholesale — assert the selection range directly because the
    // resulting "typing replaces text" behavior is racy across engines
    // (WebKit occasionally drops keystrokes from page.keyboard.type).
    const range = await rename.evaluate((el: HTMLTextAreaElement) => [
      el.selectionStart,
      el.selectionEnd,
    ]);
    expect(range).toEqual([0, "New".length]);
    // Sanity: fill (which respects the underlying selection model) commits cleanly.
    await rename.fill("Wedding planner");
    await page.keyboard.press("Enter");
    await expect(nodeByText(page, "Wedding planner")).toBeVisible();
  });
});
