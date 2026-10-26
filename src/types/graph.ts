// Diagram of one definition, as computed by buildFocusGraph (utils/focusGraph.ts): boxes, rows, edges.
import type { Classifier, DefId, RelationKind } from "./schema";

export interface RowData {
  id: string;
  name?: string;
  type?: string;
  value?: string;
  multiplicity?: string;
  constraints?: string[];
  required?: boolean;
  target?: DefId;
  text?: string;
  muted?: boolean;
  port?: boolean;
}

/** Item of a list shown in a box: a subclass (id: its DefId) or an enumeration value (id: the value itself) */
export interface ListItem {
  id: string;
  text: string;
}

export type UmlNodeData = {
  name: string;
  stereotype?: string;
  kind: Classifier["kind"] | "more";
  rows: RowData[];
  /** Enumeration or abstract class whose list is longer than its rows: the whole list, shown scrollable on demand */
  allItems?: ListItem[];
  isFocus: boolean;
  compact: boolean;
  italic: boolean;
  navigable: boolean;
  file?: string;
  comment?: string;
};

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: UmlNodeData;
}

/** Handles of a box: header ("in", "out", and "out-l" / "in-r" for mutual references) or attribute row ("a:<name>") */
export type HandleId = "in" | "out" | "out-l" | "in-r" | `a:${string}`;

export interface GraphEdge {
  id: string;
  kind: RelationKind;
  source: string;
  sourceHandle: HandleId;
  target: string;
  targetHandle: HandleId;
  /** Role(s) and multiplicity, shown near the given end */
  label?: string;
  multiplicity?: string;
  labelAt: "source" | "target";
  /** Inheritance: the parent class is the source (triangle on the source side) */
  triangleAtSource: boolean;
  /** "Back" edge (mutual reference): drawn but ignored by the layout */
  layout: boolean;
  /** Route computed by ELK (start, bends, end); absent for back edges */
  points?: { x: number; y: number }[];
}

export interface FocusGraph {
  focus: DefId;
  nodes: GraphNode[];
  edges: GraphEdge[];
  hidden: { left: number; right: number };
}
