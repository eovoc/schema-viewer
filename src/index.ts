// Public API of @eovoc/schema-viewer. Styles: import "@eovoc/schema-viewer/style.css".
export { default as SchemaViewer, type SchemaViewerProps } from "./components/SchemaViewer";

// Building blocks, for other uses (export, tests, custom rendering)
export { loadSchemaBundle, type FetchSchema, type LoadOptions } from "./services/schemaLoader";
export { relativeRef } from "./utils/refs";
export { buildSchemaModel, findDefinition } from "./core/schemaModel";
export type { Attribute, Classifier, ClassifierKind, DefId, JsonSchema, Relation, RelationKind, SchemaBundle, SchemaModel } from "./core/types";
