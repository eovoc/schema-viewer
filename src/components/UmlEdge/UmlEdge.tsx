// UML edge: orthogonal route computed by ELK (rounded corners), role and multiplicity near the relevant end.
// Edges without an ELK route (mutual references) fall back to React Flow's "smoothstep".
// The markers at its ends (arrow, triangle, diamonds) are SVG definitions: see UmlMarkers.
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position, type Edge, type EdgeProps } from "@xyflow/react";

type Point = { x: number; y: number };

export type UmlEdgeData = {
  /** «use» for a dependency */
  stereotype?: string;
  role?: string;
  multiplicity?: string;
  labelAt: "source" | "target";
  /** ELK route: start, bends, end */
  points?: Point[];
};
export type UmlFlowEdge = Edge<UmlEdgeData, "uml">;

const RADIUS = 8;
/** Two coordinates closer than this (px) are the same: ELK and React Flow can differ by a fraction of a pixel */
const SAME = 0.5;

/**
 * Orthogonal polyline with rounded corners. The ends are snapped onto the React Flow handles
 * (ELK and React Flow can differ by a pixel) while keeping the first and last segments straight.
 */
export function orthogonalPath(route: Point[], source: Point, target: Point): string {
  const pts = route.map((p) => ({ ...p }));
  const last = pts.length - 1;
  if (pts.length >= 2 && Math.abs(pts[0].y - pts[1].y) < SAME) pts[1].y = source.y;
  if (pts.length >= 2 && Math.abs(pts[last].y - pts[last - 1].y) < SAME) pts[last - 1].y = target.y;
  pts[0] = { ...source };
  pts[last] = { ...target };
  // drop collinear or duplicate points (avoids tiny "staircase" bends)
  const clean: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const prev = clean.at(-1)!;
    if (Math.abs(p.x - prev.x) < SAME && Math.abs(p.y - prev.y) < SAME) continue;
    const before = clean.at(-2);
    if (before && ((Math.abs(before.x - prev.x) < SAME && Math.abs(prev.x - p.x) < SAME) || (Math.abs(before.y - prev.y) < SAME && Math.abs(prev.y - p.y) < SAME))) {
      clean[clean.length - 1] = p;
      continue;
    }
    clean.push(p);
  }
  let d = `M ${clean[0].x},${clean[0].y}`;
  for (let i = 1; i < clean.length - 1; i++) {
    const [a, b, c] = [clean[i - 1], clean[i], clean[i + 1]];
    const r = Math.min(RADIUS, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const inX = b.x - Math.sign(b.x - a.x) * r;
    const inY = b.y - Math.sign(b.y - a.y) * r;
    const outX = b.x + Math.sign(c.x - b.x) * r;
    const outY = b.y + Math.sign(c.y - b.y) * r;
    d += ` L ${inX},${inY} Q ${b.x},${b.y} ${outX},${outY}`;
  }
  const end = clean.at(-1)!;
  return `${d} L ${end.x},${end.y}`;
}

export default function UmlEdge(props: Readonly<EdgeProps<UmlFlowEdge>>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerStart, markerEnd, data } = props;
  const path =
    data?.points && data.points.length >= 2
      ? orthogonalPath(data.points, { x: sourceX, y: sourceY }, { x: targetX, y: targetY })
      : getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 10, offset: 18 })[0];

  const atSource = data?.labelAt === "source";
  const x = atSource ? sourceX : targetX;
  const y = atSource ? sourceY : targetY;
  const side = atSource ? sourcePosition : targetPosition;
  // The label sits outside the node, just above the line
  const dx = side === Position.Left ? -6 : 6;
  const alignRight = side === Position.Left;

  return (
    <>
      <BaseEdge id={id} path={path} markerStart={markerStart} markerEnd={markerEnd} />
      {(data?.stereotype || data?.role || data?.multiplicity) && (
        <EdgeLabelRenderer>
          <div
            className={`uml-edge-label nodrag nopan${alignRight ? " uml-edge-label--end" : ""}`}
            style={{ transform: `translate(${alignRight ? "-100%" : "0"}, -100%) translate(${x + dx}px, ${y - 2}px)` }}
          >
            {data.stereotype && <span className="uml-edge-stereotype">{data.stereotype} </span>}
            {data.role && <span className="uml-edge-role">{data.role}</span>}
            {data.role && data.multiplicity && " "}
            {data.multiplicity && <span className="uml-edge-mult">{data.multiplicity}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
