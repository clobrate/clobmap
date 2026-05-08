import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import type { HandleSide } from "../model";
import { useDocumentStore } from "../store/document";
import { updateNode } from "../model";

const POSITION_BY_SIDE: Record<HandleSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const SIDES: HandleSide[] = ["top", "right", "bottom", "left"];

/**
 * Custom edge that draws the standard smoothstep path AND renders two
 * interactive endpoint markers — one at the parent end, one at the
 * child end — that the user can drag onto a different side of the
 * connected node to re-route the edge.
 *
 * Edge identity:
 *   id = `${parentId}->${childId}`
 *   source = parent, target = child
 *   sourceHandle = `source-${edgeFrom}`, targetHandle = `target-${edgeTo}`
 *
 * The drag updates the CHILD node's `edgeFrom` (parent-side) or
 * `edgeTo` (child-side) field, since the per-edge config lives on the
 * child (each child has exactly one incoming edge).
 */
export function MindEdge(props: EdgeProps) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    markerEnd,
    style,
  } = props;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {/* Endpoint markers exist in the DOM only when the edge is
          selected. Rendering them unconditionally with opacity:0 still
          left them clickable in EdgeLabelRenderer's overlay layer,
          which intercepted clicks meant for the underlying nodes
          (broke node selection + therefore arrow-key navigation). */}
      {selected && (
        <EdgeLabelRenderer>
          <EndpointHandle
            edgeId={id}
            role="source"
            parentId={source}
            childId={target}
            x={sourceX}
            y={sourceY}
          />
          <EndpointHandle
            edgeId={id}
            role="target"
            parentId={source}
            childId={target}
            x={targetX}
            y={targetY}
          />
          <span data-edge-anchor data-x={labelX} data-y={labelY} className="hidden" />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/**
 * Draggable endpoint dot. On pointerdown we capture the pointer and
 * track the cursor in flow coordinates. On pointerup we hit-test which
 * side of the connected node the cursor is over and write the
 * resulting `edgeFrom` / `edgeTo` field on the child node.
 *
 * Why on the child for both: each child has exactly one incoming edge,
 * so the per-edge config fits cleanly on the child node. `source` end
 * controls `edgeFrom` (parent-side); `target` end controls `edgeTo`
 * (child-side).
 */
function EndpointHandle({
  role,
  parentId,
  childId,
  x,
  y,
}: {
  edgeId: string;
  role: "source" | "target";
  parentId: string;
  childId: string;
  x: number;
  y: number;
}) {
  const reactFlow = useReactFlow();
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setDragging(true);

    // The node we're re-routing AT: parent for source-end, child for
    // target-end. (`edgeFrom` lives on the child but indexes the parent
    // node's geometry; we hit-test the parent for it.)
    const hitTestNodeId = role === "source" ? parentId : childId;

    const onMove = () => {
      // Live preview is a nice-to-have; for now we just commit on up.
      // Could highlight the side under the cursor here.
    };

    const onUp = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      setDragging(false);

      const node = reactFlow.getNode(hitTestNodeId);
      if (!node) return;
      // Convert screen coords → flow coords.
      const cursorFlow = reactFlow.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const w = node.measured?.width ?? 180;
      const h = node.measured?.height ?? 44;
      const cx = node.position.x + w / 2;
      const cy = node.position.y + h / 2;
      // Vector from node center to cursor.
      const dx = cursorFlow.x - cx;
      const dy = cursorFlow.y - cy;
      // Pick the side whose normal best matches that vector.
      const side: HandleSide =
        Math.abs(dx) * h > Math.abs(dy) * w
          ? dx >= 0
            ? "right"
            : "left"
          : dy >= 0
            ? "bottom"
            : "top";

      // Per-edge endpoint config lives on the CHILD node.
      const tree = useDocumentStore.getState().parsedDoc;
      if (!tree) return;
      applyTreeChange(
        updateNode(tree, childId, {
          [role === "source" ? "edgeFrom" : "edgeTo"]: side,
        }),
      );
    };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  };

  // We don't actually need to enumerate SIDES at render time; kept the
  // import to allow a future "highlight nearest side" preview.
  void SIDES;
  void POSITION_BY_SIDE;

  return (
    <button
      type="button"
      data-endpoint-role={role}
      onPointerDown={onPointerDown}
      title={
        role === "source"
          ? "Drag to move the parent-side connector"
          : "Drag to move the child-side connector"
      }
      style={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
        pointerEvents: "all",
      }}
      className={
        "h-3 w-3 rounded-full border-2 shadow-sm transition-colors " +
        (dragging
          ? "border-emerald-600 bg-emerald-500"
          : "border-emerald-500 bg-white hover:bg-emerald-50 dark:bg-neutral-900 dark:hover:bg-emerald-900/40")
      }
      aria-label={role === "source" ? "Reposition parent-side connector" : "Reposition child-side connector"}
    />
  );
}
