// Public API of @eovoc/schema-viewer: entry of the library build (vite.lib.config.ts) and of its type declarations
// (tsconfig.lib.json). Styles: import "@eovoc/schema-viewer/style.css" (added by the library build as dist/style.css).
export { default as SchemaViewer, type SchemaViewerProps } from "./components/SchemaViewer";

// Building blocks, for other uses (export, tests, custom rendering)
export { loadSchemaBundle, type FetchSchema, type LoadOptions } from "./services/schemaLoader";
export { relativeRef } from "./utils/refs";
export { buildSchemaModel, findDefinition } from "./utils/schemaModel";
export type { Attribute, Classifier, ClassifierKind, DefId, JsonSchema, Relation, RelationKind, SchemaBundle, SchemaModel } from "./types/schema";
