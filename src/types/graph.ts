// Diagram of one definition, as computed by buildFocusGraph (utils/focusGraph.ts): boxes, rows, edges.
import type { Classifier, DefId, RelationKind } from "./schema";

/**
 * One row of a box. Two forms:
 * - text row (`text` set): a summary, a value, a constraint… drawn as plain text, the other fields are ignored;
 * - attribute row: `name`, then `type` or `value`, `multiplicity`, `constraints`.
 */
export interface RowData {
  /** Unique in the box. Attribute rows: "a:<attribute name>", also the id of their handle (see HandleId) */
  id: string;
  name?: string;
  type?: string;
  /** Constant value (discriminator), shown as "name = value" */
  value?: string;
  multiplicity?: string;
  constraints?: string[];
  required?: boolean;
  /** Definition opened by a click on the type */
  target?: DefId;
  /** Text row: the whole text of the row */
  text?: string;
  /** Drawn in grey italics (summaries, "… +N (show all)") */
  muted?: boolean;
  /** An edge starts from this row: it gets a handle on the right edge of the box */
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
  /** Box at the centre of the diagram */
  isFocus: boolean;
  /** Summary only (one row), i.e. a neighbour without "Neighbour details" */
  compact: boolean;
  /** Name in italics (abstract class, UML convention) */
  italic: boolean;
  /** A click opens this definition (every box except the centre one and "+N more") */
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
