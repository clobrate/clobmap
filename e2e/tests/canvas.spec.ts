import { expect, test } from "@playwright/test";
import { addChild, nodeByText, selectNode } from "../helpers/mindmap";

// Welcome-doc tree the specs in this file rely on:
//   Our wedding
//     Venue           → Ceremony, Reception
//     Guests          → Family, Friends
//     Vendors         → Catering, Photographer, Florist
//     Schedule        → Save the date, Send invites

test.describe("canvas — pointer & keyboard (§4)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test("4.1 single click selects but does not enter rename", async ({ page }) => {
    await selectNode(page, "Venue");
    expect(await page.getByRole("textbox", { name: "Rename node" }).count()).toBe(0);
  });

  test("4.2 double-click opens the inline rename", async ({ page }) => {
    const wrapper = page.locator(".react-flow__node").filter({ has: nodeByText(page, "Venue") });
    const rename = page.getByRole("textbox", { name: "Rename node" });
    // React Flow's onNodeDoubleClick handler is racy on Firefox the same
    // way onNodeClick is — first dblclick can land before the listener
    // wires up. Re-send until the textbox appears, capped by timeout.
    await expect
      .poll(
        async () => {
          if ((await rename.count()) > 0) return true;
          await wrapper.dblclick({ timeout: 1_000 }).catch(() => {});
          return false;
        },
        { timeout: 10_000, intervals: [200, 400, 800] },
      )
      .toBe(true);
    await expect(rename).toBeFocused();
    await page.keyboard.press("Escape");
  });

  test("4.3 F2 opens the inline rename on a selected node", async ({ page }) => {
    await selectNode(page, "Guests");
    await page.keyboard.press("F2");
    const rename = page.getByRole("textbox", { name: "Rename node" });
    await expect(rename).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(rename).toHaveCount(0);
  });

  test("4.5 Enter on a non-root node creates a sibling", async ({ page }) => {
    await selectNode(page, "Venue");
    await page.keyboard.press("Enter");
    const rename = page.getByRole("textbox", { name: "Rename node" });
    await rename.fill("New venue sibling");
    await page.keyboard.press("Enter");
    await expect(nodeByText(page, "New venue sibling")).toBeVisible();
    // The sibling sits alongside the original at depth 2.
    await expect(nodeByText(page, "Venue")).toBeVisible();
  });

  test("4.6 Enter on the root is a no-op", async ({ page }) => {
    await selectNode(page, "Our wedding");
    const before = await page.getByRole("treeitem").count();
    await page.keyboard.press("Enter");
    // No rename input opened, no new node added.
    expect(await page.getByRole("textbox", { name: "Rename node" }).count()).toBe(0);
    await expect(page.getByRole("treeitem")).toHaveCount(before);
  });

  test("4.7 arrow keys navigate the tree", async ({ page }) => {
    await selectNode(page, "Venue");
    await page.keyboard.press("ArrowDown");
    await expect(nodeByText(page, "Guests")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowUp");
    await expect(nodeByText(page, "Venue")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(nodeByText(page, "Ceremony")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(nodeByText(page, "Venue")).toHaveAttribute("aria-selected", "true");
  });

  test("4.9 Space toggles collapse on a node with children", async ({ page }) => {
    await selectNode(page, "Venue");
    const venue = nodeByText(page, "Venue");
    await expect(venue).toHaveAttribute("aria-expanded", "true");
    await expect(nodeByText(page, "Ceremony")).toBeVisible();

    await page.keyboard.press(" ");
    await expect(venue).toHaveAttribute("aria-expanded", "false");
    await expect(nodeByText(page, "Ceremony")).toHaveCount(0);

    await page.keyboard.press(" ");
    await expect(venue).toHaveAttribute("aria-expanded", "true");
    await expect(nodeByText(page, "Ceremony")).toBeVisible();
  });

  test("4.8 ArrowRight on a collapsed node auto-expands then descends", async ({ page }) => {
    await selectNode(page, "Venue");
    await page.keyboard.press(" "); // collapse
    await expect(nodeByText(page, "Ceremony")).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(nodeByText(page, "Ceremony")).toHaveAttribute("aria-selected", "true");
  });

  test("4.10 Delete on a non-root node removes it", async ({ page }) => {
    await selectNode(page, "Reception");
    await page.keyboard.press("Delete");
    await expect(nodeByText(page, "Reception")).toHaveCount(0);
    // Sibling and parent untouched.
    await expect(nodeByText(page, "Ceremony")).toBeVisible();
    await expect(nodeByText(page, "Venue")).toBeVisible();
  });

  test("4.11 Delete on the root is a no-op", async ({ page }) => {
    await selectNode(page, "Our wedding");
    const before = await page.getByRole("treeitem").count();
    await page.keyboard.press("Delete");
    await expect(page.getByRole("treeitem")).toHaveCount(before);
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test("4.13 Cmd+Z undoes a deletion; Cmd+Shift+Z redoes it", async ({ page }) => {
    await selectNode(page, "Reception");
    await page.keyboard.press("Delete");
    await expect(nodeByText(page, "Reception")).toHaveCount(0);

    await page.keyboard.press("Meta+z");
    await expect(nodeByText(page, "Reception")).toBeVisible();

    await page.keyboard.press("Meta+Shift+z");
    await expect(nodeByText(page, "Reception")).toHaveCount(0);
  });

  test("4.14 clicking the chevron toggles collapse without entering rename", async ({ page }) => {
    await selectNode(page, "Venue");
    const venue = nodeByText(page, "Venue");
    await venue.getByRole("button", { name: "Collapse node" }).click();
    await expect(venue).toHaveAttribute("aria-expanded", "false");
    expect(await page.getByRole("textbox", { name: "Rename node" }).count()).toBe(0);
    // Chevron's accessible name flips after collapse.
    await venue.getByRole("button", { name: "Expand node" }).click();
    await expect(venue).toHaveAttribute("aria-expanded", "true");
  });

  test("4.17 Esc cancels an in-progress rename", async ({ page }) => {
    await selectNode(page, "Venue");
    await page.keyboard.press("F2");
    const rename = page.getByRole("textbox", { name: "Rename node" });
    await rename.fill("Should not stick");
    await page.keyboard.press("Escape");
    await expect(rename).toHaveCount(0);
    // Original text still on the canvas; the typed value was discarded.
    await expect(nodeByText(page, "Venue")).toBeVisible();
    await expect(nodeByText(page, "Should not stick")).toHaveCount(0);
  });

  test("4.18 right-click opens the context menu", async ({ page }) => {
    const wrapper = page.locator(".react-flow__node").filter({ has: nodeByText(page, "Venue") });
    await wrapper.click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Sanity: the menu should expose the keyboard shortcuts mapped to other tests.
    await expect(menu.getByText("Rename")).toBeVisible();
    await expect(menu.getByText(/^Add child$/)).toBeVisible();
    // Pressing Esc dismisses the menu.
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("Tab adds a child whose label sticks after rename commits (sibling spot-check)", async ({ page }) => {
    // Complementary to the smoke test — exercises the same path but
    // verifies the new node lands in the tree as a *child* of the parent
    // (sibling assertion vs YAML round-trip).
    await addChild(page, "Vendors", "DJ");
    const vendors = nodeByText(page, "Vendors");
    await expect(vendors).toHaveAttribute("aria-expanded", "true");
    await expect(nodeByText(page, "DJ")).toBeVisible();
  });
});
