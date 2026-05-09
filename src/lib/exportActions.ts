import { getNodesBounds, getViewportForBounds } from "@xyflow/react";
import type { ReactFlowInstance } from "@xyflow/react";
// html-to-image and jspdf are dynamically imported inside the action
// functions below so they don't ship in the main bundle (~250 kB saved
// on first paint for users who never export).
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import type { MindDocument, MindNode } from "../model";
import { isTauri } from "./env";
import { loadNotes } from "./notes";

// Export width in pixels. Tall maps preserve aspect ratio. 2048 is the
// sweet spot: sharp at retina display sizes, not so big that PDF
// embedding chokes.
const EXPORT_WIDTH = 2048;
const EXPORT_PADDING = 0.05;
const EXPORT_MIN_ZOOM = 0.1;
const EXPORT_MAX_ZOOM = 4;

export type ExportFormat = "png" | "svg" | "pdf" | "markdown";

function suggestedFilename(ext: string): string {
  const path = useDocumentStore.getState().currentFilePath;
  const baseFromPath = path
    ? (path.split(/[/\\]/).pop()?.replace(/\.(clobmap\.yaml|yaml|yml)$/i, "") ?? null)
    : null;
  const baseFromTitle = useDocumentStore.getState().parsedDoc?.title ?? null;
  const base = baseFromPath || baseFromTitle || "mindmap";
  // Strip filesystem-hostile characters.
  const safe = base.replace(/[\\/:*?"<>|]+/g, " ").trim() || "mindmap";
  return `${safe}.${ext}`;
}

function timestampForFilename(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

function backgroundColorForRender(): string {
  const dark = useUIStore.getState().resolvedTheme === "dark";
  return dark ? "#0a0a0a" : "#ffffff";
}

/**
 * Capture the current mind-map canvas as a data URL.
 *
 * React Flow's `onlyRenderVisibleElements` keeps DOM bounded to the
 * viewport, so to capture the WHOLE map we briefly call fitView (which
 * forces all nodes into the visible viewport, hence into DOM), wait two
 * paint frames for the commit to land, capture via html-to-image with
 * an explicit transform sized for the whole bounds, then restore the
 * user's viewport. The user sees one frame of "fit all" — acceptable.
 */
async function captureMindmap(
  reactFlow: ReactFlowInstance,
  format: "png" | "svg",
): Promise<string> {
  const viewportEl = document.querySelector(
    ".react-flow__viewport",
  ) as HTMLElement | null;
  if (!viewportEl) {
    throw new Error(
      "Switch to the Mind-map view (or Split) before exporting an image.",
    );
  }
  const allNodes = reactFlow.getNodes();
  if (allNodes.length === 0) {
    throw new Error("Nothing to export — the canvas has no nodes.");
  }

  const savedViewport = reactFlow.getViewport();
  reactFlow.fitView({ duration: 0, padding: 0.05 });
  try {
    // Two rAFs so React commits + React Flow's transform settles before
    // html-to-image walks the DOM.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    const bounds = getNodesBounds(allNodes);
    const aspect = bounds.height / Math.max(bounds.width, 1);
    const w = EXPORT_WIDTH;
    const h = Math.max(1, Math.round(w * aspect));
    const exportViewport = getViewportForBounds(
      bounds,
      w,
      h,
      EXPORT_MIN_ZOOM,
      EXPORT_MAX_ZOOM,
      EXPORT_PADDING,
    );

    const { toPng, toSvg } = await import("html-to-image");
    const exporter = format === "png" ? toPng : toSvg;
    const bg = backgroundColorForRender();

    return await exporter(viewportEl, {
      backgroundColor: bg,
      width: w,
      height: h,
      style: {
        width: `${w}px`,
        height: `${h}px`,
        transform: `translate(${exportViewport.x}px, ${exportViewport.y}px) scale(${exportViewport.zoom})`,
      },
      pixelRatio: format === "png" ? 2 : 1,
      // Don't include React Flow's chrome (Controls, MiniMap, dotted
      // background grid, panel) in the captured image — we want the tree.
      filter: (node) => {
        if (!(node instanceof Element)) return true;
        return !(
          node.classList.contains("react-flow__panel") ||
          node.classList.contains("react-flow__minimap") ||
          node.classList.contains("react-flow__controls") ||
          node.classList.contains("react-flow__background")
        );
      },
    });
  } finally {
    reactFlow.setViewport(savedViewport, { duration: 0 });
  }
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("invalid data URL");
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  if (head.includes("base64")) {
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Plain (URL-encoded) text — used for SVG dataURLs.
  return new TextEncoder().encode(decodeURIComponent(body));
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Cross-platform write of arbitrary bytes to a user-chosen path. Uses
 * Tauri's plugin-fs on desktop/iOS; falls back to a download anchor on
 * the web.
 */
async function saveBytes(bytes: Uint8Array, suggestedName: string): Promise<void> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: suggestedName });
    if (!path) return;
    await writeFile(path, bytes);
    return;
  }
  // Web: trigger a download.
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveText(text: string, suggestedName: string): Promise<void> {
  await saveBytes(new TextEncoder().encode(text), suggestedName);
}

/**
 * Recursive Markdown serialization. Uses a `# {title}` heading and
 * indented bullets for the tree. Notes hang under their node as
 * blockquotes.
 */
function toMarkdown(doc: MindDocument): string {
  const lines: string[] = [];
  if (doc.title) {
    lines.push(`# ${doc.title}`);
    lines.push("");
  }
  emitMarkdown(doc.root, 0, lines);
  return lines.join("\n");
}

function emitMarkdown(node: MindNode, depth: number, out: string[]): void {
  const indent = "  ".repeat(depth);
  out.push(`${indent}- ${node.text}`);
  if (node.note) {
    const noteIndent = `${indent}  `;
    for (const line of node.note.split("\n")) {
      out.push(`${noteIndent}> ${line}`);
    }
  }
  for (const child of node.children) emitMarkdown(child, depth + 1, out);
}

// ---- Public actions (each accepts the React Flow instance for image
// formats; markdown doesn't need it). ----

export async function exportPng(reactFlow: ReactFlowInstance): Promise<void> {
  const dataUrl = await captureMindmap(reactFlow, "png");
  await saveBytes(dataUrlToUint8Array(dataUrl), suggestedFilename("png"));
}

export async function exportSvg(reactFlow: ReactFlowInstance): Promise<void> {
  const dataUrl = await captureMindmap(reactFlow, "svg");
  await saveBytes(dataUrlToUint8Array(dataUrl), suggestedFilename("svg"));
}

export async function exportMarkdown(): Promise<void> {
  const tree = useDocumentStore.getState().parsedDoc;
  if (!tree) {
    throw new Error("Nothing to export — document is empty or has parse errors.");
  }
  await saveText(toMarkdown(tree), suggestedFilename("md"));
}

export async function exportAllNotes(): Promise<void> {
  const tree = useDocumentStore.getState().parsedDoc;
  if (!tree) {
    throw new Error("Nothing to export — document is empty or has parse errors.");
  }
  const docPath = useDocumentStore.getState().currentFilePath;

  const ordered: MindNode[] = [];
  const visit = (n: MindNode): void => {
    ordered.push(n);
    for (const c of n.children) visit(c);
  };
  visit(tree.root);

  const sections: string[] = [];
  for (const node of ordered) {
    let body = "";
    if (node.notes) {
      const loaded = await loadNotes(node.notes, docPath);
      body = loaded.content.trim();
    }
    if (!body) body = "__ no notes found __";
    sections.push(`# ${node.text} (${node.id})\n\n${body}\n`);
  }

  await saveText(sections.join("\n"), suggestedFilename(`notes.${timestampForFilename()}.md`));
}

export async function exportPdf(reactFlow: ReactFlowInstance): Promise<void> {
  const dataUrl = await captureMindmap(reactFlow, "png");
  // Probe natural dimensions of the captured image so the PDF page can
  // match aspect ratio (single page, no tiling).
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const aspect = img.height / Math.max(img.width, 1);
  // Use point units; single page sized to the image's aspect ratio.
  const W = 1200;
  const H = Math.max(1, Math.round(W * aspect));
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: aspect > 1 ? "portrait" : "landscape",
    unit: "pt",
    format: [W, H],
    compress: true,
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, W, H);
  const bytes = await blobToUint8Array(pdf.output("blob"));
  await saveBytes(bytes, suggestedFilename("pdf"));
}
