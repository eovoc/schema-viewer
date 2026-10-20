// Public API of @eovoc/schema-viewer. Styles: import "@eovoc/schema-viewer/style.css".
export { default as SchemaViewer, type SchemaViewerProps } from "./SchemaViewer";

// Building blocks, for other uses (export, tests, custom rendering)
export { loadSchemaBundle, relativeRef, type FetchSchema, type LoadOptions } from "./core/loader";
export { buildSchemaModel, findDefinition } from "./core/schemaModel";
export type { Attribute, Classifier, ClassifierKind, DefId, JsonSchema, Relation, RelationKind, SchemaBundle, SchemaModel } from "./core/types";
