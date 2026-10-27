// UML diagram of one definition: top bar, React Flow canvas, JSON and warnings panels, legend.
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Background, Controls, getViewportForBounds, ReactFlow, type EdgeTypes, type NodeTypes, type Viewport } from "@xyflow/react";
import { useElementSize } from "../../hooks/useElementSize";
import type { FocusGraph } from "../../types/graph";
import { toMessage } from "../../utils/errors";
import { highlightCss, highlightedEdges, type Hover } from "../../utils/edgeHighlight";
import { buildFocusGraph } from "../../utils/focusGraph";
import { edgeMarkers } from "../../utils/markers";
import { fileName } from "../../utils/refs";
import { getClassifier, incomingRelations, referrerOf } from "../../utils/schemaModel";
import type { ClassifierKind, DefId, SchemaModel } from "../../types/schema";
import UmlEdge, { type UmlFlowEdge } from "../UmlEdge";
import UmlMarkers from "../UmlMarkers";
import UmlNode, { type UmlFlowNode } from "../UmlNode";
import Legend from "../Legend";

const nodeTypes: NodeTypes = { uml: UmlNode };
const FIT = { padding: 0.12, minZoom: 0.1, maxZoom: 1.1 };
const MAX_USER_ZOOM = 2;
const edgeTypes: EdgeTypes = { uml: UmlEdge };

const KIND_LABEL: Record<ClassifierKind, string> = {
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
      (e) => !cancelled && setGraphError({ key, message: toMessage(e) })
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
  const classifier = getClassifier(model, shown);

  const usedBy = useMemo(
    () =>
      new Set(incomingRelations(model, shown).map(referrerOf)).size,
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
  // ids of the highlighted edges as one string: the edges below are rebuilt only when this set changes,
  // not each time `highlighted` is a new array with the same edges
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
  const [canvasRef, size] = useElementSize<HTMLDivElement>();
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
          <span className={`uml-kind-dot uml-kind-dot--${classifier.kind}`} aria-hidden="true" />
          <strong className={classifier.kind === "abstract" ? "uml-name--italic" : undefined}>{classifier.name}</strong>
          <span className="uml-badge">{KIND_LABEL[classifier.kind]}</span>
          <span className="uml-badge uml-badge--file" title={classifier.file}>
            {fileName(classifier.file)}
            {classifier.group ? ` › ${classifier.group}` : ""}
          </span>
          <span className="uml-meta">used by {usedBy}</span>
          {hidden > 0 && <span className="uml-meta">· {hidden} neighbour(s) hidden</span>}
          {classifier.comment && <span className="uml-meta uml-meta--comment" title={classifier.comment}>{classifier.comment}</span>}
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
        {panel === "json" && <pre className="uml-panel">{JSON.stringify(classifier.schema, null, 2)}</pre>}
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
