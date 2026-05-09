import { expect, test } from "@playwright/test";
import { addChild, nodeByText } from "../helpers/mindmap";

const BANNER_KEY = "clobmap.welcomeBannerDismissed";

test.describe("boot — welcome banner (§1)", () => {
  test("1.1 first launch shows the welcome banner above the canvas", async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
    // Banner copy mentions Tab and Enter shortcuts — match a robust substring.
    await expect(page.getByText(/A mind map breaks a topic into branches/)).toBeVisible();
  });

  test("1.5 dismissing the banner persists across a reload", async ({ page }) => {
    await page.goto("/app/");
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
    const banner = page.getByText(/A mind map breaks a topic into branches/);
    await expect(banner).toBeVisible();
    await page.getByRole("button", { name: "Dismiss welcome message" }).click();
    await expect(banner).toHaveCount(0);
    // Confirm the localStorage flag landed.
    const flag = await page.evaluate((k) => window.localStorage.getItem(k), BANNER_KEY);
    expect(flag).toBe("1");
    await page.reload();
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
    await expect(banner).toHaveCount(0);
  });

  test("1.5 a dirty edit hides the banner without setting the dismiss flag", async ({ page }) => {
    await page.goto("/app/");
    const banner = page.getByText(/A mind map breaks a topic into branches/);
    await expect(banner).toBeVisible();
    // Make any edit — the banner auto-hides for dirty docs.
    await addChild(page, "Venue", "DirtyEdit");
    await expect(banner).toHaveCount(0);
    // The dismiss flag is NOT written — only the explicit × button writes
    // it. (Auto-hide is for the in-memory state only.)
    const flag = await page.evaluate((k) => window.localStorage.getItem(k), BANNER_KEY);
    expect(flag).toBeNull();
  });
});
