import { expect, test, type Page } from "@playwright/test";
import YAML from "yaml";
import { addChild, nodeByText, selectNode } from "../helpers/mindmap";

interface YamlNode {
  id: string;
  text: string;
  position?: { x: number; y: number };
  children: YamlNode[];
}
interface YamlDoc {
  root: YamlNode;
  layoutMode?: string;
}

/** Find a node by its `text` field, depth-first from the root. */
function findByText(node: YamlNode, text: string): YamlNode | null {
  if (node.text === text) return node;
  for (const c of node.children ?? []) {
    const f = findByText(c, text);
    if (f) return f;
  }
  return null;
}

async function readDoc(page: Page): Promise<YamlDoc> {
  return YAML.parse(await yamlText(page)) as YamlDoc;
}

// The welcome doc ships in canonical auto layout (no `layoutMode` key,
// no per-node positions) — tests that need manual mode flip via the
// Settings → Layout segmented control.

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
 * Switch the document into manual mode via the Settings UI. Materializes
 * positions for every node from the current auto layout (so subsequent
 * drag tests have positions to compare against).
 */
async function enterManualMode(page: Page) {
  await openSettings(page);
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  await expect(page.getByRole("button", { name: "Manual", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await closeSettings(page);
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
    // Welcome doc ships in canonical Auto.
    await expect(page.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Manual", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("16.1.4 Manual → Auto removes layoutMode but preserves stored positions", async ({
    page,
  }) => {
    // The implementation deliberately keeps `position` fields across
    // mode toggles so a Manual → Auto → Manual round-trip restores
    // exactly the manual layout (see `setLayoutMode` comment). Only the
    // `layoutMode` key itself flips. Step into manual first so the
    // welcome doc has positions to round-trip.
    await enterManualMode(page);
    await openSettings(page);
    await page.getByRole("button", { name: "Auto", exact: true }).click();
    await expect(page.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await closeSettings(page);

    const text = await yamlText(page);
    expect(text).not.toMatch(/\blayoutMode:/);
    expect(text).toMatch(/\bposition:/);
  });

  test("16.1.2 / 16.1.3 Auto → Manual writes layoutMode back into YAML", async ({ page }) => {
    // Welcome doc starts in Auto. Click Manual; layoutMode + materialized
    // positions appear in the YAML.
    await openSettings(page);
    await page.getByRole("button", { name: "Manual", exact: true }).click();
    await expect(page.getByRole("button", { name: "Manual", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await closeSettings(page);

    const text = await yamlText(page);
    expect(text).toMatch(/layoutMode:\s*manual/);
    expect(text.match(/\bposition:/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(text).toMatch(/\bx:\s*-?\d/);
    expect(text).toMatch(/\by:\s*-?\d/);
  });

  test("16.7.1 Tab in manual mode adds a child without breaking other positions", async ({
    page,
  }) => {
    await enterManualMode(page);
    const before = await readDoc(page);
    const venueBefore = findByText(before.root, "Venue");
    expect(venueBefore?.position).toBeDefined();

    await addChild(page, "Vendors", "DJ");

    const after = await readDoc(page);
    expect(after.layoutMode).toBe("manual");
    expect(findByText(after.root, "DJ")).not.toBeNull();
    // Venue's coordinates are byte-for-byte unchanged.
    expect(findByText(after.root, "Venue")?.position).toEqual(venueBefore?.position);
  });

  test("'Reset to Auto' wipes every saved position and flips layoutMode back to auto", async ({
    page,
  }) => {
    // Step into Manual first so there are positions + a layoutMode key
    // for the reset to actually wipe.
    await enterManualMode(page);
    await openSettings(page);
    await page.getByRole("button", { name: "Reset to Auto (clear saved positions)" }).click();
    const text = await yamlText(page);
    expect(text).not.toMatch(/\blayoutMode:/);
    expect(text).not.toMatch(/\bposition:/);
  });

  test("16.3 first drag in auto mode auto-switches to manual and persists positions", async ({
    page,
  }) => {
    // Welcome doc starts in canonical Auto (no `layoutMode`, no positions).
    const before = await readDoc(page);
    expect(before.layoutMode).toBeUndefined();
    expect(findByText(before.root, "Venue")?.position).toBeUndefined();

    // Drag Venue.
    const venueWrapper = page.locator(".react-flow__node").filter({ has: nodeByText(page, "Venue") });
    const box = await venueWrapper.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await venueWrapper.hover();
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 100, { steps: 12 });
    await page.mouse.up();

    // Auto-switch: layoutMode flips to manual, every visible node freezes
    // at its rendered position (so the rest of the layout doesn't reflow).
    const after = await readDoc(page);
    expect(after.layoutMode).toBe("manual");
    expect(findByText(after.root, "Venue")?.position).toBeDefined();
  });

  test("16.2 dragging a node in manual mode persists the new position to YAML", async ({
    page,
  }) => {
    await enterManualMode(page);
    const venueWrapper = page.locator(".react-flow__node").filter({ has: nodeByText(page, "Venue") });
    const box = await venueWrapper.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const before = await readDoc(page);
    const venueBefore = findByText(before.root, "Venue")?.position;
    expect(venueBefore).toBeDefined();

    await venueWrapper.hover();
    await page.mouse.down();
    await page.mouse.move(box.x + 250, box.y + 150, { steps: 12 });
    await page.mouse.up();

    const after = await readDoc(page);
    const venueAfter = findByText(after.root, "Venue")?.position;
    expect(venueAfter).toBeDefined();
    expect(venueAfter).not.toEqual(venueBefore);
    expect(after.layoutMode).toBe("manual");
  });

  test("16.4 a new child added in manual mode has no `position` field until dragged", async ({
    page,
  }) => {
    await enterManualMode(page);
    await addChild(page, "Vendors", "BrandNewChild");
    const yaml = await yamlText(page);
    // The new child sits in the YAML…
    expect(yaml).toMatch(/text: BrandNewChild/);
    // …but its block doesn't carry a `position:` field. The new child's
    // block is `text: BrandNewChild\n      children: []` — no position
    // line in between. (Layout coords are computed at render time, not
    // stored, until the user drags it.)
    expect(yaml).toMatch(/text: BrandNewChild\s+children:/);
  });

  test("16.6 manual-mode dragged positions survive a full reload", async ({ page }) => {
    await enterManualMode(page);
    // Drag Venue to a recognisable spot.
    const venueWrapper = page.locator(".react-flow__node").filter({ has: nodeByText(page, "Venue") });
    const box = await venueWrapper.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await venueWrapper.hover();
    await page.mouse.down();
    await page.mouse.move(box.x + 180, box.y + 90, { steps: 12 });
    await page.mouse.up();

    const before = await readDoc(page);
    const venueBefore = findByText(before.root, "Venue")?.position;
    expect(venueBefore).toBeDefined();

    await page.reload();
    await expect(nodeByText(page, "Our wedding")).toBeVisible();

    const after = await readDoc(page);
    expect(findByText(after.root, "Venue")?.position).toEqual(venueBefore);
  });

  test("16.7.2 deleting a node in manual mode preserves remaining positions", async ({ page }) => {
    await enterManualMode(page);
    const before = await readDoc(page);
    const guestsBefore = findByText(before.root, "Guests")?.position;
    expect(guestsBefore).toBeDefined();

    await selectNode(page, "Reception");
    await page.keyboard.press("Delete");
    await expect(nodeByText(page, "Reception")).toHaveCount(0);

    const after = await readDoc(page);
    expect(findByText(after.root, "Reception")).toBeNull();
    expect(findByText(after.root, "Guests")?.position).toEqual(guestsBefore);
  });
});
