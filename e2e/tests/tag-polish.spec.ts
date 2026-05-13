import { expect, test, type Page } from "@playwright/test";
import { nodeByText, selectNode } from "../helpers/mindmap";

const ROOT = "Our wedding";

async function addTagViaEditor(page: Page, parentText: string, tagName: string): Promise<void> {
  await selectNode(page, parentText);
  await page.keyboard.press("t");
  const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Add tag" }).fill(tagName);
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("tag polish (Phase E)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, ROOT)).toBeVisible();
  });

  test("autocomplete suggests existing tag names from the tag tree", async ({ page }) => {
    // Seed two tags on different nodes so the suggestion list has
    // something to surface.
    await addTagViaEditor(page, "Venue", "Logistics");
    await addTagViaEditor(page, "Guests", "Personal");

    // Open the editor on a third node and start typing.
    await selectNode(page, "Vendors");
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
    const input = dialog.getByRole("textbox", { name: "Add tag" });
    await input.fill("log");
    const listbox = dialog.getByRole("listbox", { name: "Tag suggestions" });
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole("option", { name: /Logistics/ })).toBeVisible();
    // The other tag shouldn't appear (no substring match).
    await expect(listbox.getByRole("option", { name: /Personal/ })).toHaveCount(0);
  });

  test("Tab accepts the highlighted suggestion (replaces input fragment)", async ({ page }) => {
    await addTagViaEditor(page, "Venue", "Catering");
    await selectNode(page, "Vendors");
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
    const input = dialog.getByRole("textbox", { name: "Add tag" });
    await input.fill("cat");
    await page.keyboard.press("Tab");
    await expect(input).toHaveValue("Catering");
  });

  test("case-only differences are flagged in the suggestion list", async ({ page }) => {
    await addTagViaEditor(page, "Venue", "Photographer");
    await selectNode(page, "Vendors");
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
    const input = dialog.getByRole("textbox", { name: "Add tag" });
    await input.fill("photographer");
    const listbox = dialog.getByRole("listbox", { name: "Tag suggestions" });
    await expect(listbox.locator("text=case differs")).toBeVisible();
  });

  test("F2 on the tag-tree pane renames the selected tag", async ({ page }) => {
    await addTagViaEditor(page, "Venue", "renameme");
    const tagNode = page
      .getByRole("tree", { name: "Tag tree" })
      .getByRole("treeitem")
      .filter({ hasText: /^renameme$/ });
    await tagNode.click();
    await page.keyboard.press("F2");
    const input = page.getByRole("textbox", { name: "Rename tag" });
    await expect(input).toBeFocused();
    await input.fill("renamed");
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByRole("tree", { name: "Tag tree" })
        .getByRole("treeitem")
        .filter({ hasText: /^renamed$/ }),
    ).toBeVisible();
  });

  test("Delete on the tag-tree pane removes the selected tag (cascading)", async ({ page }) => {
    await addTagViaEditor(page, "Venue", "kill-by-key");
    const tagNode = page
      .getByRole("tree", { name: "Tag tree" })
      .getByRole("treeitem")
      .filter({ hasText: /^kill-by-key$/ });
    await tagNode.click();
    await page.keyboard.press("Delete");
    // After deletion the tag-tree pane disappears (no tags left, per §5.1).
    await expect(page.getByRole("tree", { name: "Tag tree" })).toHaveCount(0);
  });
});
