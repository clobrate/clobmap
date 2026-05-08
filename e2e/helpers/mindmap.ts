import { expect, type Page, type Locator } from "@playwright/test";

export function nodeByText(page: Page, text: string): Locator {
  return page.getByRole("treeitem").filter({ hasText: new RegExp(`^${escapeRegExp(text)}`) });
}

export async function selectNode(page: Page, text: string): Promise<void> {
  const node = nodeByText(page, text);
  await node.click();
  await expect(node).toHaveAttribute("aria-selected", "true");
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
