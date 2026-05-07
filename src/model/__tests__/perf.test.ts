/**
 * One-off perf measurements on a 5000-node document. Not a regression
 * gate — just prints timings so we can see what's slow at the model
 * layer. Skipped by default; run with PERF=1 vitest run perf.
 *
 * Generate the fixture first:
 *   node scripts/gen-large-doc.mjs 5000 /tmp/perf-5k.clobmap.yaml
 */
import { describe, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  addChild,
  applyTreeToDocument,
  idGeneratorForDocument,
  parseLiveYaml,
  serializeLiveYaml,
  serializeYaml,
} from "..";
import { layoutMindMap } from "../../lib/layout";

const FIXTURE = "/tmp/perf-5k.clobmap.yaml";
const enabled = process.env.PERF === "1";

function ms(label: string, fn: () => void): void {
  const t = performance.now();
  fn();
  const elapsed = performance.now() - t;
  console.log(`  ${label.padEnd(28)} ${elapsed.toFixed(1)} ms`);
}

describe.skipIf(!enabled)("perf — 5k node doc", () => {
  it.skipIf(!existsSync(FIXTURE))("model layer timings", () => {
    const yaml = readFileSync(FIXTURE, "utf8");
    console.log(`\n  fixture:                     ${yaml.length} bytes\n`);

    let parsed: ReturnType<typeof parseLiveYaml>;
    ms("parseLiveYaml", () => {
      parsed = parseLiveYaml(yaml);
    });
    if (!parsed!.ok) throw new Error("parse failed");
    const tree = parsed!.value.tree;
    const yamlDoc = parsed!.value.doc;

    ms("layoutMindMap", () => {
      layoutMindMap(tree);
    });

    ms("layoutMindMap (cold x 3)", () => {
      for (let i = 0; i < 3; i++) layoutMindMap(tree);
    });

    ms("serializeYaml (full)", () => {
      serializeYaml(tree);
    });

    ms("serializeLiveYaml (AST)", () => {
      serializeLiveYaml(yamlDoc);
    });

    const ids = idGeneratorForDocument(tree);
    const result = addChild(tree, tree.root.id, "added", ids);
    ms("addChild + applyTree + serialize (single edit cycle)", () => {
      applyTreeToDocument(yamlDoc, result.doc);
      serializeLiveYaml(yamlDoc);
    });

    console.log("");
  });
});
