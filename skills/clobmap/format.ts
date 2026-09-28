/** Text formatting for the CLI: an outline of the tree and a line diff for
 * `--dry-run`. Pure — no I/O. */
import type { MindDocument, MindNode } from "../../src/model/types";

/** A readable outline: title, then each node indented by depth with its id
 * (and tags/color when present). */
export function outline(tree: MindDocument): string {
  const lines: string[] = [];
  const walk = (n: MindNode, depth: number): void => {
    const tags = n.tags && n.tags.length > 0 ? `  #${n.tags.join(" #")}` : "";
    const color = n.color ? `  (${n.color})` : "";
    lines.push(`${"  ".repeat(depth)}${n.text} [${n.id}]${tags}${color}`);
    for (const c of n.children) walk(c, depth + 1);
  };
  walk(tree.root, 0);
  return `${tree.title ?? "(untitled)"}\n${lines.join("\n")}`;
}

/**
 * A compact LCS-based line diff (`-` removed, `+` added, ` ` unchanged) — good
 * enough to preview a `--dry-run` edit. Unchanged runs longer than 2*context
 * are collapsed to a `  …` marker.
 */
export function lineDiff(before: string, after: string, context = 2): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const m = a.length;
  const n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const rows: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      rows.push(`  ${a[i]}`);
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push(`- ${a[i]}`);
      i += 1;
    } else {
      rows.push(`+ ${b[j]}`);
      j += 1;
    }
  }
  while (i < m) rows.push(`- ${a[i++]}`);
  while (j < n) rows.push(`+ ${b[j++]}`);

  // Collapse long unchanged runs.
  const changed = rows.map((r) => r[0] !== " ");
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((_, idx) => {
    if (changed[idx]) {
      for (let k = Math.max(0, idx - context); k <= Math.min(rows.length - 1, idx + context); k += 1) {
        keep[k] = true;
      }
    }
  });
  if (keep.every((k) => !k)) return "(no changes)";
  const out: string[] = [];
  let elided = false;
  rows.forEach((r, idx) => {
    if (keep[idx]) {
      out.push(r);
      elided = false;
    } else if (!elided) {
      out.push("  …");
      elided = true;
    }
  });
  return out.join("\n");
}
