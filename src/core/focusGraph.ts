// Diagram of one definition: which boxes and edges, their size, and their placement by ELK.
//  - centre: the definition with all its attributes;
//  - right : what it references (attribute types, subclasses of an abstract class);
//  - left  : what references it ("used by"), including its parent class.
// Edges start from the attribute row (fixed ELK ports).
// No React / React Flow dependency: ui/Diagram.tsx converts the result.
import type { ELK as ElkEngine, ElkNode, ElkPort } from "elkjs/lib/elk-api";
import { referencedOf, referrerOf } from "./schemaModel";
import type { Classifier, DefId, Relation, RelationKind, SchemaModel } from "./types";
import { isDrawable, isInheritance } from "./types";

// ---------------------------------------------------------------------------
// Text measurement, to size the boxes before the layout.
// Browser: canvas (exact). Without canvas (tests under jsdom): estimate.

export const FONT_FAMILY = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export type MeasureText = (text: string, font: { size: number; bold?: boolean; italic?: boolean }) => number;

export const estimateText: MeasureText = (text, { size, bold }) => text.length * size * (bold ? 0.62 : 0.56);

let ctx: CanvasRenderingContext2D | null | undefined;

export const measureText: MeasureText = (text, font) => {
  if (ctx === undefined) {
    const jsdom = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
    ctx = !jsdom && typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  }
  if (!ctx) return estimateText(text, font);
  ctx.font = `${font.italic ? "italic " : ""}${font.bold ? "700 " : ""}${font.size}px ${FONT_FAMILY}`;
  return ctx.measureText(text).width;
};

// ---------------------------------------------------------------------------
// Graph

export const ROW_H = 18;
export const BODY_PAD = 5;
export const EMPTY_BODY_H = 10;
const FONT = 12;
const STEREO_FONT = 10.8;
const MIN_W = 140;
const MAX_W = 460;
const MAX_LITERALS = 14;

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

