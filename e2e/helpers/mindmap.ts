import { expect, type Page, type Locator } from "@playwright/test";

export function nodeByText(page: Page, text: string): Locator {
  return page.getByRole("treeitem").filter({ hasText: new RegExp(`^${escapeRegExp(text)}`) });
}

export async function selectNode(page: Page, text: string): Promise<void> {
  const node = nodeByText(page, text);
  const wrapper = page.locator(".react-flow__node").filter({ has: node });
  // React Flow's onNodeClick handler runs on its own event delegation
  // pipeline, and there's a small window after mount where a click can
  // land before the listener is fully wired (most visible on Firefox).
  // Re-click until aria-selected flips, with a hard timeout.
  await expect
    .poll(
      async () => {
        const selected = await node.getAttribute("aria-selected");
        if (selected === "true") return "true";
        await wrapper.click({ timeout: 1_000 }).catch(() => {});
        return selected ?? "false";
      },
      { timeout: 10_000, intervals: [200, 400, 800] },
    )
    .toBe("true");
}

export async function addChild(page: Page, parentText: string, childText: string): Promise<void> {
  await selectNode(page, parentText);
  await page.keyboard.press("Tab");
  const rename = page.getByRole("textbox", { name: "Rename node" });
  // The new child auto-enters rename mode with focus + selectAll. fill()
  // sets the value directly, which is more reliable than type() across
  // engines (WebKit's selectAll-on-focus timing differs from Chromium).
  await expect(rename).toBeFocused();
  await rename.fill(childText);
  await page.keyboard.press("Enter");
  await expect(rename).toHaveCount(0);
  await expect(nodeByText(page, childText)).toBeVisible();
}

/**
 * Open the notes popup for a given node by selecting it and pressing N.
 * Returns the dialog locator. Caller is responsible for closing it (Esc
 * works only when the dialog is clean — use Cancel button or Cmd+Enter
 * if the popup may be dirty).
 */
export async function openNotesPopup(page: Page, nodeText: string): Promise<Locator> {
  await selectNode(page, nodeText);
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: new RegExp(`^Notes for `) });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Locator for the notes-popup textarea (only present in edit mode). */
export function notesTextarea(page: Page): Locator {
  return page
    .getByRole("dialog")
    .locator("textarea");
}

export async function waitForDraftPersisted(page: Page, marker: string): Promise<void> {
  await page.waitForFunction(
    (needle) => {
      const raw = window.localStorage.getItem("clobmap-draft");
      return !!raw && raw.includes(needle);
    },
    marker,
    { timeout: 5_000 },
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
