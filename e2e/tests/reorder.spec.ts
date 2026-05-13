import { expect, test, type Page } from "@playwright/test";
import { nodeByText, selectNode } from "../helpers/mindmap";

// Welcome-doc tree the specs in this file rely on:
//   Our wedding
//     Venue           → Ceremony, Reception
//     Guests          → Family, Friends
//     Vendors         → Catering, Photographer, Florist
//     Schedule        → Save the date, Send invites

/**
 * Read the YAML the editor is currently holding via the debounced draft in
 * localStorage. Same trick as layout-mode.spec.ts — see that file's
 * `yamlText` helper for why we can't read the CodeMirror DOM directly.
 */
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

/** Return the order of the three "Vendors" children in the YAML, by first match. */
function vendorOrder(yaml: string): string[] {
  const labels = ["Catering", "Photographer", "Florist"];
  return labels
    .map((l) => ({ l, i: yaml.indexOf(`text: ${l}`) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.l);
}

test.describe("reorder siblings (Alt+Arrow)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test("Alt+ArrowUp moves the selected node above its previous sibling", async ({ page }) => {
    expect(vendorOrder(await yamlText(page))).toEqual(["Catering", "Photographer", "Florist"]);
    await selectNode(page, "Photographer");
    await page.keyboard.down("Alt");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.up("Alt");
    expect(vendorOrder(await yamlText(page))).toEqual(["Photographer", "Catering", "Florist"]);
  });

  test("Alt+ArrowDown moves the selected node below its next sibling", async ({ page }) => {
    await selectNode(page, "Photographer");
    await page.keyboard.down("Alt");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.up("Alt");
    expect(vendorOrder(await yamlText(page))).toEqual(["Catering", "Florist", "Photographer"]);
  });

  test("Alt+ArrowUp at the first sibling is a no-op", async ({ page }) => {
    await selectNode(page, "Catering");
    await page.keyboard.press("Alt+ArrowUp");
    expect(vendorOrder(await yamlText(page))).toEqual(["Catering", "Photographer", "Florist"]);
  });

  test("Alt+ArrowDown at the last sibling is a no-op", async ({ page }) => {
    await selectNode(page, "Florist");
    await page.keyboard.press("Alt+ArrowDown");
    expect(vendorOrder(await yamlText(page))).toEqual(["Catering", "Photographer", "Florist"]);
  });

  test("Alt+ArrowUp on the root is a no-op", async ({ page }) => {
    await selectNode(page, "Our wedding");
    const before = await yamlText(page);
    await page.keyboard.press("Alt+ArrowUp");
    const after = await yamlText(page);
    expect(after).toBe(before);
  });
});
