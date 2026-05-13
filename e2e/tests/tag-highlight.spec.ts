import { expect, test, type Page, type Locator } from "@playwright/test";
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

function tagNode(page: Page, name: string): Locator {
  return page
    .getByRole("tree", { name: "Tag tree" })
    .getByRole("treeitem")
    .filter({ hasText: new RegExp(`^${name}$`) });
}

test.describe("tag highlight fill (selection-driven)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, ROOT)).toBeVisible();
  });

  test("clicking a tag-node fills every matching data-node with the highlight", async ({
    page,
  }) => {
    await addTagViaEditor(page, "Venue", "important");
    await addTagViaEditor(page, "Guests", "important");

    await tagNode(page, "important").click();

    const venue = page
      .locator(".react-flow__node")
      .filter({ has: nodeByText(page, "Venue") });
    const guests = page
      .locator(".react-flow__node")
      .filter({ has: nodeByText(page, "Guests") });
    await expect(venue.locator('[data-highlighted="true"]').first()).toBeVisible();
    await expect(guests.locator('[data-highlighted="true"]').first()).toBeVisible();

    // Untagged nodes don't carry the highlight.
    const vendors = page
      .locator(".react-flow__node")
      .filter({ has: nodeByText(page, "Vendors") });
    await expect(vendors.locator('[data-highlighted="true"]')).toHaveCount(0);
  });

  test("header chrome shows the active highlight pill with × to clear", async ({ page }) => {
    await addTagViaEditor(page, "Venue", "active-pill");
    await tagNode(page, "active-pill").click();

    const pill = page.locator("[data-highlight-pill]");
    await expect(pill).toBeVisible();
    await expect(pill).toContainText("Highlight: active-pill");

    // × clears the selection → clears the highlight.
    await pill.getByRole("button", { name: "Clear tag highlight" }).click();
    await expect(pill).toHaveCount(0);
    const venue = page
      .locator(".react-flow__node")
      .filter({ has: nodeByText(page, "Venue") });
    await expect(venue.locator('[data-highlighted="true"]')).toHaveCount(0);
  });

  test("clicking a different tag-node replaces the highlight", async ({ page }) => {
    await addTagViaEditor(page, "Venue", "first");
    await addTagViaEditor(page, "Guests", "second");
    await tagNode(page, "first").click();
    await expect(page.locator("[data-highlight-pill]")).toContainText("Highlight: first");
    await tagNode(page, "second").click();
    await expect(page.locator("[data-highlight-pill]")).toContainText("Highlight: second");
    // Only one pill at a time.
    await expect(page.locator("[data-highlight-pill]")).toHaveCount(1);
  });

  test("clicking a data-node clears the tag highlight (selection moves to the data canvas)", async ({
    page,
  }) => {
    await addTagViaEditor(page, "Venue", "auto-clear");
    await tagNode(page, "auto-clear").click();
    await expect(page.locator("[data-highlight-pill]")).toBeVisible();

    await selectNode(page, "Guests");
    await expect(page.locator("[data-highlight-pill]")).toHaveCount(0);
  });

  test("deleting the highlighted tag clears the highlight", async ({ page }) => {
    await addTagViaEditor(page, "Venue", "delete-clears");
    await tagNode(page, "delete-clears").click();
    await expect(page.locator("[data-highlight-pill]")).toBeVisible();

    await tagNode(page, "delete-clears").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete tag" }).click();
    await expect(page.locator("[data-highlight-pill]")).toHaveCount(0);
  });

  test("entering the filter view clears the highlight", async ({ page }) => {
    await addTagViaEditor(page, "Venue", "filter-clears");
    await tagNode(page, "filter-clears").click();
    await expect(page.locator("[data-highlight-pill]")).toBeVisible();

    await tagNode(page, "filter-clears").click({ button: "right" });
    await page.getByRole("menuitem", { name: /Show nodes under this tag/ }).click();
    await expect(page.getByRole("tree", { name: "Tag filter view" })).toBeVisible();
    await expect(page.locator("[data-highlight-pill]")).toHaveCount(0);

    // Exiting the filter view doesn't bring the highlight back.
    await page.getByRole("button", { name: "Reset filter" }).click();
    await expect(page.locator("[data-highlight-pill]")).toHaveCount(0);
  });
});
