// Legend of the UML relations that a JSON Schema produces, drawn with the same markers as the diagram (see UmlEdge).
import type { RelationKind } from "../../types/schema";
import { edgeMarkers } from "../UmlEdge";

const LEGEND: { kind: RelationKind; label: string; title: string }[] = [
  { kind: "association", label: "association", title: "$ref property to a class" },
  { kind: "aggregation", label: "aggregation", title: "Array of $ref property (convention: JSON Schema does not distinguish aggregation from association)" },
  { kind: "composition", label: "composition", title: 'Nested object property ("Parent.property" class)' },
  { kind: "generalization", label: "generalization", title: "oneOf/anyOf of classes (abstract class) or allOf with $ref" },
  { kind: "dependency", label: "dependency «use»", title: "Use of an enumeration (\"Enumerations\" box), codelist or data type (shown in its own view)" },
];

function LegendLine({ kind }: Readonly<{ kind: RelationKind }>) {
  // in the legend, inheritance is drawn from the subclass (left) to the parent (right)
  const m = edgeMarkers(kind, false);
  const dashed = kind === "dependency" || kind === "realization";
  return (
    <svg width="40" height="14" aria-hidden="true" className="uml-legend__line">
      <line
        x1="2"
        y1="7"
        x2="37"
        y2="7"
        style={{ stroke: "var(--uml-edge)" }}
        strokeWidth="1.3"
        strokeDasharray={dashed ? "5 3" : undefined}
        markerStart={m.start ? `url(#${m.start})` : undefined}
        markerEnd={m.end ? `url(#${m.end})` : undefined}
      />
    </svg>
  );
}

export default function Legend({ hint }: Readonly<{ hint?: string }>) {
  return (
    <div className="uml-legend">
      {LEGEND.map((l) => (
        <span key={l.kind} title={l.title}>
          <LegendLine kind={l.kind} /> {l.label}
        </span>
      ))}
      {hint && <span className="uml-legend__hint">{hint}</span>}
    </div>
  );
}
