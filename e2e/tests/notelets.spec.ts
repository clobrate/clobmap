import { expect, test, type Page } from "@playwright/test";
import {
  addChild,
  nodeByText,
  openNotesPopup,
  notesTextarea,
  selectNode,
} from "../helpers/mindmap";

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

  test("selecting in Notelets syncs back to the YAML cursor", async ({ page }) => {
    await openNotelets(page);
    await toc(page, "Reception").click();
    // Reverse sync: the shared selection drives the YAML view's active line.
    // Reception is id: n4 in the welcome-doc fixture.
    await page.getByRole("tab", { name: "YAML" }).click();
    await expect(page.locator(".cm-activeLine")).toContainText("id: n4");
  });

  test("Home and End jump to the first and last pages", async ({ page }) => {
    await openNotelets(page);
    const catering = toc(page, "Catering");
    await catering.click();
    await catering.focus();
    await page.keyboard.press("End");
    await expect(toc(page, "Send invites")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(toc(page, "Our wedding")).toHaveAttribute("aria-selected", "true");
  });

  test("a node added in the mind-map shows up as a new Notelets page", async ({ page }) => {
    await addChild(page, "Venue", "Rehearsal dinner");
    await openNotelets(page);
    await expect(toc(page, "Rehearsal dinner")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Rehearsal dinner" }),
    ).toBeVisible();
  });

  test("raw HTML in a note is escaped, not executed (markdown only)", async ({ page }) => {
    await openNotesPopup(page, "Ceremony");
    await notesTextarea(page).fill("<b>bold</b> and <em>x</em>");
    await page.keyboard.press("Meta+Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await openNotelets(page);
    const body = page.locator('[data-page-id="n3"] .clobmap-md'); // Ceremony = n3
    await expect(body).toBeVisible();
    // The tags render as literal text, not as real <b>/<em> elements.
    await expect(body).toContainText("<b>bold</b>");
    await expect(body.locator("b")).toHaveCount(0);
    await expect(body.locator("em")).toHaveCount(0);
  });

  test("a path-reference note shows the read-only sidecar banner (web build)", async ({
    page,
  }) => {
    // A single-line ./*.md value is treated as a sidecar path reference;
    // the web build can't read it, so the page shows a read-only banner.
    await openNotesPopup(page, "Guests");
    await notesTextarea(page).fill("./missing-notes.md");
    await page.keyboard.press("Meta+Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await openNotelets(page);
    const guests = page.locator('[data-page-id="n5"]'); // Guests = n5
    await expect(guests.getByText(/aren't accessible in browser builds/)).toBeVisible();
    await expect(guests.locator(".clobmap-md")).toHaveCount(0);
  });

  test("on a narrow (phone) viewport the ToC sidebar is hidden", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.getByRole("tab", { name: "Notelets" }).click();
    await expect(page.locator("[data-page-id]").first()).toBeVisible();
    // Sidebar is display:none below the `sm` breakpoint; pages read full-width.
    await expect(page.getByRole("tree", { name: "Table of contents" })).toBeHidden();
    await expect(page.locator("[data-page-id]")).toHaveCount(14);
  });
});
