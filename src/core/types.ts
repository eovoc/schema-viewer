// Types shared by the loader and (in the next steps) the UML model.

/** A JSON Schema document or sub-schema (any JSON object) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonSchema = { [key: string]: any };

/** A document referenced by another one that could not be loaded */
export interface LoadError {
  /** URL that was requested */
  url: string;
  /** Document containing the $ref */
  from: string;
  message: string;
}

/** A root schema and every document it references, directly or not */
export interface SchemaBundle {
  /** URL of the root document */
  root: string;
  /** Loaded documents, keyed by their absolute URL (root first) */
  documents: Record<string, JsonSchema>;
  /** For each document: the documents that reference it */
  referencedBy: Record<string, string[]>;
  /** Referenced documents that could not be loaded */
  errors: LoadError[];
}
