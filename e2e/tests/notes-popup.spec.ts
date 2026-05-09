import { expect, test, type Page } from "@playwright/test";
import { nodeByText, notesTextarea, openNotesPopup } from "../helpers/mindmap";

// Welcome-doc tree the specs in this file rely on:
//   Our wedding
//     Venue           → Ceremony, Reception
//     Guests          → Family, Friends
//     Vendors         → Catering, Photographer, Florist
//     Schedule        → Save the date, Send invites

// Generous timeout — absorbs the 1s auto-save debounce, the lazy
// micromark import, and any state propagation latency.
const SAVED_AUTOMATICALLY_TIMEOUT = 5_000;

async function typeAndWaitForSave(page: Page, text: string): Promise<void> {
  await notesTextarea(page).fill(text);
  await expect(page.getByText("Saved automatically")).toBeVisible({
    timeout: SAVED_AUTOMATICALLY_TIMEOUT,
  });
}

test.describe("notes popup (§6)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test.describe("§6.1 open / close", () => {
    test("6.1.1 N on selected node opens the popup with the textarea focused", async ({
      page,
    }) => {
      await openNotesPopup(page, "Venue");
      await expect(notesTextarea(page)).toBeFocused();
    });

    test("6.1.3 clicking the notepad icon opens the popup without selecting the node", async ({
      page,
    }) => {
      // Reception starts with no notes — icon shows the "Add notes" affordance.
      const node = nodeByText(page, "Reception");
      const wrapper = page.locator(".react-flow__node").filter({ has: node });
      const icon = wrapper.getByRole("button", { name: "Add notes" });
      await icon.click();
      await expect(page.getByRole("dialog", { name: /^Notes for Reception/ })).toBeVisible();
    });

    test("6.1.6 Space in the textarea types a space (does NOT toggle node collapse)", async ({
      page,
    }) => {
      await openNotesPopup(page, "Venue");
      await notesTextarea(page).focus();
      await page.keyboard.type("a b");
      await expect(notesTextarea(page)).toHaveValue("a b");
      // Venue's children would disappear if Space had bubbled to the canvas.
      await expect(nodeByText(page, "Ceremony")).toBeVisible();
    });
  });

  test.describe("§6.2 edit / preview modes", () => {
    test("6.2.1 default mode is edit", async ({ page }) => {
      await openNotesPopup(page, "Venue");
      await expect(notesTextarea(page)).toBeVisible();
      await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
    });

    test("6.2.2 / 6.2.3 Preview ↔ Edit toggle", async ({ page }) => {
      await openNotesPopup(page, "Venue");
      await notesTextarea(page).fill("# Hello\n\nbody");
      await page.getByRole("button", { name: "Preview" }).click();
      // Edit-mode textarea is gone; rendered heading is visible.
      await expect(notesTextarea(page)).toHaveCount(0);
      await expect(page.getByRole("dialog").getByRole("heading", { name: "Hello" })).toBeVisible();
      // Toggle back.
      await page.getByRole("button", { name: "Edit" }).click();
      await expect(notesTextarea(page)).toBeVisible();
    });

    test("6.2.5 micromark renders headings, bold, code blocks, and bullets", async ({ page }) => {
      await openNotesPopup(page, "Venue");
      await notesTextarea(page).fill(
        "# H1\n\n**strong**\n\n- one\n- two\n\n```\ncode\n```\n",
      );
      await page.getByRole("button", { name: "Preview" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "H1" })).toBeVisible();
      await expect(dialog.locator("strong", { hasText: "strong" })).toBeVisible();
      await expect(dialog.locator("li", { hasText: "one" })).toBeVisible();
      await expect(dialog.locator("pre code", { hasText: "code" })).toBeVisible();
    });
  });

  test.describe("§6.3 auto-save & accidental-close", () => {
    test("6.3.1 typing flips the footer status to 'Unsaved changes'", async ({ page }) => {
      await openNotesPopup(page, "Venue");
      await notesTextarea(page).fill("first edit");
      await expect(page.getByText("Unsaved changes")).toBeVisible();
    });

    test("6.3.2 auto-save fires ~1s after typing stops", async ({ page }) => {
      await openNotesPopup(page, "Venue");
      await notesTextarea(page).fill("auto-saved content");
      await expect(page.getByText("Saved automatically")).toBeVisible({
        timeout: SAVED_AUTOMATICALLY_TIMEOUT,
      });
      // Popup stays open after auto-save.
      await expect(page.getByRole("dialog")).toBeVisible();
    });

    test("6.3.3 backdrop click while dirty does NOT close the popup", async ({ page }) => {
      await openNotesPopup(page, "Venue");
      await notesTextarea(page).fill("unsaved");
      await expect(page.getByText("Unsaved changes")).toBeVisible();
      // Click backdrop region (top-left of the modal overlay, well away
      // from the dialog body which is centered in the viewport).
      await page.mouse.click(5, 5);
      await expect(page.getByRole("dialog")).toBeVisible();
    });

    test("6.3.4 Esc while dirty does NOT close the popup", async ({ page }) => {
      await openNotesPopup(page, "Venue");
      await notesTextarea(page).fill("dirty");
      await expect(page.getByText("Unsaved changes")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeVisible();
    });

    test("6.3.5 backdrop click after auto-save closes the popup", async ({ page }) => {
      await openNotesPopup(page, "Venue");
      await typeAndWaitForSave(page, "settled content");
      await page.mouse.click(5, 5);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("6.3.6 Cmd/Ctrl+Enter saves and closes regardless of dirty state", async ({ page }) => {
      await openNotesPopup(page, "Venue");
      await notesTextarea(page).fill("save-and-close content");
      await expect(page.getByText("Unsaved changes")).toBeVisible();
      await page.keyboard.press("ControlOrMeta+Enter");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      // Reopen to confirm the content was persisted.
      await openNotesPopup(page, "Venue");
      await expect(notesTextarea(page)).toHaveValue("save-and-close content");
    });

    test("6.3.7 Cancel button closes regardless of dirty state", async ({ page }) => {
      await openNotesPopup(page, "Reception");
      await notesTextarea(page).fill("about to bail");
      await expect(page.getByText("Unsaved changes")).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  });

  test.describe("§6.5 font-size controls", () => {
    test("6.5.1 / 6.5.2 / 6.5.3 A+ / A− / number-badge change the displayed size", async ({
      page,
    }) => {
      await openNotesPopup(page, "Venue");
      const badge = page.getByRole("button", { name: "Reset text size" });
      // Default is 14.
      await expect(badge).toHaveText("14");
      await page.getByRole("button", { name: "Increase text size" }).click();
      await expect(badge).toHaveText("15");
      await page.getByRole("button", { name: "Decrease text size" }).click();
      await page.getByRole("button", { name: "Decrease text size" }).click();
      await expect(badge).toHaveText("13");
      // Click the badge to reset.
      await badge.click();
      await expect(badge).toHaveText("14");
    });

    test("6.5.4 / 6.5.5 / 6.5.6 Cmd+= / Cmd+- / Cmd+0 work as keyboard shortcuts", async ({
      page,
    }) => {
      await openNotesPopup(page, "Venue");
      const badge = page.getByRole("button", { name: "Reset text size" });
      await page.keyboard.press("ControlOrMeta+=");
      await expect(badge).toHaveText("15");
      await page.keyboard.press("ControlOrMeta+-");
      await page.keyboard.press("ControlOrMeta+-");
      await expect(badge).toHaveText("13");
      await page.keyboard.press("ControlOrMeta+0");
      await expect(badge).toHaveText("14");
    });

    test("6.5.7 font size persists across close + reopen", async ({ page }) => {
      await openNotesPopup(page, "Venue");
      await page.getByRole("button", { name: "Increase text size" }).click();
      await page.getByRole("button", { name: "Increase text size" }).click();
      await expect(page.getByRole("button", { name: "Reset text size" })).toHaveText("16");
      // Close (clean popup — Esc works).
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await openNotesPopup(page, "Guests");
      await expect(page.getByRole("button", { name: "Reset text size" })).toHaveText("16");
      // Reset so we don't pollute the localStorage for subsequent tests
      // running in the same browser context.
      await page.keyboard.press("ControlOrMeta+0");
    });
  });

  test.describe("§6.7 notepad indicator icon", () => {
    test("6.7.1 a node with no notes shows the 'Add notes' tooltip", async ({ page }) => {
      const node = nodeByText(page, "Reception");
      const wrapper = page.locator(".react-flow__node").filter({ has: node });
      await expect(wrapper.getByRole("button", { name: "Add notes" })).toBeVisible();
    });

    test("6.7.2 a node gains the 'Open notes' affordance after content is saved", async ({
      page,
    }) => {
      // Save some notes so the icon flips to the "has notes" state.
      await openNotesPopup(page, "Reception");
      await notesTextarea(page).fill("Reception notes");
      await page.keyboard.press("ControlOrMeta+Enter");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const wrapper = page
        .locator(".react-flow__node")
        .filter({ has: nodeByText(page, "Reception") });
      await expect(wrapper.getByRole("button", { name: "Open notes" })).toBeVisible();
    });

    test("6.7.5 clicking the icon opens the popup without entering rename", async ({ page }) => {
      const node = nodeByText(page, "Reception");
      const wrapper = page.locator(".react-flow__node").filter({ has: node });
      await wrapper.getByRole("button", { name: "Add notes" }).click();
      await expect(page.getByRole("dialog", { name: /^Notes for Reception/ })).toBeVisible();
      // The inline rename textbox shouldn't have opened.
      await expect(page.getByRole("textbox", { name: "Rename node" })).toHaveCount(0);
    });
  });

  test("a saved note round-trips through the YAML view", async ({ page }) => {
    await openNotesPopup(page, "Venue");
    await notesTextarea(page).fill("Venue notes content");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Switch to the YAML view and verify the field appears in the source.
    await page.getByRole("tab", { name: "YAML" }).click();
    await expect(page.locator(".cm-content")).toContainText("Venue notes content");
  });
});
