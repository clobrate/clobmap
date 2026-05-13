import { useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Node } from "@xyflow/react";
import { handleId, type MindNodeData } from "../lib/layout";
import type { HandleSide } from "../model";
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import { useLongPress } from "../lib/useLongPress";
import { updateNode, updateText } from "../model";

type Props = NodeProps<Node<MindNodeData>>;

export function MindMapNode({ id, data, selected }: Props) {
  const {
    text,
    isRoot,
    color,
    hasChildren,
    collapsed,
    hiddenChildCount,
    maxWidth,
    maxHeight,
    hasNotes,
    tags,
    outgoingSides,
    incomingSide,
  } = data;

  const editingNodeId = useUIStore((s) => s.editingNodeId);
  const setEditing = useUIStore((s) => s.setEditing);
  const setSelected = useUIStore((s) => s.setSelected);
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const openNotesEditor = useUIStore((s) => s.openNotesEditor);
  const clipboard = useUIStore((s) => s.clipboard);
  const isEditing = editingNodeId === id;
  const isClipped = clipboard?.nodeId === id;

  const longPress = useLongPress((x, y) => {
    setSelected(id);
    openContextMenu(id, x, y);
  });

  const baseClass = isRoot
    ? "rounded-lg border bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm transition dark:text-emerald-100"
    : "rounded-md border bg-white px-3 py-1.5 text-sm text-neutral-900 shadow-sm transition hover:border-neutral-400 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-500";

  const borderClass = selected
    ? isRoot
      ? "border-emerald-500 ring-2 ring-emerald-400/60 dark:border-emerald-300"
      : "border-emerald-500 ring-2 ring-emerald-400/40 dark:border-emerald-400"
    : isRoot
      ? "border-emerald-400/60 dark:border-emerald-500/40"
      : "border-neutral-300 dark:border-neutral-700";

  const dimClass = isClipped ? "opacity-40 outline-dashed outline-1 outline-amber-400/60" : "";

  const colorBorderStyle = color && !selected ? { borderColor: color } : undefined;

  return (
    <div
      className={`${baseClass} ${borderClass} ${dimClass}`}
      style={{
        ...colorBorderStyle,
        // Cap node visual size to its resolved max dimensions; the layout
        // pre-reserves the slot at the same numbers so visuals match math.
        maxWidth: `${maxWidth}px`,
        maxHeight: `${maxHeight}px`,
        // Long single-line text wraps; the rendered node grows up to maxHeight
        // and overflows with a scrollbar past that.
        overflow: "auto",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        touchAction: "manipulation",
      }}
      role="treeitem"
      aria-level={data.depth + 1}
      aria-selected={selected}
      aria-expanded={hasChildren ? !collapsed : undefined}
      {...longPress}
    >
      {!isRoot && <HandleSet role="target" activeSides={[incomingSide]} />}
      {isEditing ? (
        <InlineRename
          initialText={text}
          nodeId={id}
          onClose={() => setEditing(null)}
          maxHeight={maxHeight}
        />
      ) : (
        <>
          <div className="flex items-start gap-1.5">
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{text}</span>
            <NoteIndicator
              hasNotes={hasNotes}
              onActivate={() => {
                setSelected(id);
                openNotesEditor(id);
              }}
            />
            {hasChildren && (
              <Chevron nodeId={id} collapsed={collapsed} hiddenChildCount={hiddenChildCount} />
            )}
          </div>
          {tags && tags.length > 0 && <TagChipRow tags={tags} />}
        </>
      )}
      {hasChildren && <HandleSet role="source" activeSides={outgoingSides} />}
    </div>
  );
}

const SIDES: HandleSide[] = ["top", "right", "bottom", "left"];
const POSITION_BY_SIDE: Record<HandleSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/**
 * React Flow needs a Handle at every position the user might route an
 * edge through, because handle ids are matched at edge time. We render
 * all four sides; the ones in `activeSides` are visible solid dots,
 * the others are invisible-but-present so React Flow can re-route an
 * edge to a different side at any moment without a remount.
 *
 * For the source role, multiple sides can be active simultaneously
 * (one per child whose `edgeFrom` value picks that side). For the
 * target role there's always exactly one active side (each node has
 * one parent → one incoming edge).
 */
function HandleSet({
  role,
  activeSides,
}: {
  role: "source" | "target";
  activeSides: HandleSide[];
}) {
  const active = new Set(activeSides);
  return (
    <>
      {SIDES.map((side) => {
        const isActive = active.has(side);
        return (
          <Handle
            key={side}
            id={handleId(role, side)}
            type={role}
            position={POSITION_BY_SIDE[side]}
            className={
              isActive
                ? "!h-2 !w-2 !border-0 !bg-neutral-500"
                : "!h-2 !w-2 !border-0 !bg-transparent !pointer-events-none !opacity-0"
            }
          />
        );
      })}
    </>
  );
}

