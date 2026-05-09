import { expect, test, type Page } from "@playwright/test";
import { nodeByText, notesTextarea, openNotesPopup } from "../helpers/mindmap";

const isMac = process.platform === "darwin";
const META = isMac ? "Meta" : "Control";

async function openFileMenu(page: Page) {
  await page.getByRole("button", { name: "File" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test.describe("export (§7)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test("7.1–7.3 PNG / SVG / PDF are disabled when only the YAML view is showing", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: "YAML" }).click();
    await openFileMenu(page);
    for (const label of ["PNG (image)", "SVG (vector)", "PDF"]) {
      await expect(page.getByRole("menuitem", { name: label })).toBeDisabled();
    }
    // Markdown is always enabled.
    await expect(page.getByRole("menuitem", { name: "Markdown outline" })).toBeEnabled();
  });

  test("7.1–7.3 PNG / SVG / PDF are enabled in the Mind-map view", async ({ page }) => {
    // Mind-map is the default tab on cold launch.
    await openFileMenu(page);
    for (const label of ["PNG (image)", "SVG (vector)", "PDF"]) {
      await expect(page.getByRole("menuitem", { name: label })).toBeEnabled();
    }
  });

  test("7.4 / 7.7 Markdown export downloads an outline matching the tree shape", async ({
    page,
  }) => {
    await openFileMenu(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Markdown outline" }).click();
    const dl = await downloadPromise;
    expect(dl.suggestedFilename()).toMatch(/\.md$/);
    const path = await dl.path();
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(path, "utf8");
    // Title heading + a couple of known nodes from the welcome doc.
    expect(content).toMatch(/^# Wedding planning/m);
    expect(content).toMatch(/Our wedding/);
    expect(content).toMatch(/Venue/);
    expect(content).toMatch(/Ceremony/);
  });

  test("7.7 PNG export triggers a browser download", async ({ page }) => {
    await openFileMenu(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "PNG (image)" }).click();
    const dl = await downloadPromise;
    expect(dl.suggestedFilename()).toMatch(/\.png$/i);
  });

  test("7.7 SVG export triggers a browser download with .svg suffix", async ({ page }) => {
    await openFileMenu(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "SVG (vector)" }).click();
    const dl = await downloadPromise;
    expect(dl.suggestedFilename()).toMatch(/\.svg$/i);
  });

  test.describe("All notes (Markdown) export", () => {
    test("filename uses .notes.YYYYMMDDHHmm.md suffix", async ({ page }) => {
      await openFileMenu(page);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: "All notes (Markdown)" }).click();
      const dl = await downloadPromise;
      expect(dl.suggestedFilename()).toMatch(/\.notes\.\d{12}\.md$/);
    });

    test("emits a heading per node and `no notes found` for empty nodes", async ({ page }) => {
      await openFileMenu(page);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: "All notes (Markdown)" }).click();
      const dl = await downloadPromise;
      const path = await dl.path();
      const fs = await import("node:fs/promises");
      const content = await fs.readFile(path, "utf8");
      // Welcome doc has no notes anywhere — every node should get the placeholder.
      expect(content).toContain("# Our wedding (n1)");
      expect(content).toContain("# Venue (n2)");
      expect(content).toContain("# Ceremony (n3)");
      // Every section ends with the placeholder body when there are no notes.
      expect(content).toContain("__ no notes found __");
    });

    test("inlines saved notes under each heading and demotes inner headings", async ({ page }) => {
      // Save notes on Venue with a `# Inner` heading — exporter should
      // demote it so it sits below the per-node `# Venue (n2)` heading.
      await openNotesPopup(page, "Venue");
      await notesTextarea(page).fill("# Inner heading\n\nbody text");
      await page.keyboard.press(`${META}+Enter`);
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await openFileMenu(page);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: "All notes (Markdown)" }).click();
      const dl = await downloadPromise;
      const path = await dl.path();
      const fs = await import("node:fs/promises");
      const content = await fs.readFile(path, "utf8");
      // The Venue section contains the demoted heading + body.
      expect(content).toMatch(/# Venue \(n2\)\n\n## Inner heading\n\nbody text/);
      // Sibling without notes still gets the placeholder.
      expect(content).toMatch(/# Reception \(n4\)\n\n__ no notes found __/);
    });
  });
});
