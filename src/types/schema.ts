// Types of the loaded schemas (SchemaBundle) and of the UML model (SchemaModel),
// used across the package and exported by it (index.ts). Types only: no code.

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

// ---------------------------------------------------------------------------
// UML model (built by schemaModel.ts)

/** Id of a definition: "<document URL>#<JSON Pointer>", e.g. "https://…/mdj.json#/definitions/MD_Metadata" */
export type DefId = string;

/**
 * - class        : object with properties
 * - abstract     : oneOf/anyOf of $refs to classes (abstract class + subclasses)
 * - enumeration  : enum with values
 * - codelist     : plain string without values (e.g. CI_RoleCode)
 * - datatype     : other simple type (DateOrDateTime, Interval…)
 * - alias        : plain $ref to another definition (short-circuited)
 */
export type ClassifierKind = "class" | "abstract" | "enumeration" | "codelist" | "datatype" | "alias";

/** UML relations. Association, aggregation, composition and dependency go from the owner to the type; inheritance from the subclass to the parent */
export type RelationKind = "association" | "aggregation" | "composition" | "generalization" | "realization" | "dependency";

export interface Attribute {
  name: string;
  /** Type label ("string", "CI_Citation", "Map<string, string>"…); empty for a constant */
  type: string;
  /** UML multiplicity without brackets ("0..1", "0..*"); absent when exactly 1 */
  multiplicity?: string;
  required: boolean;
  /** Value of a constant (discriminator), serialised: "\"Feature\"" */
  value?: string;
  /** Constraints shown in braces: unique, format=date, pattern=… */
  constraints: string[];
  /** Definition to open when the type is clicked: the only class it names, else the only definition (enumeration, codelist, data type) */
  target?: DefId;
  /** All classes referenced by the attribute */
  refs: DefId[];
  /** UML link to these classes */
  relation: "association" | "aggregation" | "composition";
}

export interface Classifier {
  id: DefId;
  name: string;
  /** URL of the document declaring the definition */
  file: string;
  /** Container the definition is grouped under (e.g. "thesaurus") */
  group?: string;
  kind: ClassifierKind;
  comment?: string;
  attributes: Attribute[];
  /** Abstract class: its subclasses */
  members: DefId[];
  /** Enumeration: its values */
  literals: string[];
  /** Class-level constraints, or description of a data type */
  constraints: string[];
  /** Class created for a nested object ("Parent.property") or an inline alternative ("Parent.anyOf[1]") */
  synthetic?: boolean;
  /** Alias: the definition it stands for */
  aliasOf?: DefId;
  schema: JsonSchema;
}

export interface Relation {
  kind: RelationKind;
  source: DefId;
  target: DefId;
  /** Attribute name */
  role?: string;
  multiplicity?: string;
}

export interface SchemaModel {
  /** Root document, then the referenced ones */
  documents: string[];
  root: string;
  classifiers: Map<DefId, Classifier>;
  /** Links between classes (drawn in the diagram) */
  relations: Relation[];
  /** Uses of codelists, enumerations and data types («use» dependencies) */
  usages: Relation[];
  /** Documents that could not be loaded, malformed or unresolved references */
  diagnostics: string[];
  /** Definition shown first: target of the root $ref, else the root class, else the first class */
  defaultDefinition?: DefId;
}
