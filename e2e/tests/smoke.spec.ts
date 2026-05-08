import { expect, test } from "@playwright/test";
import { addChild, nodeByText } from "../helpers/mindmap";

const CHILD_LABEL = "Smoke test child";

test.describe("smoke", () => {
  test("welcome doc renders, Tab adds a child, YAML reflects the change", async ({ page }) => {
    await page.goto("/app/");

    // Welcome doc renders.
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
    await expect(nodeByText(page, "Venue")).toBeVisible();

    // Tab on the root creates a child and enters rename mode.
    await addChild(page, "Our wedding", CHILD_LABEL);

    // Toggling to the YAML view should show the new child in the
    // serialized document — proves the round-trip parse → mutate →
    // re-serialize path is intact.
    await page.getByRole("tab", { name: "YAML" }).click();
    await expect(page.locator(".cm-content")).toContainText(CHILD_LABEL);
  });
});
