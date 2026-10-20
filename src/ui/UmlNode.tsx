// UML class (React Flow node): header (stereotype + name), attribute compartment.
// Style taken from uml-react: header colour per kind, types in blue, multiplicities and constraints in grey.
import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { RowData, UmlNodeData } from "../core/focusGraph";
import { headerHeight } from "../core/focusGraph";

export type UmlFlowNodeData = UmlNodeData & {
  onNavigate: (id: string) => void;
  /** Hover on an attribute row (null when the pointer leaves it); used to highlight that row's link only */
  onHoverRow: (nodeId: string, rowId: string | null) => void;
};
export type UmlFlowNode = Node<UmlFlowNodeData, "uml">;

interface RowProps {
  row: RowData;
  onNavigate: (id: string) => void;
  onHover: (rowId: string | null) => void;
}

function Row({ row, onNavigate, onHover }: Readonly<RowProps>) {
  if (row.text !== undefined) {
    return <div className={`uml-row${row.muted ? " uml-row--muted" : ""}`}>{row.text}</div>;
  }
  return (
    <div
      className="uml-row"
      data-row={row.id}
      title={row.required ? "required" : undefined}
      onMouseEnter={row.port ? () => onHover(row.id) : undefined}
      onMouseLeave={row.port ? () => onHover(null) : undefined}
    >
      <span className="uml-row__text">
        <span className="uml-attr-name">{row.name}</span>
        {row.value !== undefined ? (
          <>
            <span className="uml-sep"> = </span>
            <span className="uml-value">{row.value}</span>
          </>
        ) : (
          <>
            <span className="uml-sep">: </span>
            {row.target ? (
              <button
                type="button"
                className="uml-type uml-type--link nodrag"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(row.target!);
                }}
              >
                {row.type}
              </button>
            ) : (
              <span className="uml-type">{row.type}</span>
            )}
          </>
        )}
        {row.multiplicity && <span className="uml-mult"> [{row.multiplicity}]</span>}
        {row.constraints && row.constraints.length > 0 && <span className="uml-constraint"> {`{${row.constraints.join(", ")}}`}</span>}
      </span>
      {row.port && <Handle type="source" position={Position.Right} id={row.id} className="uml-handle" isConnectable={false} />}
    </div>
  );
}

function UmlNode({ id, data }: Readonly<NodeProps<UmlFlowNode>>) {
  const classes = [
    "uml-node",
    `uml-node--${data.kind}`,
    data.isFocus && "uml-node--focus",
    data.navigable && "uml-node--navigable",
  ]
    .filter(Boolean)
    .join(" ");
  const nameClass = `uml-name nodrag${data.italic ? " uml-name--italic" : ""}`;
  const headerTop = headerHeight(data.stereotype) / 2;
  const headerHandle = { top: headerTop };
  return (
    <div
      className={classes}
      title={data.comment}
    >
      <Handle type="target" position={Position.Left} id="in" className="uml-handle" style={headerHandle} isConnectable={false} />
      <Handle type="source" position={Position.Right} id="out" className="uml-handle" style={headerHandle} isConnectable={false} />
      <Handle type="source" position={Position.Left} id="out-l" className="uml-handle" style={headerHandle} isConnectable={false} />
      <Handle type="target" position={Position.Right} id="in-r" className="uml-handle" style={headerHandle} isConnectable={false} />
      {/* the "+N more" box is a header only */}
      <div className="uml-header" style={{ height: data.kind === "more" ? "100%" : headerHeight(data.stereotype) }}>
        {data.stereotype && <div className="uml-stereotype">{data.stereotype}</div>}
        {data.navigable ? (
          // a real button: reachable with Tab, opened with Enter (a click anywhere on the box works too)
          <button
            type="button"
            className={nameClass}
            aria-label={`Show ${data.name}`}
            onClick={(e) => {
              e.stopPropagation(); // otherwise the click on the box navigates a second time
              data.onNavigate(id);
            }}
          >
            {data.name}
          </button>
        ) : (
          <div className={nameClass}>{data.name}</div>
        )}
      </div>
      {data.kind !== "more" && (
        <div className={`uml-body${data.rows.length ? "" : " uml-body--empty"}`}>
          {data.rows.map((r) => (
            <Row key={r.id} row={r} onNavigate={data.onNavigate} onHover={(rowId) => data.onHoverRow(id, rowId)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(UmlNode);
