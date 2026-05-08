import { expect, test } from "@playwright/test";
import { addChild, nodeByText, waitForDraftPersisted } from "../helpers/mindmap";

const CHILD_LABEL = "Draft survives reload";

test.describe("draft persistence", () => {
  test("unsaved edits survive a full page reload", async ({ page }) => {
    await page.goto("/app/");

    await expect(nodeByText(page, "Our wedding")).toBeVisible();
    await addChild(page, "Our wedding", CHILD_LABEL);

    // The draft auto-saves on a 500ms debounce — wait for it to flush
    // to localStorage before reloading.
    await waitForDraftPersisted(page, CHILD_LABEL);

    await page.reload();

    // After reload the bootstrap path reads the draft and replays it as
    // the active document, so the child we added must still be on the
    // canvas.
    await expect(nodeByText(page, CHILD_LABEL)).toBeVisible();
    await expect(nodeByText(page, "Our wedding")).toBeVisible();
  });

  test("a second reload still has the draft (the load itself isn't a clear)", async ({ page }) => {
    await page.goto("/app/");
    await addChild(page, "Our wedding", CHILD_LABEL);
    await waitForDraftPersisted(page, CHILD_LABEL);

    await page.reload();
    await expect(nodeByText(page, CHILD_LABEL)).toBeVisible();

    // Second reload: the draft was loaded on the previous boot but must
    // not have been wiped just because the loaded text matched
    // originalText (isDirty=false). Web docs without a file path are
    // draft-backed by definition.
    await page.reload();
    await expect(nodeByText(page, CHILD_LABEL)).toBeVisible();
  });
});
