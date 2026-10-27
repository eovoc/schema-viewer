// UML edge: orthogonal route computed by ELK (rounded corners), role and multiplicity near the relevant end.
// Edges without an ELK route (mutual references) fall back to React Flow's "smoothstep".
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position, type Edge, type EdgeProps } from "@xyflow/react";
import type { RelationKind } from "../../types/schema";

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

/**
 * Orthogonal polyline with rounded corners. The ends are snapped onto the React Flow handles
 * (ELK and React Flow can differ by a pixel) while keeping the first and last segments straight.
 */
export function orthogonalPath(route: Point[], source: Point, target: Point): string {
  const pts = route.map((p) => ({ ...p }));
  const last = pts.length - 1;
  if (pts.length >= 2 && Math.abs(pts[0].y - pts[1].y) < 0.5) pts[1].y = source.y;
  if (pts.length >= 2 && Math.abs(pts[last].y - pts[last - 1].y) < 0.5) pts[last - 1].y = target.y;
  pts[0] = { ...source };
  pts[last] = { ...target };
  // drop collinear or duplicate points (avoids tiny "staircase" bends)
  const clean: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const prev = clean.at(-1)!;
    if (Math.abs(p.x - prev.x) < 0.5 && Math.abs(p.y - prev.y) < 0.5) continue;
    const before = clean.at(-2);
    if (before && ((Math.abs(before.x - prev.x) < 0.5 && Math.abs(prev.x - p.x) < 0.5) || (Math.abs(before.y - prev.y) < 0.5 && Math.abs(prev.y - p.y) < 0.5))) {
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

// ---------------------------------------------------------------------------
// UML markers (shapes taken from uml-react), normal and highlighted (hover) variants:
// open arrow (association, dependency), hollow triangle (generalization),
// hollow diamond (aggregation), filled diamond (composition).

// Colours from the CSS variables (styles.css), so that changing --uml-edge or --uml-accent changes the markers too.
// They are set with `style`: SVG presentation attributes (fill="…") do not accept var().
const EDGE = "var(--uml-edge)";
const ACCENT = "var(--uml-accent)";
const SURFACE = "var(--uml-surface)";

type Shape = "arrow" | "triangle" | "diamond" | "diamondFilled";

export const markerId = (shape: Shape, highlighted = false) => `schema-viewer-${shape}${highlighted ? "-hl" : ""}`;

/** Markers of an edge. `parentAtSource`: for inheritance, the parent class is the edge source. */
export function edgeMarkers(kind: RelationKind, parentAtSource: boolean, highlighted = false): { start?: string; end?: string } {
  const id = (shape: Shape) => markerId(shape, highlighted);
  switch (kind) {
    case "generalization":
      return parentAtSource ? { start: id("triangle") } : { end: id("triangle") };
    case "aggregation":
      return { start: id("diamond") }; // the diamond sits on the whole (the class owning the attribute)
    case "composition":
      return { start: id("diamondFilled") };
    default:
      return { end: id("arrow") };
  }
}

function Marker({ shape, color, highlighted }: Readonly<{ shape: Shape; color: string; highlighted: boolean }>) {
  const common = { markerUnits: "userSpaceOnUse" as const, orient: "auto-start-reverse" };
  const id = markerId(shape, highlighted);
  switch (shape) {
    case "arrow":
      return (
        <marker id={id} viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14" {...common}>
          <path d="M1,1.5 L13,7 L1,12.5" style={{ fill: "none", stroke: color }} strokeWidth="1.3" />
        </marker>
      );
    case "triangle":
      return (
        <marker id={id} viewBox="0 0 16 14" refX="15" refY="7" markerWidth="16" markerHeight="14" {...common}>
          <path d="M1,1 L15,7 L1,13 Z" style={{ fill: SURFACE, stroke: color }} strokeWidth="1.3" />
        </marker>
      );
    default:
      return (
        <marker id={id} viewBox="0 0 20 12" refX="19" refY="6" markerWidth="20" markerHeight="12" {...common}>
          <path d="M1,6 L10,1 L19,6 L10,11 Z" style={{ fill: shape === "diamondFilled" ? color : SURFACE, stroke: color }} strokeWidth="1.3" />
        </marker>
      );
  }
}

const SHAPES: Shape[] = ["arrow", "triangle", "diamond", "diamondFilled"];

/** SVG definitions of the markers: rendered once per diagram */
export function UmlMarkers() {
  return (
    <svg className="uml-markers" aria-hidden="true">
      <defs>
        {SHAPES.map((s) => (
          <Marker key={s} shape={s} color={EDGE} highlighted={false} />
        ))}
        {SHAPES.map((s) => (
          <Marker key={`${s}-hl`} shape={s} color={ACCENT} highlighted />
        ))}
      </defs>
    </svg>
  );
}