export type UmlNodeData = {
  name: string;
  stereotype?: string;
  kind: Classifier["kind"] | "more";
  rows: RowData[];
  /** Enumeration with more values than rows: all its values, shown in a scrollable list on demand */
  allLiterals?: string[];
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

export interface FocusGraphOptions {
  neighbourDetails?: boolean;
  /** Show the constraints in braces ({unique}, {closed}, {format=…}…). Default true */
  constraints?: boolean;
  maxPerSide?: number;
  measure?: MeasureText;
}

const STEREOTYPES: Partial<Record<UmlNodeData["kind"], string>> = {
  abstract: "«abstract»",
  enumeration: "«enumeration»",
  codelist: "«codelist»",
  datatype: "«datatype»",
};

export const headerHeight = (stereotype?: string) => (stereotype ? 40 : 28);

/** Node CSS borders (styles.css): counted in the size and port positions, otherwise ELK routes are offset */
export const nodeBorder = (isFocus: boolean) => (isFocus ? 2 : 1.2);
const HEADER_BORDER = 1;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function rowText(r: RowData): string {
  if (r.text !== undefined) return r.text;
  let s = r.name ?? "";
  if (r.value !== undefined) s += ` = ${r.value}`;
  else if (r.type) s += `: ${r.type}`;
  if (r.multiplicity) s += ` [${r.multiplicity}]`;
  if (r.constraints?.length) s += ` {${r.constraints.join(", ")}}`;
  return s;
}

function rowsFor(c: Classifier, full: boolean, constraints: boolean): RowData[] {
  if (!full) {
    if (c.kind === "abstract") return [{ id: "summary", text: plural(c.members.length, "subclass", "subclasses"), muted: true }];
    return [{ id: "summary", text: plural(c.attributes.length, "attribute", "attributes"), muted: true }];
  }
  switch (c.kind) {
    case "class": {
      const rows: RowData[] = c.attributes.map((a) => ({
        id: `a:${a.name}`,
        name: a.name,
        type: a.type,
        value: a.value,
        multiplicity: a.multiplicity,
        constraints: constraints ? a.constraints : undefined,
        required: a.required,
        target: a.target,
        port: a.refs.length > 0,
      }));
      if (constraints && c.constraints.length) rows.push({ id: "constraints", text: `{${c.constraints.join(", ")}}`, muted: true });
      return rows;
    }
    case "abstract":
      return [];
    case "enumeration": {
      const rows: RowData[] = c.literals.slice(0, MAX_LITERALS).map((l, i) => ({ id: `l${i}`, text: l }));
      // the last row opens the full list (scrollable, in the same box: see UmlNode)
      if (c.literals.length > MAX_LITERALS) rows.push({ id: "more", text: `… +${c.literals.length - MAX_LITERALS} (show all)`, muted: true });
      return rows;
    }
    default:
      return c.constraints.map((t, i) => ({ id: `c${i}`, text: t, muted: i > 0 }));
  }
}

function makeNode(c: Classifier, isFocus: boolean, full: boolean, measure: MeasureText, constraints = true): GraphNode {
  const stereotype = STEREOTYPES[c.kind];
  const rows = rowsFor(c, isFocus || full, constraints);
  const width = Math.round(
    Math.min(
      MAX_W,
      Math.max(
        MIN_W,
        measure(c.name, { size: FONT, bold: true, italic: c.kind === "abstract" }) + 32,
        stereotype ? measure(stereotype, { size: STEREO_FONT }) + 32 : 0,
        ...rows.map((r) => measure(rowText(r), { size: FONT, italic: r.muted }) + 32) // padding 20 + slack (canvas vs DOM rounding, zoom)
      )
    )
  );
  const height =
    headerHeight(stereotype) + HEADER_BORDER + 2 * nodeBorder(isFocus) + (rows.length ? BODY_PAD * 2 + rows.length * ROW_H : EMPTY_BODY_H);
  return {
    id: c.id,
    x: 0,
    y: 0,
    width,
    height,
    data: {
      name: c.name,
      stereotype,
      kind: c.kind,
      rows,
      isFocus,
      compact: !isFocus && !full,
      italic: c.kind === "abstract",
      navigable: !isFocus,
      file: c.file,
      comment: c.comment,
      allLiterals: c.kind === "enumeration" && c.literals.length > MAX_LITERALS ? c.literals : undefined,
    },
  };
}

function moreNode(id: string, count: number, measure: MeasureText): GraphNode {
  const text = `+${count} more`;
  return {
    id,
    x: 0,
    y: 0,
    width: Math.max(MIN_W, measure(text, { size: FONT }) + 32),
    height: headerHeight() + EMPTY_BODY_H,
    data: { name: text, kind: "more", rows: [], isFocus: false, compact: true, italic: false, navigable: false },
  };
}

interface Group {
  neighbour: DefId;
  kind: RelationKind;
  roles: string[];
  multiplicity?: string;
}

/** Groups relations by neighbour; inheritance hides the duplicate structural link (subclass ↔ parent). */
function groupRelations(rels: Relation[], neighbourOf: (r: Relation) => DefId, generalized: Set<DefId>): Group[] {
  const groups = new Map<string, Group>();
  rels.forEach((r) => {
    const n = neighbourOf(r);
    if (!isInheritance(r.kind) && generalized.has(n)) return;
    const key = `${r.kind}|${n}`;
    const g = groups.get(key) ?? { neighbour: n, kind: r.kind, roles: [], multiplicity: r.multiplicity };
    if (r.role && !g.roles.includes(r.role)) g.roles.push(r.role);
    groups.set(key, g);
  });
  return Array.from(groups.values());
}

// ELK (~1.5 MB) is loaded on first use, in its own chunk
let elk: Promise<ElkEngine> | undefined;
const getElk = () => (elk ??= import("elkjs/lib/elk.bundled.js").then((m) => new m.default()));

export async function buildFocusGraph(model: SchemaModel, focus: DefId, options: FocusGraphOptions = {}): Promise<FocusGraph> {
  const { neighbourDetails = false, constraints = true, maxPerSide = 30, measure = measureText } = options;
  const fc = model.classifiers.get(focus);
  if (!fc) throw new Error(`Unknown definition: ${focus}`);

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  nodes.set(focus, makeNode(fc, true, true, measure, constraints));

  const drawable = (id: DefId) => id !== focus && isDrawable(model.classifiers.get(id));
  const outRels = model.relations.filter((r) => referrerOf(r) === focus && drawable(referencedOf(r)));
  const incoming = isDrawable(fc) ? model.relations : model.usages;
  const inRels = incoming.filter((r) => referencedOf(r) === focus && drawable(referrerOf(r)));
  const generalized = new Set<DefId>([
    ...outRels.filter((r) => isInheritance(r.kind)).map(referencedOf),
    ...inRels.filter((r) => isInheritance(r.kind)).map(referrerOf),
  ]);
  const outGroups = groupRelations(outRels, referencedOf, generalized);
  const inGroups = groupRelations(inRels, referrerOf, generalized);

  const byName = (a: Group, b: Group) => model.classifiers.get(a.neighbour)!.name.localeCompare(model.classifiers.get(b.neighbour)!.name);
  const hidden = { left: 0, right: 0 };
  const take = (groups: Group[], side: "left" | "right") => {
    const ids = Array.from(new Set(groups.map((g) => g.neighbour)));
    const kept = new Set(ids.length > maxPerSide ? ids.slice(0, maxPerSide - 1) : ids);
    hidden[side] = ids.length - kept.size;
    if (hidden[side] > 0) nodes.set(`more:${side}`, moreNode(`more:${side}`, hidden[side], measure));
    return groups.filter((g) => kept.has(g.neighbour));
  };

  // Right: what the focus references, in the order of the attributes leading there (no crossing routes)
  const rowIndex = (g: Group) => {
    const i = Math.min(...g.roles.map((r) => fc.attributes.findIndex((a) => a.name === r)).filter((i) => i >= 0));
    return Number.isFinite(i) ? i : Number.MAX_SAFE_INTEGER;
  };
  outGroups.sort((a, b) => rowIndex(a) - rowIndex(b) || byName(a, b));
  const right = take(outGroups, "right");
  right.forEach((g) => {
    if (!nodes.has(g.neighbour)) nodes.set(g.neighbour, makeNode(model.classifiers.get(g.neighbour)!, false, neighbourDetails, measure, constraints));
    if (!isInheritance(g.kind)) {
      g.roles.forEach((role) => {
        const attr = fc.attributes.find((a) => a.name === role);
        edges.push({
          id: `out:${role}->${g.neighbour}`,
          kind: g.kind,
          source: focus,
          sourceHandle: `a:${role}`,
          target: g.neighbour,
          targetHandle: "in",
          label: role,
          multiplicity: attr?.multiplicity ?? "1",
          labelAt: "target",
          triangleAtSource: false,
          layout: true,
        });
      });
    } else {
      edges.push({
        id: `gen:${focus}->${g.neighbour}`,
        kind: g.kind,
        source: focus,
        sourceHandle: "out",
        target: g.neighbour,
        targetHandle: "in",
        labelAt: "target",
        triangleAtSource: true,
        layout: true,
      });
    }
  });
  combineLabels(edges.filter((e) => e.source === focus && e.labelAt === "target" && e.label));
  if (nodes.has("more:right")) {
    edges.push({ id: "more:right", kind: "association", source: focus, sourceHandle: "out", target: "more:right", targetHandle: "in", labelAt: "target", triangleAtSource: false, layout: true });
  }

  // Left: what references the focus (a neighbour already on the right gives a "back" edge)
  const onRight = new Set(right.map((g) => g.neighbour));
  const leftGroups = inGroups.filter((g) => !onRight.has(g.neighbour));
  leftGroups.sort(byName);
  const left = take(leftGroups, "left");
  const back = inGroups.filter((g) => onRight.has(g.neighbour));
  left.forEach((g) => {
    const n = model.classifiers.get(g.neighbour)!;
    if (!nodes.has(g.neighbour)) nodes.set(g.neighbour, makeNode(n, false, neighbourDetails, measure, constraints));
    const label = g.roles.length ? g.roles.join(", ") : undefined;
    if (!isInheritance(g.kind) && neighbourDetails) {
      const node = nodes.get(g.neighbour)!;
      g.roles.forEach((role) => {
        // the attribute row becomes a port, even when its type is not a class (codelist view)
        const row = node.data.rows.find((r) => r.id === `a:${role}`);
        if (row) row.port = true;
        edges.push({
          id: `in:${g.kind}:${g.neighbour}.${role}`,
          kind: g.kind,
          source: g.neighbour,
          sourceHandle: row ? `a:${role}` : "out",
          target: focus,
          targetHandle: "in",
          label: role,
          multiplicity: n.attributes.find((a) => a.name === role)?.multiplicity ?? "1",
          // next to the attribute row: one row per edge, so the labels never overlap
          labelAt: "source",
          triangleAtSource: false,
          layout: true,
        });
      });
    } else {
      edges.push({
        id: `in:${g.kind}:${g.neighbour}`,
        kind: g.kind,
        source: g.neighbour,
        sourceHandle: "out",
        target: focus,
        targetHandle: "in",
        label: isInheritance(g.kind) ? undefined : label,
        multiplicity: isInheritance(g.kind) ? undefined : g.multiplicity,
        labelAt: "source",
        triangleAtSource: isInheritance(g.kind),
        layout: true,
      });
    }
  });
  if (nodes.has("more:left")) {
    edges.push({ id: "more:left", kind: "association", source: "more:left", sourceHandle: "out", target: focus, targetHandle: "in", labelAt: "source", triangleAtSource: false, layout: true });
  }
  back.forEach((g) =>
    edges.push({
      id: `back:${g.kind}:${g.neighbour}`,
      kind: g.kind,
      source: g.neighbour,
      sourceHandle: "out-l",
      target: focus,
      targetHandle: "in-r",
      label: !isInheritance(g.kind) && g.roles.length ? g.roles.join(", ") : undefined,
      multiplicity: isInheritance(g.kind) ? undefined : g.multiplicity,
      labelAt: "source",
      triangleAtSource: isInheritance(g.kind),
      layout: false,
    })
  );

  // Safety net: ELK rejects the whole graph when an edge targets a missing port
  const portIds = new Set(Array.from(nodes.values()).flatMap((n) => ports(n).map((p) => p.id)));
  edges
    .filter((e) => e.layout) // back edges use the out-l / in-r handles, outside the ELK layout
    .forEach((e) => {
      if (!portIds.has(`${e.source}::${e.sourceHandle}`)) e.sourceHandle = "out";
      if (!portIds.has(`${e.target}::${e.targetHandle}`)) e.targetHandle = "in";
    });

  await layout(Array.from(nodes.values()), edges);
  return { focus, nodes: Array.from(nodes.values()), edges, hidden };
}

/**
 * Several attributes of the focus can lead to the same class (e.g. MD_Metadata has four attributes of type
 * CI_Citation): their edges arrive at the same point, so their labels are written once, together.
 */
function combineLabels(edges: GraphEdge[]) {
  const byTarget = new Map<string, GraphEdge[]>();
  edges.forEach((e) => byTarget.set(e.target, [...(byTarget.get(e.target) ?? []), e]));
  byTarget.forEach((es) => {
    if (es.length < 2) return;
    const sameMultiplicity = es.every((e) => e.multiplicity === es[0].multiplicity);
    es[0].label = es.map((e) => (sameMultiplicity ? e.label : `${e.label} [${e.multiplicity}]`)).join(", ");
    es[0].multiplicity = sameMultiplicity ? es[0].multiplicity : undefined;
    es.slice(1).forEach((e) => {
      e.label = undefined;
      e.multiplicity = undefined;
    });
  });
}

function ports(n: GraphNode): ElkPort[] {
  const b = nodeBorder(n.data.isFocus);
  const h = headerHeight(n.data.stereotype);
  const list: ElkPort[] = [
    { id: `${n.id}::in`, x: 0, y: b + h / 2, width: 1, height: 1, layoutOptions: { "elk.port.side": "WEST" } },
    { id: `${n.id}::out`, x: n.width, y: b + h / 2, width: 1, height: 1, layoutOptions: { "elk.port.side": "EAST" } },
  ];
  n.data.rows.forEach((r, i) => {
    if (r.port) {
      list.push({
        id: `${n.id}::${r.id}`,
        x: n.width,
        y: b + h + HEADER_BORDER + BODY_PAD + i * ROW_H + ROW_H / 2,
        width: 1,
        height: 1,
        layoutOptions: { "elk.port.side": "EAST" },
      });
    }
  });
  return list;
}

async function layout(nodes: GraphNode[], edges: GraphEdge[]): Promise<void> {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "150",
      "elk.spacing.nodeNode": "26",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      // centre the focus vertically against its neighbours (otherwise it aligns with the last one)
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      // keep the neighbour order computed above (attribute order)
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      // orthogonal routes computed by ELK (fewer bends than React Flow's "smoothstep")
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.mergeEdges": "true",
      "elk.layered.spacing.edgeNodeBetweenLayers": "20",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
      "elk.layered.unnecessaryBendpoints": "false",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
      ports: ports(n),
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
    })),
    edges: edges
      .filter((e) => e.layout)
      .map((e) => ({ id: e.id, sources: [`${e.source}::${e.sourceHandle}`], targets: [`${e.target}::${e.targetHandle}`] })),
  };
  const result = await (await getElk()).layout(graph);
  const pos = new Map((result.children ?? []).map((c) => [c.id, c]));
  nodes.forEach((n) => {
    const p = pos.get(n.id);
    n.x = p?.x ?? 0;
    n.y = p?.y ?? 0;
  });
  const routes = new Map(
    (result.edges ?? []).map((e) => {
      const section = e.sections?.[0];
      return [e.id, section ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint] : undefined];
    })
  );
  edges.forEach((e) => {
    const points = routes.get(e.id);
    if (points) e.points = points.map((p) => ({ x: p.x, y: p.y }));
  });
}
