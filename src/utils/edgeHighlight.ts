// Hover highlight. Only CSS changes: nodes are never re-rendered on hover, otherwise React Flow
// re-observes them ("ResizeObserver loop completed with undelivered notifications").
// Used by components/Diagram: what is under the pointer -> edges to highlight -> CSS rules.
import type { FocusGraph } from "../types/graph";
import { isAttributeHandle } from "./handles";
import { edgeMarkers } from "./markers";

export type Hover = { node: string; row?: string } | { edge: string };

/**
 * Edges to highlight for what is under the pointer:
 * - one edge: that edge;
 * - an attribute row: the link(s) leaving that row only;
 * - the focus class itself: nothing (otherwise every link of the diagram lights up);
 * - a neighbour class: its links to the focus.
 */
export function highlightedEdges(g: FocusGraph, h: Hover): FocusGraph["edges"] {
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
export function highlightCss(edges: FocusGraph["edges"], scope: string): string {
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
    if (isAttributeHandle(e.sourceHandle)) {
      rules.push(`${root} .react-flow__node[data-id=${attr(e.source)}] .uml-row[data-row=${attr(e.sourceHandle)}] { background: var(--uml-accent-soft); }`);
    }
  });
  nodes.forEach((id) => rules.push(`${root} .react-flow__node[data-id=${attr(id)}] .uml-node { border-color: var(--uml-accent); }`));
  return rules.join("\n");
}
