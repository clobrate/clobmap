import { expect, test, type Page } from "@playwright/test";
import { nodeByText } from "../helpers/mindmap";

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test.describe("settings menu (§8)", () => {
  test.beforeEach(async ({ page }) => {
    // Capture window.open targets so we can verify external-link buttons
    // route to the right URL without opening anything in the test runner.
    await page.addInitScript(() => {
      (window as unknown as { __opens: string[] }).__opens = [];
      const original = window.open.bind(window);
      window.open = ((url?: string | URL) => {
        if (typeof url === "string") {
          (window as unknown as { __opens: string[] }).__opens.push(url);
        }
        return original.call(window, "about:blank") as Window | null;
      }) as typeof window.open;
    });
    await page.goto("/app/");
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test("8.1 Theme buttons toggle the dark class on <html>", async ({ page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page.getByRole("button", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("8.2 Font-size slider drives the YAML editor's font size", async ({ page }) => {
    await page.getByRole("tab", { name: "YAML" }).click();
    const editor = page.locator(".cm-editor");
    await openSettings(page);

    const slider = page.getByRole("slider", { name: "Font size" });
    // React's controlled-input wrapper observes the native value setter
    // and ignores plain `el.value = …` assignments. Bypass via the
    // prototype setter, then dispatch the input event React listens for.
    await slider.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(el, "20");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await expect
      .poll(async () =>
        editor.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      )
      .toBeGreaterThanOrEqual(20);
  });

  test("8.7 Privacy button routes to the PRIVACY.md URL on GitHub", async ({ page }) => {
    await openSettings(page);
    await page.getByRole("menuitem", { name: "Privacy" }).click();
    const opens = await page.evaluate(() => (window as unknown as { __opens: string[] }).__opens);
    expect(opens).toContain("https://github.com/clobrate/clobmap/blob/main/PRIVACY.md");
  });

  test("8.8 Report-an-issue button routes to the GitHub issue template", async ({ page }) => {
    await openSettings(page);
    await page.getByRole("menuitem", { name: "Report an issue" }).click();
    const opens = await page.evaluate(() => (window as unknown as { __opens: string[] }).__opens);
    expect(opens).toContain("https://github.com/clobrate/clobmap/issues/new?labels=bug");
  });
});
