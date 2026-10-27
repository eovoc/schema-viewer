// Ids of the SVG markers (arrow, triangle, diamonds) and which ones each relation kind uses.
// The markers themselves are drawn by components/UmlMarkers; the ids are used by the edges, the legend and the hover CSS.
import type { RelationKind } from "../types/schema";

export type MarkerShape = "arrow" | "triangle" | "diamond" | "diamondFilled";

export const markerId = (shape: MarkerShape, highlighted = false) => `schema-viewer-${shape}${highlighted ? "-hl" : ""}`;

/** Markers of an edge. `triangleAtSource`: for inheritance, the parent class is the edge source (see GraphEdge). */
export function edgeMarkers(kind: RelationKind, triangleAtSource: boolean, highlighted = false): { start?: string; end?: string } {
  const id = (shape: MarkerShape) => markerId(shape, highlighted);
  switch (kind) {
    case "generalization":
      return triangleAtSource ? { start: id("triangle") } : { end: id("triangle") };
    case "aggregation":
      return { start: id("diamond") }; // the diamond sits on the whole (the class owning the attribute)
    case "composition":
      return { start: id("diamondFilled") };
    default:
      return { end: id("arrow") };
  }
}
