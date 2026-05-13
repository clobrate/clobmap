import { expect, test, type Page, type Locator } from "@playwright/test";
import { nodeByText, selectNode } from "../helpers/mindmap";

const ROOT = "Our wedding";

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

async function addFirstTag(page: Page, parentText: string, tagName: string): Promise<void> {
  await selectNode(page, parentText);
  await page.keyboard.press("t");
  const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Add tag" }).fill(tagName);
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
}

/** Locator for a tag-tree node by its label, scoped to the tag tree pane. */
function tagNodeByName(page: Page, name: string): Locator {
  return page
    .getByRole("tree", { name: "Tag tree" })
    .getByRole("treeitem")
    .filter({ hasText: new RegExp(`^${name}$`) });
}

test.describe("tag tree pane (Phase C)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, ROOT)).toBeVisible();
  });

  test("pane stays hidden until the first tag is added", async ({ page }) => {
    // No tags yet → no tag tree pane.
    await expect(page.getByRole("tree", { name: "Tag tree" })).toHaveCount(0);
    // "Show tags" toggle isn't rendered either (per design §5.1).
    await expect(page.getByRole("button", { name: /tag tree/i })).toHaveCount(0);

    // Adding the first tag materializes tagRoot and the pane appears.
    await addFirstTag(page, "Venue", "urgent");
    await expect(page.getByRole("tree", { name: "Tag tree" })).toBeVisible();
    await expect(tagNodeByName(page, "urgent")).toBeVisible();
  });

  test("Hide tags / Show tags toggle works", async ({ page }) => {
    await addFirstTag(page, "Venue", "urgent");
    await expect(page.getByRole("tree", { name: "Tag tree" })).toBeVisible();
    await page.getByRole("button", { name: "Hide tags" }).click();
    await expect(page.getByRole("tree", { name: "Tag tree" })).toHaveCount(0);
    await page.getByRole("button", { name: "Show tags" }).click();
    await expect(page.getByRole("tree", { name: "Tag tree" })).toBeVisible();
  });

  test("double-click renames a tag; data-node tag updates in lockstep", async ({ page }) => {
    await addFirstTag(page, "Venue", "wip");
    const tagNode = tagNodeByName(page, "wip");
    await tagNode.dblclick();
    const input = page.getByRole("textbox", { name: "Rename tag" });
    await expect(input).toBeFocused();
    await input.fill("done");
    await page.keyboard.press("Enter");
    await expect(tagNodeByName(page, "done")).toBeVisible();
    // The data-node's tag was rewritten too — verify by reopening the
    // tag editor for Venue and checking the chip list there (the node
    // itself only shows a count-only indicator, not the tag names).
    await selectNode(page, "Venue");
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
    await expect(dialog.locator("text=done").first()).toBeVisible();
    await expect(dialog.locator("text=wip")).toHaveCount(0);
  });

  test("right-click → Delete tag cascades to every data-node carrying it", async ({ page }) => {
    await addFirstTag(page, "Venue", "kill-me");
    // Add the same tag to a second data-node to verify cascade.
    await selectNode(page, "Guests");
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: /^Edit tags for/ });
    await dialog.getByRole("textbox", { name: "Add tag" }).fill("kill-me");
    await page.keyboard.press("Enter");
    await dialog.getByRole("button", { name: "Done" }).click();

    // Right-click the tag-node in the tag tree pane.
    await tagNodeByName(page, "kill-me").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete tag" }).click();

    // Tag-node is gone from the tree and tagRoot has no children, so
    // the whole pane disappears (auto-hide per §5.1).
    await expect(tagNodeByName(page, "kill-me")).toHaveCount(0);
    // Both data-nodes lost the tag chip.
    const yaml = await yamlText(page);
    expect(yaml).not.toMatch(/- kill-me/);
  });

  test("YAML reflects the tagRoot block after first tag", async ({ page }) => {
    await addFirstTag(page, "Venue", "alpha");
    const yaml = await yamlText(page);
    expect(yaml).toMatch(/tagRoot:/);
    expect(yaml).toMatch(/name: alpha/);
  });
});
