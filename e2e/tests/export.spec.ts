import { expect, test, type Page } from "@playwright/test";
import { nodeByText } from "../helpers/mindmap";

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
});
