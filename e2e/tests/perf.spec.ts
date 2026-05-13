import { expect, test, type Page } from "@playwright/test";

// 50 nodes is the largest fixture that still has every node within React
// Flow's `onlyRenderVisibleElements` window after fitView at minZoom 0.1.
// Above ~80 nodes the auto-layout spreads wide enough that fitView zooms
// out far enough to cull everything from the DOM. The manual guide's
// 5000-node test is a desktop scenario; for headless CI signal a smaller
// fixture is enough to catch order-of-magnitude regressions in the
// parse → layout → render pipeline.
const NODE_COUNT = 50;
const FANOUT = 5;

interface Node {
  id: string;
  text: string;
  children: Node[];
}

function generateTree(target: number): { yaml: string; rootText: string } {
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    return `n${counter.toString(36)}`;
  };
  const build = (remaining: number, depth: number): { node: Node; used: number } => {
    const text = counter === 0 ? "PERF_ROOT" : `Node ${counter}`;
    const node: Node = { id: nextId(), text, children: [] };
    let used = 1;
    if (remaining <= 1 || depth >= 8) return { node, used };
    while (used < remaining && node.children.length < FANOUT) {
      const slice = Math.min(
        Math.ceil((remaining - used) / (FANOUT - node.children.length)),
        remaining - used,
      );
      if (slice <= 0) break;
      const sub = build(slice, depth + 1);
      node.children.push(sub.node);
      used += sub.used;
    }
    return { node, used };
  };
  const { node: root } = build(target, 0);
  const emit = (n: Node, indent: number): string => {
    const pad = " ".repeat(indent);
    let out = `${pad}- id: ${n.id}\n${pad}  text: ${JSON.stringify(n.text)}\n`;
    if (n.children.length === 0) out += `${pad}  children: []\n`;
    else {
      out += `${pad}  children:\n`;
      for (const c of n.children) out += emit(c, indent + 4);
    }
    return out;
  };
  const yaml =
    `title: Perf fixture (${counter} nodes)\nversion: 1\nroot:\n  id: ${root.id}\n  text: ${JSON.stringify(root.text)}\n  children:\n` +
    root.children.map((c) => emit(c, 4)).join("");
  return { yaml, rootText: root.text };
}

async function seedDraft(page: Page, yamlText: string): Promise<void> {
  await page.addInitScript(
    (y) => {
      window.localStorage.setItem(
        "clobmap-draft",
        JSON.stringify({ v: 1, yamlText: y, savedAt: Date.now() }),
      );
    },
    yamlText,
  );
}

test.describe("perf basics (§14)", () => {
  test(`14.1 a ${NODE_COUNT}-node fixture reaches first node-paint within 5s`, async ({
    page,
  }) => {
    const { yaml } = generateTree(NODE_COUNT);
    await seedDraft(page, yaml);
    const t0 = Date.now();
    await page.goto("/app/");
    await expect(page.locator(".react-flow__node").first()).toBeVisible({
      timeout: 5_000,
    });
    const elapsed = Date.now() - t0;
    // Generous CI budget. Local runs land well under 1s; 5s leaves
    // headroom for the slowest CI runner. The goal is to catch
    // order-of-magnitude regressions in parse / layout / render.
    expect(elapsed, `cold-load took ${elapsed}ms`).toBeLessThan(5_000);
  });

  test(`14.1 every node in the ${NODE_COUNT}-node fixture appears in the canvas`, async ({
    page,
  }) => {
    const { yaml } = generateTree(NODE_COUNT);
    await seedDraft(page, yaml);
    await page.goto("/app/");
    await expect(page.locator(".react-flow__node").first()).toBeVisible({
      timeout: 5_000,
    });
    // At this fixture size, fitView still zooms in enough that every node
    // sits inside the viewport — so they all render. If a future change
    // breaks the layout (or React Flow's culling) we'll see fewer than
    // expected here.
    await expect(page.locator(".react-flow__node")).toHaveCount(NODE_COUNT);
  });

  test(`14.3 Tab → rename-input focus completes within 3s on a ${NODE_COUNT}-node fixture`, async ({
    page,
  }) => {
    const { yaml } = generateTree(NODE_COUNT);
    await seedDraft(page, yaml);
    await page.goto("/app/");
    const firstNode = page.locator(".react-flow__node").first();
    await expect(firstNode).toBeVisible({ timeout: 5_000 });
    // Robust select-then-confirm: React Flow's onNodeClick has a short
    // window after mount where a click can land before the listener is
    // wired (most visible on WebKit/Firefox under parallel-load).
    // Re-click until aria-selected flips so the Tab handler has a real
    // selection to operate on. Mirrors the helper in helpers/mindmap.ts.
    const treeItem = firstNode.getByRole("treeitem");
    await expect
      .poll(
        async () => {
          const selected = await treeItem.getAttribute("aria-selected");
          if (selected === "true") return "true";
          await firstNode.click({ timeout: 1_000 }).catch(() => {});
          return selected ?? "false";
        },
        { timeout: 10_000, intervals: [200, 400, 800] },
      )
      .toBe("true");
    const t0 = Date.now();
    await page.keyboard.press("Tab");
    const rename = page.getByRole("textbox", { name: "Rename node" });
    await expect(rename).toBeFocused();
    const elapsed = Date.now() - t0;
    // Manual guide targets <100ms perceived. Local runs land ~200ms;
    // under heavy parallel-load (full suite × 3 browsers) Firefox can
    // exceed 2s. 3000ms still catches order-of-magnitude regressions
    // (anything 30× the target) without flaking on contended runners.
    expect(elapsed, `Tab→rename-focus took ${elapsed}ms`).toBeLessThan(3_000);
  });
});
