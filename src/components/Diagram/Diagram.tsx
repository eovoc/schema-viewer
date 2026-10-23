// UML diagram of one definition: top bar, React Flow canvas, JSON and warnings panels, legend.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Background, Controls, getViewportForBounds, ReactFlow, type EdgeTypes, type NodeTypes, type Viewport } from "@xyflow/react";
import { buildFocusGraph, type FocusGraph } from "../../core/focusGraph";
import { fileName } from "../../core/loader";
import { referencedOf, referrerOf } from "../../core/schemaModel";
import type { DefId, RelationKind, SchemaModel } from "../../core/types";
import { isDrawable } from "../../core/types";
import UmlEdge, { edgeMarkers, UmlMarkers, type UmlFlowEdge } from "../UmlEdge";
import UmlNode, { type UmlFlowNode } from "../UmlNode";

const nodeTypes: NodeTypes = { uml: UmlNode };
const FIT = { padding: 0.12, minZoom: 0.1, maxZoom: 1.1 };
const MAX_USER_ZOOM = 2;
const edgeTypes: EdgeTypes = { uml: UmlEdge };

const KIND_LABEL: Record<string, string> = {
  class: "class",
  abstract: "abstract class",
  enumeration: "enumeration",
  codelist: "codelist",
  datatype: "data type",
  alias: "alias",
};

interface Props {
  model: SchemaModel;
  /** Definition at the centre */
  focus: DefId;
  /** A class or a type was clicked */
  onSelect: (id: DefId) => void;
  /** Initial state of "Neighbour details" (attributes of the neighbouring classes) */
  neighbourDetails?: boolean;
  /** Initial state of "Constraints" ({unique}, {closed}, {format=…}…) */
  constraints?: boolean;
  /** Initial state of "Enumerations" (enumerations used by the class, on the right) */
  enumerations?: boolean;
}

