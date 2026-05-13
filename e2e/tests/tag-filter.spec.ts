import { expect, test, type Page } from "@playwright/test";
import { nodeByText, selectNode } from "../helpers/mindmap";

const ROOT = "Our wedding";

async function addTag(page: Page, parentText: string, tagName: string): Promise<void> {
  await selectNode(page, parentText);
  await page.keyboard.press("t");
  const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Add tag" }).fill(tagName);
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("tag hierarchy filter view (Phase D)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, ROOT)).toBeVisible();
  });

  test("right-click a tag-node → 'Show nodes…' enters the filter view", async ({ page }) => {
    await addTag(page, "Venue", "alpha");
    const tagNode = page
      .getByRole("tree", { name: "Tag tree" })
      .getByRole("treeitem")
      .filter({ hasText: /^alpha$/ });
    await tagNode.click({ button: "right" });
    await page.getByRole("menuitem", { name: /Show nodes under this tag/ }).click();

    // The data canvas + tag-tree split is gone, replaced by the
    // read-only filter view.
    await expect(page.getByRole("tree", { name: "Tag filter view" })).toBeVisible();
    // The data MindMap canvas is no longer rendered.
    await expect(page.getByRole("tree", { name: "Mind map canvas" })).toHaveCount(0);
    // Reset filter button is now in the header chrome.
    await expect(page.getByRole("button", { name: "Reset filter" })).toBeVisible();
  });

  test("filter view lists every data-node carrying the selected tag", async ({ page }) => {
    await addTag(page, "Venue", "shared");
    await addTag(page, "Guests", "shared");
    const tagNode = page
      .getByRole("tree", { name: "Tag tree" })
      .getByRole("treeitem")
      .filter({ hasText: /^shared$/ });
    await tagNode.click({ button: "right" });
    await page.getByRole("menuitem", { name: /Show nodes under this tag/ }).click();

    const filterTree = page.getByRole("tree", { name: "Tag filter view" });
    // Selected tag is the root of the filter view.
    await expect(filterTree.getByRole("treeitem").filter({ hasText: /^shared$/ })).toBeVisible();
    // Both Venue and Guests appear as children.
    await expect(filterTree.getByRole("treeitem").filter({ hasText: /^Venue$/ })).toBeVisible();
    await expect(filterTree.getByRole("treeitem").filter({ hasText: /^Guests$/ })).toBeVisible();
  });

  test("Untagged bucket lists every node with empty/absent tags", async ({ page }) => {
    await addTag(page, "Venue", "only-venue");
    const tagNode = page
      .getByRole("tree", { name: "Tag tree" })
      .getByRole("treeitem")
      .filter({ hasText: /^only-venue$/ });
    await tagNode.click({ button: "right" });
    await page.getByRole("menuitem", { name: /Show nodes under this tag/ }).click();

    const filterTree = page.getByRole("tree", { name: "Tag filter view" });
    // "Untagged" pseudo-node appears as a sibling.
    await expect(filterTree.getByRole("treeitem").filter({ hasText: /^Untagged$/ })).toBeVisible();
    // Guests is untagged and should be under it.
    await expect(filterTree.getByRole("treeitem").filter({ hasText: /^Guests$/ })).toBeVisible();
  });

  test("Reset filter returns to the regular data canvas", async ({ page }) => {
    await addTag(page, "Venue", "exit");
    const tagNode = page
      .getByRole("tree", { name: "Tag tree" })
      .getByRole("treeitem")
      .filter({ hasText: /^exit$/ });
    await tagNode.click({ button: "right" });
    await page.getByRole("menuitem", { name: /Show nodes under this tag/ }).click();
    await expect(page.getByRole("tree", { name: "Tag filter view" })).toBeVisible();

    await page.getByRole("button", { name: "Reset filter" }).click();
    // Filter view gone; data canvas back.
    await expect(page.getByRole("tree", { name: "Tag filter view" })).toHaveCount(0);
    await expect(page.getByRole("tree", { name: "Mind map canvas" })).toBeVisible();
    // Reset filter button is no longer in the chrome.
    await expect(page.getByRole("button", { name: "Reset filter" })).toHaveCount(0);
  });

  test("deleting the filtered tag from the tag tree shows the empty-state stub", async ({
    page,
  }) => {
    // Add tag → enter filter → switch back to mind-map view to delete it.
    await addTag(page, "Venue", "deleteme");
    const tagNode = page
      .getByRole("tree", { name: "Tag tree" })
      .getByRole("treeitem")
      .filter({ hasText: /^deleteme$/ });
    await tagNode.click({ button: "right" });
    await page.getByRole("menuitem", { name: /Show nodes under this tag/ }).click();
    await expect(page.getByRole("tree", { name: "Tag filter view" })).toBeVisible();

    // Reset → delete the tag from the tag tree.
    await page.getByRole("button", { name: "Reset filter" }).click();
    const tagNodeAfterReset = page
      .getByRole("tree", { name: "Tag tree" })
      .getByRole("treeitem")
      .filter({ hasText: /^deleteme$/ });
    await tagNodeAfterReset.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete tag" }).click();

    // The tag is gone and so is the entire tag-tree pane (no tags left).
    await expect(page.getByRole("tree", { name: "Tag tree" })).toHaveCount(0);
  });
});