/**
 * Compact read-only chip row rendered below the node's main row when
 * the data-node carries at least one tag. Phase B is display-only; in
 * Phase D these chips become clickable to enter the hierarchy filter.
 */
function TagChipRow({ tags }: { tags: string[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1" aria-label="Tags">
      {tags.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="inline-flex items-center rounded-full bg-neutral-200/70 px-1.5 text-[10px] leading-4 text-neutral-700 dark:bg-neutral-700/70 dark:text-neutral-200"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function NoteIndicator({
  hasNotes,
  onActivate,
}: {
  hasNotes: boolean;
  onActivate: () => void;
}) {
  // Always-visible affordance. Muted neutral palette so it sits with the
  // chevron rather than competing for attention. When the node has notes
  // we step up the contrast a notch so it reads as "has content";
  // otherwise it's a faint hint that the action exists. Click opens the
  // notes popup — same as pressing `N` on the selected node.
  const stateClass = hasNotes
    ? "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-700/60"
    : "text-neutral-300 hover:text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-700 dark:hover:text-neutral-300 dark:hover:bg-neutral-700/60";
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onActivate();
      }}
      className={`shrink-0 rounded p-0.5 ${stateClass}`}
      title={hasNotes ? "Open notes (N)" : "Add notes (N)"}
      aria-label={hasNotes ? "Open notes" : "Add notes"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="2.5" width="10" height="11" rx="1.5" />
        <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" />
      </svg>
    </button>
  );
}

function Chevron({
  nodeId,
  collapsed,
  hiddenChildCount,
}: {
  nodeId: string;
  collapsed: boolean;
  hiddenChildCount: number;
}) {
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);

  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Stop ReactFlow from selecting the node when the chevron is clicked.
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        const tree = useDocumentStore.getState().parsedDoc;
        if (!tree) return;
        applyTreeChange(updateNode(tree, nodeId, { collapsed: !collapsed }));
      }}
      className="ml-auto flex items-center gap-1 rounded px-1 py-0.5 text-xs text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-100"
      title={collapsed ? "Expand" : "Collapse"}
      aria-label={collapsed ? "Expand node" : "Collapse node"}
    >
      <span className="font-mono leading-none">{collapsed ? "▸" : "▾"}</span>
      {collapsed && hiddenChildCount > 0 && (
        <span className="tabular-nums text-[10px] text-neutral-700 dark:text-neutral-300">
          {hiddenChildCount}
        </span>
      )}
    </button>
  );
}

function InlineRename({
  initialText,
  nodeId,
  onClose,
  maxHeight,
}: {
  initialText: string;
  nodeId: string;
  onClose: () => void;
  maxHeight: number;
}) {
  const [value, setValue] = useState(initialText);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);

  useEffect(() => {
    // Defensive multi-frame focus: when a brand-new node is created via Tab,
    // the input mounts inside a React Flow wrapper that's still settling
    // (measurement, position transform, internal focus juggling). A single
    // focus() call can fire before the input is eligible or get blown away
    // immediately after. Re-asserting focus across several frames covers all
    // of that without depending on a single timing assumption. Cap at 6
    // frames (~100ms) so we don't fight the user if they intentionally tab
    // away. Stops asserting once focus is on the input.
    let frame = 0;
    const tryFocus = () => {
      const el = inputRef.current;
      if (!el) return;
      if (document.activeElement !== el) {
        el.focus();
        el.select();
      }
      frame++;
      if (frame < 6 && document.activeElement !== el) {
        requestAnimationFrame(tryFocus);
      }
    };
    tryFocus();
    requestAnimationFrame(tryFocus);
  }, []);

  // Auto-grow the textarea height to fit its content (capped at maxHeight).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  const commit = () => {
    const tree = useDocumentStore.getState().parsedDoc;
    if (tree && value !== initialText) {
      applyTreeChange(updateText(tree, nodeId, value));
    }
    onClose();
  };

  return (
    <textarea
      ref={inputRef}
      aria-label="Rename node"
      rows={1}
      className="block w-full resize-none rounded border border-neutral-300 bg-white px-1 py-0.5 text-sm text-neutral-900 outline-none focus:border-emerald-500 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-emerald-400"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          // Plain Enter commits; Shift+Enter inserts a newline (matches
          // Slack / Notion / GitHub / Gmail conventions).
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    />
  );
}
