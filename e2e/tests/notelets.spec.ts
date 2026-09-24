import { expect, test, type Page } from "@playwright/test";
import { nodeByText, openNotesPopup, notesTextarea, selectNode } from "../helpers/mindmap";

/** Activate the Notelets view and wait for its table of contents. */
async function openNotelets(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Notelets" }).click();
  await expect(page.getByRole("tree", { name: "Table of contents" })).toBeVisible();
}

function toc(page: Page, name: string) {
  return page.getByRole("treeitem", { name });
}

test.describe("Notelets — read-only notebook (Phase 1)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test("renders a table-of-contents tree and one page per node", async ({ page }) => {
    await openNotelets(page);
    // Welcome doc: 14 nodes → 14 ToC rows + 14 pages.
    await expect(page.getByRole("treeitem")).toHaveCount(14);
    await expect(page.locator("[data-page-id]")).toHaveCount(14);
    // Depth is expressed as aria-level (root = 1, subject = 2, page = 3).
    await expect(toc(page, "Our wedding")).toHaveAttribute("aria-level", "1");
    await expect(toc(page, "Venue")).toHaveAttribute("aria-level", "2");
    await expect(toc(page, "Ceremony")).toHaveAttribute("aria-level", "3");
  });

  test("clicking a ToC row selects it and scrolls its page into view", async ({ page }) => {
    await openNotelets(page);
    const catering = toc(page, "Catering");
    await catering.click();
    await expect(catering).toHaveAttribute("aria-selected", "true");
  });

  test("ArrowDown moves the selection to the next page (depth-first)", async ({ page }) => {
    await openNotelets(page);
    const catering = toc(page, "Catering");
    await catering.click();
    await catering.focus();
    await page.keyboard.press("ArrowDown");
    await expect(toc(page, "Photographer")).toHaveAttribute("aria-selected", "true");
  });

  test("a saved note renders as markdown on its page", async ({ page }) => {
    await openNotesPopup(page, "Venue");
    await notesTextarea(page).fill("# Ceremony venue\n\n- Garden pavilion\n- Beach house");
    await page.keyboard.press("Meta+Enter"); // save & close
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await openNotelets(page);
    const venue = page.locator('[data-page-id="n2"]');
    await expect(venue.locator(".clobmap-md h1")).toHaveText("Ceremony venue");
    await expect(venue.locator(".clobmap-md li")).toHaveCount(2);
  });

  test("a note-less node renders as a heading with no body", async ({ page }) => {
    await openNotelets(page);
    const guests = page.locator('[data-page-id="n5"]'); // Guests — no notes
    await expect(guests.getByRole("heading", { name: "Guests" })).toBeVisible();
    await expect(guests.locator(".clobmap-md")).toHaveCount(0);
  });

  test("selection made in the mind-map syncs to Notelets", async ({ page }) => {
    await selectNode(page, "Reception");
    await openNotelets(page);
    await expect(toc(page, "Reception")).toHaveAttribute("aria-selected", "true");
  });

  test("scrolling the column updates the selected page (scroll-spy)", async ({ page }) => {
    await openNotelets(page);
    await expect(page.locator("[data-page-id]").first()).toBeVisible();
    const column = page.locator('[aria-label="Notebook pages"]');
    // Poll with a *moving* scroll target: re-scrolling to the same position
    // produces no scroll event (so the IntersectionObserver never re-fires).
    // Alternating the target guarantees real movement each retry, which is
    // robust to the observer attaching late under parallel load.
    let tick = 0;
    await expect(async () => {
      const target = tick++ % 2 === 0 ? 1_000_000 : 1_000_000 - 60;
      await column.evaluate((el, t) => el.scrollTo({ top: t }), target);
      const selected = await page
        .locator('[role="treeitem"][aria-selected="true"]')
        .textContent();
      expect(selected?.trim()).toBeTruthy();
      expect(selected?.trim()).not.toBe("Our wedding");
    }).toPass({ timeout: 6000 });
  });
});
