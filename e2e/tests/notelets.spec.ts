import { devices, expect, test, type Page } from "@playwright/test";
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

test.describe("Notelets notebook view", () => {
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

  // ── In-page editing (Phase 2) ──────────────────────────────────────────

  test("editing a page persists the note to YAML and renders it (Esc to save)", async ({
    page,
  }) => {
    await openNotelets(page);
    const venue = page.locator('[data-page-id="n2"]');
    await venue.getByRole("button").click(); // "Click to add notes…"
    await venue.locator(".cm-content").click();
    await page.keyboard.type("Ceremony at 3pm");
    await page.keyboard.press("Escape");
    await expect(venue.locator(".clobmap-md")).toContainText("Ceremony at 3pm");
    await page.getByRole("tab", { name: "YAML" }).click();
    await expect(page.locator(".cm-content")).toContainText("Ceremony at 3pm");
  });

  test("clicking away from the editor saves the edit (blur)", async ({ page }) => {
    await openNotelets(page);
    const venue = page.locator('[data-page-id="n2"]');
    await venue.getByRole("button").click();
    await venue.locator(".cm-content").click();
    await page.keyboard.type("Saved on blur");
    // Click the page heading (outside the editor) to blur.
    await venue.getByRole("heading", { name: "Venue" }).click();
    await expect(venue.locator(".clobmap-md")).toContainText("Saved on blur");
  });

  test("clicking a rendered note re-enters edit mode", async ({ page }) => {
    await openNotelets(page);
    const venue = page.locator('[data-page-id="n2"]');
    await venue.getByRole("button").click();
    await venue.locator(".cm-content").click();
    await page.keyboard.type("First draft");
    await page.keyboard.press("Escape");
    await expect(venue.locator(".clobmap-md")).toContainText("First draft");
    // Click the rendered markdown → editor comes back seeded with the note.
    await venue.locator(".clobmap-md").click();
    await expect(venue.locator(".cm-editor")).toBeVisible();
  });

  test("only one page editor is open at a time", async ({ page }) => {
    await openNotelets(page);
    await page.locator('[data-page-id="n2"]').getByRole("button").click();
    await expect(page.locator(".cm-editor")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.locator('[data-page-id="n5"]').getByRole("button").click(); // Guests
    await expect(page.locator('[data-page-id="n5"] .cm-editor')).toBeVisible();
    await expect(page.locator(".cm-editor")).toHaveCount(1);
  });

  test("a read-only sidecar page is not editable", async ({ page }) => {
    await openNotesPopup(page, "Guests");
    await notesTextarea(page).fill("./missing-notes.md");
    await page.keyboard.press("Meta+Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await openNotelets(page);
    const guests = page.locator('[data-page-id="n5"]');
    await expect(guests.getByText(/aren't accessible in browser builds/)).toBeVisible();
    await guests.click();
    await expect(guests.locator(".cm-editor")).toHaveCount(0);
  });

  test("auto-saves while still editing (1s debounce, no exit)", async ({ page }) => {
    await openNotelets(page);
    const venue = page.locator('[data-page-id="n2"]');
    await venue.getByRole("button").click();
    await venue.locator(".cm-content").click();
    await page.keyboard.type("Auto note");
    // The debounced auto-save fires ~1s after the last keystroke — the status
    // flips WITHOUT us exiting the editor.
    await expect(venue.getByText("Saved automatically")).toBeVisible({ timeout: 3000 });
    await expect(venue.locator(".cm-editor")).toBeVisible(); // still editing
    await page.getByRole("tab", { name: "YAML" }).click();
    await expect(page.locator(".cm-content")).toContainText("Auto note");
  });

  test("Enter continues a Markdown list marker", async ({ page }) => {
    await openNotelets(page);
    const venue = page.locator('[data-page-id="n2"]');
    await venue.getByRole("button").click();
    await venue.locator(".cm-content").click();
    await page.keyboard.type("- Garden");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Beach"); // no marker typed — continuation adds it
    await page.keyboard.press("Escape");
    const items = venue.locator(".clobmap-md li");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveText("Garden");
    await expect(items.nth(1)).toHaveText("Beach");
  });

  // ── Sidebar restructuring (Phase 3) ────────────────────────────────────

  /** Select + focus a ToC row so keyboard ops target it. */
  async function focusRow(page: Page, name: string) {
    const row = toc(page, name);
    await row.click();
    await row.focus();
    return row;
  }
  const renameInput = (page: Page) => page.getByRole("textbox", { name: "Rename node" });

  test("Tab adds a child that lands in rename mode", async ({ page }) => {
    await openNotelets(page);
    await focusRow(page, "Venue");
    await page.keyboard.press("Tab");
    await renameInput(page).fill("Rehearsal");
    await page.keyboard.press("Enter");
    // New node appears in the ToC and as a page, nested under Venue (level 3).
    await expect(toc(page, "Rehearsal")).toBeVisible();
    await expect(toc(page, "Rehearsal")).toHaveAttribute("aria-level", "3");
    await expect(page.getByRole("heading", { name: "Rehearsal" })).toBeVisible();
  });

  test("Enter adds a sibling", async ({ page }) => {
    await openNotelets(page);
    await focusRow(page, "Ceremony"); // child of Venue (level 3)
    await page.keyboard.press("Enter");
    await renameInput(page).fill("Vows");
    await page.keyboard.press("Enter");
    await expect(toc(page, "Vows")).toHaveAttribute("aria-level", "3"); // sibling level
  });

  test("F2 renames a node — ToC, page heading, and YAML all update", async ({ page }) => {
    await openNotelets(page);
    await focusRow(page, "Reception");
    await page.keyboard.press("F2");
    await renameInput(page).fill("Reception Hall");
    await page.keyboard.press("Enter");
    await expect(toc(page, "Reception Hall")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reception Hall" })).toBeVisible();
    await page.getByRole("tab", { name: "YAML" }).click();
    await expect(page.locator(".cm-content")).toContainText("Reception Hall");
  });

  test("double-clicking a row renames it", async ({ page }) => {
    await openNotelets(page);
    await toc(page, "Florist").dblclick();
    await renameInput(page).fill("Flowers");
    await page.keyboard.press("Enter");
    await expect(toc(page, "Flowers")).toBeVisible();
  });

  test("Delete removes a node and Cmd+Z restores it", async ({ page }) => {
    await openNotelets(page);
    await focusRow(page, "Reception");
    await page.keyboard.press("Delete");
    await expect(toc(page, "Reception")).toHaveCount(0);
    await page.keyboard.press("Meta+z"); // window-level undo
    await expect(toc(page, "Reception")).toBeVisible();
  });

  test("Alt+ArrowDown reorders siblings (YAML order changes)", async ({ page }) => {
    await openNotelets(page);
    await focusRow(page, "Ceremony"); // first child of Venue, before Reception
    await page.keyboard.press("Alt+ArrowDown");
    await page.getByRole("tab", { name: "YAML" }).click();
    const yaml = (await page.locator(".cm-content").textContent()) ?? "";
    expect(yaml.indexOf("Reception")).toBeLessThan(yaml.indexOf("Ceremony"));
  });

  test("dragging a row onto another reparents it (nesting deepens)", async ({ page }) => {
    await openNotelets(page);
    // Ceremony (child of Venue, level 3) → dropped ONTO Guests → becomes its child.
    await expect(toc(page, "Ceremony")).toHaveAttribute("aria-level", "3");
    await toc(page, "Ceremony").dragTo(toc(page, "Guests"));
    await expect(toc(page, "Ceremony")).toHaveAttribute("aria-level", "3"); // Guests is level 2 → child level 3
    // Prove it moved under Guests in YAML: Ceremony now follows Guests.
    await page.getByRole("tab", { name: "YAML" }).click();
    const yaml = (await page.locator(".cm-content").textContent()) ?? "";
    expect(yaml.indexOf("Guests")).toBeLessThan(yaml.indexOf("Ceremony"));
  });

  test("a rename in the sidebar shows in the Mind-map", async ({ page }) => {
    await openNotelets(page);
    await focusRow(page, "Catering");
    await page.keyboard.press("F2");
    await renameInput(page).fill("Food & Drink");
    await page.keyboard.press("Enter");
    await page.getByRole("tab", { name: "Mind-map" }).click();
    await expect(nodeByText(page, "Food & Drink")).toBeVisible();
  });

  test("dragging onto a row's top edge reorders it before (sibling)", async ({ page }) => {
    await openNotelets(page);
    // Vendors' children are Catering, Photographer, Florist. Drop Florist on
    // the TOP edge of Catering → Florist becomes the first, still a sibling.
    await toc(page, "Florist").dragTo(toc(page, "Catering"), {
      targetPosition: { x: 12, y: 2 },
    });
    await expect(toc(page, "Florist")).toHaveAttribute("aria-level", "3"); // still a sibling
    await page.getByRole("tab", { name: "YAML" }).click();
    const yaml = (await page.locator(".cm-content").textContent()) ?? "";
    expect(yaml.indexOf("Florist")).toBeLessThan(yaml.indexOf("Catering"));
  });

  test("F2 then Esc cancels the rename", async ({ page }) => {
    await openNotelets(page);
    await focusRow(page, "Photographer");
    await page.keyboard.press("F2");
    await renameInput(page).fill("Discarded");
    await page.keyboard.press("Escape");
    await expect(toc(page, "Photographer")).toBeVisible();
    await expect(toc(page, "Discarded")).toHaveCount(0);
  });

  test("the root node cannot be deleted", async ({ page }) => {
    await openNotelets(page);
    await focusRow(page, "Our wedding");
    await page.keyboard.press("Delete");
    await expect(toc(page, "Our wedding")).toBeVisible();
    await expect(page.getByRole("treeitem")).toHaveCount(14); // unchanged
  });

  // ── Reading modes / Subject tabs / paging (Phase 4) ─────────────────────

  const modeTab = (page: Page, name: "Scroll" | "Page") =>
    page.getByRole("tab", { name, exact: true });
  const firstPageId = (page: Page) =>
    page.locator("[data-page-id]").first().getAttribute("data-page-id");

  test("reading-mode toggle switches to page mode and persists across reload", async ({
    page,
  }) => {
    await openNotelets(page);
    await expect(page.locator("[data-page-id]")).toHaveCount(14); // scroll: all
    await modeTab(page, "Page").click();
    await expect(page.locator("[data-page-id]")).toHaveCount(1); // page: one
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Notelets" }).click();
    await expect(modeTab(page, "Page")).toHaveAttribute("aria-selected", "true");
  });

  test("page mode: Prev disabled on the first page; Next advances", async ({ page }) => {
    await openNotelets(page);
    await toc(page, "Our wedding").click();
    await modeTab(page, "Page").click();
    await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await page.getByRole("button", { name: "Next page" }).click();
    expect(await firstPageId(page)).toBe("n2"); // Venue
  });

  test("page mode: Next disabled on the last page", async ({ page }) => {
    await openNotelets(page);
    await toc(page, "Send invites").click(); // last node in depth-first order
    await modeTab(page, "Page").click();
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  test("page mode: ← / → keyboard paging", async ({ page }) => {
    await openNotelets(page);
    await toc(page, "Our wedding").click();
    await modeTab(page, "Page").click();
    await page.keyboard.press("ArrowRight");
    expect(await firstPageId(page)).toBe("n2");
    await page.keyboard.press("ArrowLeft");
    expect(await firstPageId(page)).toBe("n1");
  });

  test("subject tabs: Overview + per-subject; click navigates and reflects active", async ({
    page,
  }) => {
    await openNotelets(page);
    await modeTab(page, "Page").click();
    const subjects = page.getByRole("tablist", { name: "Subjects" });
    await expect(subjects.getByRole("tab")).toHaveText([
      "Overview",
      "Venue",
      "Guests",
      "Vendors",
      "Schedule",
    ]);
    await page.getByRole("tab", { name: "Vendors", exact: true }).click();
    expect(await firstPageId(page)).toBe("n8");
    await expect(page.getByRole("tab", { name: "Vendors", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("tab", { name: "Overview" }).click();
    expect(await firstPageId(page)).toBe("n1");
  });

  test("page mode: selecting a sidebar row shows that page", async ({ page }) => {
    await openNotelets(page);
    await modeTab(page, "Page").click();
    await toc(page, "Guests").click(); // ToC row
    expect(await firstPageId(page)).toBe("n5"); // Guests
  });

  test("editing works in page mode and persists to YAML", async ({ page }) => {
    await openNotelets(page);
    await toc(page, "Venue").click();
    await modeTab(page, "Page").click();
    const venue = page.locator('[data-page-id="n2"]');
    await venue.getByRole("button").click(); // "Click to add notes…"
    await venue.locator(".cm-content").click();
    await page.keyboard.type("Written in page mode");
    await page.keyboard.press("Escape");
    await expect(venue.locator(".clobmap-md")).toContainText("Written in page mode");
    await page.getByRole("tab", { name: "YAML" }).click();
    await expect(page.locator(".cm-content")).toContainText("Written in page mode");
  });

  test("page mode: arrow keys move the caret (not the page) while editing", async ({ page }) => {
    await openNotelets(page);
    await toc(page, "Venue").click();
    await modeTab(page, "Page").click();
    const venue = page.locator('[data-page-id="n2"]');
    await venue.getByRole("button").click();
    await venue.locator(".cm-content").click();
    await page.keyboard.type("abc");
    await page.keyboard.press("ArrowRight"); // must NOT page away
    await page.keyboard.press("ArrowLeft");
    expect(await firstPageId(page)).toBe("n2"); // still Venue
  });

  test("mobile: ☰ opens the ToC drawer, tapping a row navigates and closes it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.getByRole("tab", { name: "Notelets" }).click();
    await expect(page.locator("[data-page-id]").first()).toBeVisible();
    const tocBtn = page.getByRole("button", { name: "Show table of contents" });
    await expect(tocBtn).toBeVisible();
    await tocBtn.click();
    const dialog = page.getByRole("dialog", { name: "Table of contents" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("treeitem", { name: "Guests" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0); // navigated + closed
  });
});

/** On an actual mobile device (mobile UA), Notelets defaults to page mode.
 * We set only the UA (what the app's isMobile() checks) + a phone viewport —
 * the full device preset can't be used in a describe (it forces webkit). */
test.describe("Notelets on a mobile device", () => {
  test.use({
    userAgent: devices["iPhone 13"].userAgent,
    viewport: { width: 390, height: 844 },
  });

  test("defaults to page mode", async ({ page }) => {
    await page.goto("/app/");
    await page.getByRole("tab", { name: "Notelets" }).click();
    await expect(page.getByRole("tab", { name: "Page", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
