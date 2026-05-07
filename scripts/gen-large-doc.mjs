#!/usr/bin/env node
/**
 * Generate a large clobmap document for performance testing. Writes a
 * .clobmap.yaml with N total nodes arranged as a balanced tree.
 *
 *   node scripts/gen-large-doc.mjs                 # default 5000 nodes
 *   node scripts/gen-large-doc.mjs 5000 perf-5k.clobmap.yaml
 */
import fs from "node:fs";
import path from "node:path";

const target = parseInt(process.argv[2] ?? "5000", 10);
const outFile = path.resolve(process.argv[3] ?? "perf-5k.clobmap.yaml");

if (!Number.isFinite(target) || target < 1) {
  console.error("Usage: node scripts/gen-large-doc.mjs [count] [outfile]");
  process.exit(1);
}

// Build a balanced tree with branching factor 5 (so 5k nodes = depth 6).
const FANOUT = 5;
const labels = [
  "Strategy", "Research", "Design", "Engineering", "Marketing",
  "Q1", "Q2", "Q3", "Q4", "Roadmap",
  "Frontend", "Backend", "Infra", "Data", "Mobile",
  "Onboarding", "Billing", "Auth", "Analytics", "Search",
  "Bug", "Feature", "Spike", "Refactor", "Polish",
];

let counter = 0;
function nextId() {
  counter += 1;
  return `n${counter.toString(36)}`;
}

function buildSubtree(remaining, depth) {
  const node = {
    id: nextId(),
    text: `${labels[Math.floor(Math.random() * labels.length)]} ${counter}`,
    children: [],
  };
  remaining -= 1;
  if (remaining <= 0 || depth >= 8) return { node, used: 1 };

  let used = 1;
  while (used < remaining + 1 && node.children.length < FANOUT) {
    const slice = Math.min(
      Math.ceil((remaining - (used - 1)) / (FANOUT - node.children.length)),
      remaining - (used - 1),
    );
    if (slice <= 0) break;
    const sub = buildSubtree(slice, depth + 1);
    node.children.push(sub.node);
    used += sub.used;
  }
  return { node, used };
}

const result = buildSubtree(target, 0);
const root = result.node;

function emit(node, indent) {
  const pad = " ".repeat(indent);
  let out = `${pad}- id: ${node.id}\n${pad}  text: ${JSON.stringify(node.text)}\n`;
  if (node.children.length === 0) {
    out += `${pad}  children: []\n`;
  } else {
    out += `${pad}  children:\n`;
    for (const child of node.children) out += emit(child, indent + 4);
  }
  return out;
}

const yaml =
  `title: Perf test (${counter} nodes)\nversion: 1\nroot:\n  id: ${root.id}\n  text: ${JSON.stringify(root.text)}\n  children:\n` +
  root.children.map((c) => emit(c, 4)).join("");

fs.writeFileSync(outFile, yaml);
console.log(`Wrote ${counter} nodes to ${outFile} (${fs.statSync(outFile).size} bytes)`);
