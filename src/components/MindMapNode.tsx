import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Node } from "@xyflow/react";
import type { MindNodeData } from "../lib/layout";

type Props = NodeProps<Node<MindNodeData>>;

export function MindMapNode({ data }: Props) {
  const { text, isRoot, color, note, hasChildren } = data;

  const baseClass = isRoot
    ? "rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 shadow-sm"
    : "rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 shadow-sm hover:border-neutral-500";

  const style = color ? { borderColor: color } : undefined;

  return (
    <div className={baseClass} style={style} title={note}>
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2 !w-2 !border-0 !bg-neutral-500"
        />
      )}
      <div className="max-w-[160px] truncate">{text}</div>
      {hasChildren && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2 !w-2 !border-0 !bg-neutral-500"
        />
      )}
    </div>
  );
}
