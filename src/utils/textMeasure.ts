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
