// UML markers (shapes taken from uml-react), normal and highlighted (hover) variants:
// open arrow (association, dependency), hollow triangle (generalization),
// hollow diamond (aggregation), filled diamond (composition).
import { markerId, type MarkerShape } from "../../utils/markers";

// Colours from the CSS variables (styles/base.css), so that changing --uml-edge or --uml-accent changes the markers too.
// They are set with `style`: SVG presentation attributes (fill="…") do not accept var().
const EDGE = "var(--uml-edge)";
const ACCENT = "var(--uml-accent)";
const SURFACE = "var(--uml-surface)";

function Marker({ shape, color, highlighted }: Readonly<{ shape: MarkerShape; color: string; highlighted: boolean }>) {
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

const SHAPES: MarkerShape[] = ["arrow", "triangle", "diamond", "diamondFilled"];

/** SVG definitions of the markers: rendered once per diagram */
export default function UmlMarkers() {
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
