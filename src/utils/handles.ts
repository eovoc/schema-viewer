// Ids of the handles of a box (where its edges start and end) and of the matching ELK ports.
// React Flow (UmlNode) and ELK (focusGraph) must use the same ids: build them with these helpers, never by hand.
import type { HandleId } from "../types/graph";

/** Handles of the header. "out-l" and "in-r" are for the back edges (mutual references), drawn right to left. */
export const HANDLE = { in: "in", out: "out", outLeft: "out-l", inRight: "in-r" } as const satisfies Record<string, HandleId>;

/** Handle of an attribute row, which is also the id of the row (RowData.id) */
export const attributeHandle = (attributeName: string): HandleId => `a:${attributeName}`;

export const isAttributeHandle = (handle: string) => handle.startsWith("a:");

/** ELK port of a handle */
export const portId = (nodeId: string, handle: string) => `${nodeId}::${handle}`;
