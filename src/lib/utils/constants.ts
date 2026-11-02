// Dimensions of a box, in px. ELK needs them to place the boxes and the ports of the attribute rows before anything
// is drawn, so they are defined here only: UmlNode passes them to styles/node.css as CSS variables (--uml-row-h…).
export const ROW_H = 18;
export const BODY_PAD = 5;
export const EMPTY_BODY_H = 10;
export const HEADER_BORDER = 1;

export const headerHeight = (stereotype?: string) => (stereotype ? 40 : 28);

/** Border of a box: counted in its size and in the port positions, otherwise ELK routes are offset */
export const nodeBorder = (isFocus: boolean) => (isFocus ? 2 : 1.2);
