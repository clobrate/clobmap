import { expect, test, type Page } from "@playwright/test";
import { addChild, nodeByText, selectNode } from "../helpers/mindmap";

// The welcome doc ships in `layoutMode: manual` with explicit positions
// for every node. These tests start from that state and exercise the
// toggle in both directions.

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

async function closeSettings(page: Page) {
  // Click on the canvas (anywhere outside the menu) to dismiss.
  await page.getByRole("heading", { name: "clobmap" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

/**
 * Read the *complete* YAML the editor is holding right now. We can't
 * use `.cm-content`'s textContent because CodeMirror virtualizes the
 * gutter — fields near the bottom of an 80-line doc aren't in the DOM.
 * The localStorage draft, on the other hand, mirrors the full YAML
 * after the 500 ms debounced save. Wait for it, then read.
 */
async function yamlText(page: Page): Promise<string> {
  // Trigger a debounced draft save by tickling the document — the
  // settings-menu mutations land via applyTreeChange, which sets
  // isDirty=true, which the draft tracker debounces to 500 ms. Give it
  // 750 ms to flush and ride out any state-update races.
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

test.describe("layout mode (§16)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test("16.1.1 Layout segmented control reflects the document's mode", async ({ page }) => {
    await openSettings(page);
    // Welcome doc starts in Manual.
    await expect(page.getByRole("button", { name: "Manual" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Auto" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("16.5.1 Reset-positions button is visible in Manual, hidden in Auto", async ({ page }) => {
    await openSettings(page);
    await expect(page.getByRole("button", { name: "Reset positions" })).toBeVisible();

    await page.getByRole("button", { name: "Auto" }).click();
    await expect(page.getByRole("button", { name: "Reset positions" })).toHaveCount(0);

    await page.getByRole("button", { name: "Manual" }).click();
    await expect(page.getByRole("button", { name: "Reset positions" })).toBeVisible();
  });

  test("16.1.4 Manual → Auto removes layoutMode but preserves stored positions", async ({
    page,
  }) => {
    // The implementation deliberately keeps `position` fields across
    // mode toggles so a Manual → Auto → Manual round-trip restores
    // exactly the manual layout (see `setLayoutMode` comment). Only the
    // `layoutMode` key itself flips.
    await openSettings(page);
    await page.getByRole("button", { name: "Auto" }).click();
    // Wait for the toggle to settle through the debounced parse before
    // closing the menu and switching tabs — otherwise the second
    // assertion races with stale state.
    await expect(page.getByRole("button", { name: "Auto" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await closeSettings(page);

    const text = await yamlText(page);
    expect(text).not.toMatch(/\blayoutMode:/);
    expect(text).toMatch(/\bposition:/);
  });

  test("16.1.2 / 16.1.3 Auto → Manual writes layoutMode back into YAML", async ({ page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: "Auto" }).click();
    await expect(page.getByRole("button", { name: "Auto" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "Manual" }).click();
    await expect(page.getByRole("button", { name: "Manual" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await closeSettings(page);

    const text = await yamlText(page);
    expect(text).toMatch(/layoutMode:\s*manual/);
    expect(text.match(/\bposition:/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(text).toMatch(/\bx:\s*\d/);
    expect(text).toMatch(/\by:\s*\d/);
  });

  test("16.7.1 Tab in manual mode adds a child without breaking other positions", async ({
    page,
  }) => {
    // Snapshot one existing position before the mutation.
    const before = await yamlText(page);
    const venuePos = before.match(/text: Venue\s+position:\s+x: (\d+)\s+y: (\d+)/);
    expect(venuePos).not.toBeNull();

    await addChild(page, "Vendors", "DJ");

    const after = await yamlText(page);
    expect(after).toMatch(/text: DJ/);
    expect(after).toMatch(/layoutMode:\s*manual/);
    // Venue's coordinates are byte-for-byte unchanged.
    if (venuePos) {
      const [, vx, vy] = venuePos;
      expect(after).toMatch(
        new RegExp(`text: Venue\\s+position:\\s+x: ${vx}\\s+y: ${vy}`),
      );
    }
  });

  test("16.7.2 deleting a node in manual mode preserves remaining positions", async ({ page }) => {
    const before = await yamlText(page);
    const guestsPos = before.match(/text: Guests\s+position:\s+x: (\d+)\s+y: (\d+)/);
    expect(guestsPos).not.toBeNull();

    await selectNode(page, "Reception");
    await page.keyboard.press("Delete");
    await expect(nodeByText(page, "Reception")).toHaveCount(0);

    const after = await yamlText(page);
    expect(after).not.toMatch(/text: Reception/);
    if (guestsPos) {
      const [, gx, gy] = guestsPos;
      expect(after).toMatch(
        new RegExp(`text: Guests\\s+position:\\s+x: ${gx}\\s+y: ${gy}`),
      );
    }
  });
});