export default function Diagram({ model, focus, onSelect, neighbourDetails = false, constraints = true, enumerations = true }: Readonly<Props>) {
  // scopes the hover CSS, so that two diagrams on one page do not interfere
  const scope = useId();
  const [details, setDetails] = useState(neighbourDetails);
  const [showConstraints, setShowConstraints] = useState(constraints);
  const [showEnums, setShowEnums] = useState(enumerations);
  const [panel, setPanel] = useState<"none" | "json" | "diagnostics">("none");
  // last computed diagram: kept on screen while the next one is computed (no "Computing…" flash)
  const [graph, setGraph] = useState<{ key: string; model: SchemaModel; graph: FocusGraph } | null>(null);
  const [graphError, setGraphError] = useState<{ key: string; message: string } | null>(null);
  // What the pointer is on: a node, one attribute row of a node, or one edge
  const [hovered, setHovered] = useState<Hover | null>(null);
  const hoverRow = useCallback((node: string, row: string | null) => setHovered(row ? { node, row } : { node }), []);
  const key = `${focus}|${details}|${showConstraints}|${showEnums}`;

  useEffect(() => {
    let cancelled = false;
    buildFocusGraph(model, focus, { neighbourDetails: details, constraints: showConstraints, enumerations: showEnums }).then(
      (g) => !cancelled && setGraph({ key, model, graph: g }),
      (e) => !cancelled && setGraphError({ key, message: e instanceof Error ? e.message : String(e) })
    );
    return () => {
      cancelled = true;
    };
  }, [model, focus, details, showConstraints, showEnums, key]);

  // never show a diagram computed for another schema
  const current = graph?.model === model ? graph : null;
  const error = graphError?.key === key ? graphError.message : undefined;
  // the top bar describes the diagram on screen
  const shown = error || !current ? focus : current.graph.focus;
  const c = model.classifiers.get(shown)!;

  const usedBy = useMemo(
    () =>
      new Set(
        (isDrawable(model.classifiers.get(shown)) ? model.relations : model.usages)
          .filter((r) => referencedOf(r) === shown && isDrawable(model.classifiers.get(referrerOf(r))))
          .map(referrerOf)
      ).size,
    [model, shown]
  );

  const nodes = useMemo<UmlFlowNode[]>(
    () =>
      (current?.graph.nodes ?? []).map((n) => ({
        id: n.id,
        type: "uml",
        position: { x: n.x, y: n.y },
        width: n.width,
        height: n.height,
        style: { width: n.width, height: n.height },
        data: { ...n.data, onNavigate: onSelect, onHoverRow: hoverRow },
      })),
    [current, onSelect, hoverRow]
  );

  // Highlighted edges: colours come from CSS; only their z-order changes so they are drawn above the others
  const highlighted = useMemo(() => (current && hovered ? highlightedEdges(current.graph, hovered) : []), [current, hovered]);
  const highlightedKey = highlighted.map((e) => e.id).join("|");
  const edges = useMemo<UmlFlowEdge[]>(() => {
    const top = new Set(highlightedKey ? highlightedKey.split("|") : []);
    return (current?.graph.edges ?? []).map((e) => {
      const markers = edgeMarkers(e.kind, e.triangleAtSource);
      return {
        id: e.id,
        type: "uml",
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
        className: `uml-edge uml-edge--${e.kind}`,
        markerStart: markers.start,
        markerEnd: markers.end,
        zIndex: top.has(e.id) ? 1 : 0,
        data: { stereotype: e.kind === "dependency" ? "«use»" : undefined, role: e.label, multiplicity: e.multiplicity, labelAt: e.labelAt, points: e.points },
      };
    });
  }, [current, highlightedKey]);

  const hoverCss = useMemo(() => highlightCss(highlighted, scope), [highlighted, scope]);
  const hidden = current ? current.graph.hidden.left + current.graph.hidden.right : 0;

  // Size of the drawing area, to fit the diagram before its first frame. With React Flow's own `fitView`,
  // the new diagram is drawn once unscaled at (0, 0), then fitted: a visible flash.
  // React Flow reads `defaultViewport` only when a diagram appears: resizing the window later does not move it.
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s?.width === width && s?.height === height ? s : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const fit = useMemo<{ viewport: Viewport; padding: number } | undefined>(() => {
    if (!current || !size || !current.graph.nodes.length) return undefined;
    const ns = current.graph.nodes;
    const x = Math.min(...ns.map((n) => n.x));
    const y = Math.min(...ns.map((n) => n.y));
    const width = Math.max(...ns.map((n) => n.x + n.width)) - x;
    const height = Math.max(...ns.map((n) => n.y + n.height)) - y;
    const viewport = getViewportForBounds({ x, y, width, height }, size.width, size.height, FIT.minZoom, FIT.maxZoom, FIT.padding);
    // React Flow's initial fit ignores fitViewOptions.maxZoom: a small diagram would appear zoomed in.
    // A larger padding gives the same result as the zoom limit (React Flow: zoom = size / ((1 + padding) * bounds)).
    const room = Math.min(size.width / width, size.height / height);
    const padding = Math.max(FIT.padding, room / FIT.maxZoom - 1);
    return { viewport, padding };
  }, [current, size]);
  const fitOptions = useMemo(() => ({ ...FIT, padding: fit?.padding ?? FIT.padding }), [fit]);

  // what the canvas shows: the error, the diagram, or a message while the first diagram is computed
  let canvas: ReactNode;
  if (error) {
    canvas = <p className="uml-message uml-message--error">Could not compute this diagram: {error}</p>;
  } else if (current) {
    canvas = (
      <ReactFlow<UmlFlowNode, UmlFlowEdge>
        key={current.key}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        // fitted from the first frame: React Flow uses width/height + fitView for its initial state,
        // and defaultViewport when it sets up zoom and pan
        width={size?.width}
        height={size?.height}
        defaultViewport={fit?.viewport}
        fitView
        fitViewOptions={fitOptions}
        minZoom={FIT.minZoom}
        maxZoom={MAX_USER_ZOOM}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={(_, n) => n.data.navigable && onSelect(n.id)}
        onNodeMouseEnter={(_, n) => setHovered({ node: n.id })}
        onNodeMouseLeave={() => setHovered(null)}
        onEdgeMouseEnter={(_, e) => setHovered({ edge: e.id })}
        onEdgeMouseLeave={() => setHovered(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="#d9dee5" />
        <Controls showInteractive={false} fitViewOptions={FIT} />
      </ReactFlow>
    );
  } else {
    // only shown if the first diagram takes a while (see .uml-message--delayed)
    canvas = <p className="uml-message uml-message--delayed">Computing diagram…</p>;
  }

  return (
    <div className="uml-main" data-schema-viewer={scope}>
      <div className="uml-focusbar">
        <div className="uml-focusbar__title">
          <span className={`uml-kind-dot uml-kind-dot--${c.kind}`} aria-hidden="true" />
          <strong className={c.kind === "abstract" ? "uml-name--italic" : undefined}>{c.name}</strong>
          <span className="uml-badge">{KIND_LABEL[c.kind]}</span>
          <span className="uml-badge uml-badge--file" title={c.file}>
            {fileName(c.file)}
            {c.group ? ` › ${c.group}` : ""}
          </span>
          <span className="uml-meta">used by {usedBy}</span>
          {hidden > 0 && <span className="uml-meta">· {hidden} neighbour(s) hidden</span>}
          {c.comment && <span className="uml-meta uml-meta--comment" title={c.comment}>{c.comment}</span>}
        </div>
        <div className="uml-focusbar__actions">
          <label>
            <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} /> Neighbour details
          </label>
          <label title="Constraints in braces: {unique}, {closed}, {format=…}…">
            <input type="checkbox" checked={showConstraints} onChange={(e) => setShowConstraints(e.target.checked)} /> Constraints
          </label>
          <label title="Enumerations used by the class, on the right («use» dependency)">
            <input type="checkbox" checked={showEnums} onChange={(e) => setShowEnums(e.target.checked)} /> Enumerations
          </label>
          <button type="button" onClick={() => setPanel((p) => (p === "json" ? "none" : "json"))} aria-pressed={panel === "json"}>
            JSON
          </button>
          {model.diagnostics.length > 0 && (
            <button
              type="button"
              className="uml-diag-button"
              onClick={() => setPanel((p) => (p === "diagnostics" ? "none" : "diagnostics"))}
              aria-pressed={panel === "diagnostics"}
              title="Schema warnings"
            >
              ⚠ {model.diagnostics.length}
            </button>
          )}
        </div>
      </div>
      <div className="uml-canvas" data-testid="uml-canvas" ref={canvasRef}>
        <UmlMarkers />
        {hoverCss && <style>{hoverCss}</style>}
        {canvas}
        {panel === "json" && <pre className="uml-panel">{JSON.stringify(c.schema, null, 2)}</pre>}
        {panel === "diagnostics" && (
          <div className="uml-panel">
            <h3>Schema warnings</h3>
            <ul>
              {model.diagnostics.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <Legend hint="Click a class or an underlined type to navigate" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hover highlight. Only CSS changes: nodes are never re-rendered on hover, otherwise React Flow
// re-observes them ("ResizeObserver loop completed with undelivered notifications").

type Hover = { node: string; row?: string } | { edge: string };

/**
 * Edges to highlight for what is under the pointer:
 * - one edge: that edge;
 * - an attribute row: the link(s) leaving that row only;
 * - the focus class itself: nothing (otherwise every link of the diagram lights up);
 * - a neighbour class: its links to the focus.
 */
function highlightedEdges(g: FocusGraph, h: Hover): FocusGraph["edges"] {
  if ("edge" in h) return g.edges.filter((e) => e.id === h.edge);
  if (h.row) return g.edges.filter((e) => e.source === h.node && e.sourceHandle === h.row);
  if (h.node === g.focus) return [];
  return g.edges.filter((e) => e.source === h.node || e.target === h.node);
}

/** Replacement string: the matched character preceded by a backslash */
const ESCAPED_MATCH = String.raw`\$&`;
/** Quoted CSS attribute value: `"` and `\` escaped */
const attr = (value: string) => `"${value.replace(/["\\]/g, ESCAPED_MATCH)}"`;

/** `scope`: value of the viewer's `data-schema-viewer` attribute, so that several viewers on one page do not interfere */
function highlightCss(edges: FocusGraph["edges"], scope: string): string {
  const root = `[data-schema-viewer=${attr(scope)}]`;
  const nodes = new Set<string>();
  const rules: string[] = [];
  edges.forEach((e) => {
    nodes.add(e.source);
    nodes.add(e.target);
    const path = `${root} .react-flow__edge[data-id=${attr(e.id)}] .react-flow__edge-path`;
    const m = edgeMarkers(e.kind, e.triangleAtSource, true);
    const markerStart = m.start ? `marker-start: url(#${m.start});` : "";
    const markerEnd = m.end ? `marker-end: url(#${m.end});` : "";
    const markers = markerStart + markerEnd;
    rules.push(`${path} { stroke: var(--uml-accent); stroke-width: 1.8; ${markers} }`);
    if (e.sourceHandle.startsWith("a:")) {
      rules.push(`${root} .react-flow__node[data-id=${attr(e.source)}] .uml-row[data-row=${attr(e.sourceHandle)}] { background: var(--uml-accent-soft); }`);
    }
  });
  nodes.forEach((id) => rules.push(`${root} .react-flow__node[data-id=${attr(id)}] .uml-node { border-color: var(--uml-accent); }`));
  return rules.join("\n");
}

// ---------------------------------------------------------------------------
// Legend of the six UML relation kinds, drawn with the same markers as the diagram

const LEGEND: { kind: RelationKind; label: string; title: string }[] = [
  { kind: "association", label: "association", title: "$ref property to a class" },
  { kind: "aggregation", label: "aggregation", title: "Array of $ref property (convention: JSON Schema does not distinguish aggregation from association)" },
  { kind: "composition", label: "composition", title: 'Nested object property ("Parent.property" class)' },
  { kind: "generalization", label: "generalization", title: "oneOf/anyOf of classes (abstract class) or allOf with $ref" },
  { kind: "realization", label: "realization", title: "No JSON Schema rule produces it yet" },
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

function Legend({ hint }: Readonly<{ hint?: string }>) {
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
