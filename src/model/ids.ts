import type { MindDocument, MindNode } from "./types";

export interface IdGenerator {
  next(): string;
}

const ID_PREFIX = "n";

function parseSequentialId(id: string): number | null {
  if (!id.startsWith(ID_PREFIX)) return null;
  const rest = id.slice(ID_PREFIX.length);
  if (rest.length === 0) return null;
  const n = parseInt(rest, 36);
  if (Number.isNaN(n)) return null;
  if (n.toString(36) !== rest) return null;
  return n;
}

function maxSequentialId(node: MindNode): number {
  let max = parseSequentialId(node.id) ?? -1;
  for (const child of node.children) {
    const childMax = maxSequentialId(child);
    if (childMax > max) max = childMax;
  }
  return max;
}

export function createIdGenerator(seed = 0): IdGenerator {
  let counter = seed;
  return {
    next() {
      counter += 1;
      return `${ID_PREFIX}${counter.toString(36)}`;
    },
  };
}

export function idGeneratorForDocument(doc: MindDocument): IdGenerator {
  const seed = Math.max(0, maxSequentialId(doc.root));
  return createIdGenerator(seed);
}
