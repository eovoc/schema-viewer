// JSON Schema (draft-07, one or more documents) -> UML model: classes, attributes, relations.
// The rules are listed in the README ("JSON Schema -> UML rules").
import { escapePointer, getPointer, pointerName } from "../utils/jsonPointer";
import { collectRefs, fileName, resolveRef } from "../utils/refs";
import type { Attribute, Classifier, ClassifierKind, DefId, JsonSchema, Relation, SchemaBundle, SchemaModel } from "./types";
import { isDrawable, isInheritance } from "./types";

const ANNOTATIONS = new Set(["$comment", "description", "title", "$id", "examples", "default"]);

const isArraySchema = (s: JsonSchema) => !!s && (s.type === "array" || (s.items !== undefined && s.type === undefined));
const alternativesOf = (s: JsonSchema): JsonSchema[] | undefined => s.oneOf ?? s.anyOf;

type RawKind = ClassifierKind | "union";

const isObjectSchema = (s: JsonSchema) => !!s && typeof s === "object" && typeof s.$ref !== "string" && (!!s.properties || s.type === "object");
const isInlineObject = (s: JsonSchema) => !!s && typeof s === "object" && typeof s.$ref !== "string" && !!s.properties;
/** Enum written in the property itself (no $ref), whatever its number of values */
const isInlineEnum = (s: JsonSchema) => !!s && typeof s === "object" && typeof s.$ref !== "string" && Array.isArray(s.enum) && s.enum.length > 0;
const literalsOf = (s: JsonSchema): string[] => (s.enum ?? []).map((v: unknown) => (typeof v === "string" ? v : JSON.stringify(v)));

const isRef = (s: JsonSchema) => typeof s?.$ref === "string";
/** Array schema: its item (first one for a tuple) */
const itemOf = (s: JsonSchema): JsonSchema | undefined => (Array.isArray(s.items) ? s.items[0] : s.items);
/** Object with properties, `type: object`, or a map (additionalProperties schema) */
const isClassLike = (s: JsonSchema) =>
  !!s.properties || s.type === "object" || (!!s.additionalProperties && typeof s.additionalProperties === "object");
/** `{ type: object, additionalProperties: {…} }` without properties: Map<string, …> */
const isMapSchema = (s: JsonSchema) =>
  s.type === "object" && !!s.additionalProperties && typeof s.additionalProperties === "object" && !s.properties;
/** Only `key` and annotations */
const onlyKey = (s: JsonSchema, key: string) => Object.keys(s).every((k) => k === key || ANNOTATIONS.has(k));

/** Kind of a schema made of oneOf / anyOf alternatives */
function alternativesKind(alts: JsonSchema[]): RawKind {
  if (alts.every(isRef)) return "union";
  // mix of $refs and inline objects: abstract class, inline objects become synthetic subclasses
  if (alts.some(isRef) && alts.every((a) => isRef(a) || isObjectSchema(a))) return "union";
  if (alts.every((a) => a && (a.properties || a.type === "object"))) return "class"; // choice between inline objects
  return "datatype";
}

function rawKind(s: JsonSchema): RawKind {
  if (s.enum) return "enumeration";
  if (Array.isArray(s.allOf)) return "class"; // inheritance through allOf + merged attributes
  const alts = alternativesOf(s);
  // { type: "object", oneOf: [$ref…] } (e.g. GeoJSON Geometry) is a union, not an empty class
  if (alts && !s.properties && alts.every(isRef)) return "union";
  if (isClassLike(s)) return "class";
  if (alts) return alternativesKind(alts);
  if (isRef(s) && onlyKey(s, "$ref")) return "alias";
  if (s.type === "string" && onlyKey(s, "type")) return "codelist";
  return "datatype";
}

/** Type label of an enum: its values when there are 3 or fewer, else enum(N) */
const enumLabel = (values: unknown[]) => (values.length <= 3 ? values.map((v) => JSON.stringify(v)).join(" | ") : `enum(${values.length})`);

/** Type label of a schema without $ref, enum, array or composition */
function simpleTypeLabel(s: JsonSchema): string {
  if (s.type === "object" && s.properties) return "object {…}";
  if (Array.isArray(s.type)) return s.type.join(" | ");
  return s.type ?? "any";
}

/** Constraints of an object: number of properties, closed */
function objectConstraints(s: JsonSchema): string[] {
  const c: string[] = [];
  if (s.minProperties !== undefined) c.push(`minProperties=${s.minProperties}`);
  if (s.maxProperties !== undefined) c.push(`maxProperties=${s.maxProperties}`);
  if (s.additionalProperties === false) c.push("closed");
  return c;
}

export function multiplicity(s: JsonSchema, required: boolean): string | undefined {
  if (isArraySchema(s)) {
    const lo = required ? s.minItems ?? 0 : 0;
    const hi = s.maxItems ?? "*";
    return lo === hi ? String(lo) : `${lo}..${hi}`;
  }
  return required ? undefined : "0..1";
}

function constraintsOf(s: JsonSchema, item: JsonSchema): string[] {
  const c: string[] = [];
  if (s.uniqueItems) c.push("unique");
  if (item.format) c.push(`format=${item.format}`);
  if (item.pattern) c.push(`pattern=${item.pattern}`);
  if (item.minimum !== undefined) c.push(`>=${item.minimum}`);
  if (item.exclusiveMinimum !== undefined) c.push(`>${item.exclusiveMinimum}`);
  if (item.maximum !== undefined) c.push(`<=${item.maximum}`);
  if (item.exclusiveMaximum !== undefined) c.push(`<${item.exclusiveMaximum}`);
  if (item.minLength !== undefined || item.maxLength !== undefined) c.push(`length=${item.minLength ?? 0}..${item.maxLength ?? "*"}`);
  return c;
}

/** Keywords that make an object a schema; an object without any of them whose values are all objects is a container */
const SCHEMA_KEYWORDS = new Set([
  "type", "properties", "$ref", "enum", "const", "oneOf", "anyOf", "allOf", "not", "items", "additionalProperties",
  "patternProperties", "required", "format", "pattern", "minimum", "maximum", "minLength", "maxLength", "if", "then",
  "else", "contains", "propertyNames", "minItems", "maxItems", "uniqueItems", "$schema",
]);

/** Object grouping definitions, e.g. "thesaurus" in "#/definitions/thesaurus/product-types" */
function isContainer(s: unknown): boolean {
  if (!s || typeof s !== "object" || Array.isArray(s)) return false;
  const entries = Object.entries(s as JsonSchema);
  return (
    entries.length > 0 &&
    entries.every(([k]) => !SCHEMA_KEYWORDS.has(k)) &&
    entries.every(([k, v]) => ANNOTATIONS.has(k) || (!!v && typeof v === "object" && !Array.isArray(v)))
  );
}

const stem = (file: string) => fileName(file).replace(/\.(schema\.)?json$/i, "");

export function buildSchemaModel(bundle: SchemaBundle): SchemaModel {
  const files = bundle.documents;
  const documents = [bundle.root, ...Object.keys(files).filter((f) => f !== bundle.root)];
  const diagnostics: string[] = bundle.errors.map(
    (e) => `Could not load ${fileName(e.url)} (${e.url}): ${e.message}, referenced by ${fileName(e.from)}`
  );
  const report = (m: string) => {
    if (!diagnostics.includes(m)) diagnostics.push(m);
  };
  const quiet = () => undefined;
  const classifiers = new Map<DefId, Classifier>();
  const raw = new Map<DefId, RawKind>();

  const addClassifier = (file: string, pointer: string, schema: JsonSchema, name: string, group?: string) => {
    const id = `${file}#${pointer}`;
    if (classifiers.has(id) || !schema || typeof schema !== "object" || Array.isArray(schema)) return;
    raw.set(id, rawKind(schema));
    classifiers.set(id, {
      id,
      name,
      file,
      group,
      kind: "datatype",
      comment: schema.description ?? (schema.$comment !== name ? schema.$comment : undefined) ?? schema.title,
      attributes: [],
      members: [],
      literals: literalsOf(schema),
      constraints: [],
      schema,
    });
  };
  const declareAll = (file: string, defs: JsonSchema, base: string, group?: string) => {
    for (const [name, schema] of Object.entries<JsonSchema>(defs)) {
      if (ANNOTATIONS.has(name)) continue;
      const pointer = `${base}/${escapePointer(name)}`;
      if (isContainer(schema)) declareAll(file, schema, pointer, group ? `${group}/${name}` : name);
      else addClassifier(file, pointer, schema, name, group);
    }
  };

  // 1. Declare every definition (containers flattened), root schemas that are classes,
  //    then any other location targeted by a $ref (e.g. "#/properties/foo")
  for (const file of documents) {
    const root = files[file];
    if (root.definitions && typeof root.definitions === "object") declareAll(file, root.definitions, "/definitions");
    if (root.$defs && typeof root.$defs === "object") declareAll(file, root.$defs, "/$defs");
    const rk = rawKind(root);
    if (rk === "class" || rk === "union") addClassifier(file, "", root, stem(file));
  }
  for (const file of documents) {
    collectRefs(files[file]).forEach((ref) => {
      const { id } = resolveRef(ref, file, files, quiet);
      if (!id || classifiers.has(id)) return;
      const [doc, pointer] = [id.slice(0, id.indexOf("#")), id.slice(id.indexOf("#") + 1)];
      addClassifier(doc, pointer, getPointer(files[doc], pointer) as JsonSchema, pointer ? pointerName(pointer) : stem(doc));
    });
  }

  const resolve = (ref: string, file: string) => resolveRef(ref, file, files, report);

  // 2. Aliases (chained) then unions: abstract only when every member is a class
  const aliasTarget = (id: DefId, seen = new Set<DefId>()): DefId => {
    if (raw.get(id) !== "alias" || seen.has(id)) return id;
    seen.add(id);
    const c = classifiers.get(id)!;
    const target = resolve(c.schema.$ref, c.file).id;
    return target ? aliasTarget(target, seen) : id;
  };
  const follow = (id: DefId | undefined) => (id ? aliasTarget(id) : undefined);

  const kindOf = (id: DefId, seen = new Set<DefId>()): ClassifierKind => {
    const r = raw.get(id);
    if (r !== "union") return r ?? "datatype";
    if (seen.has(id)) return "abstract";
    seen.add(id);
    const c = classifiers.get(id)!;
    const alts = alternativesOf(c.schema)!.filter((a) => typeof a?.$ref === "string");
    const members = alts.map((a) => follow(resolve(a.$ref, c.file).id));
    return members.every((m) => m && ["class", "abstract"].includes(kindOf(m, seen))) ? "abstract" : "datatype";
  };

  classifiers.forEach((c) => {
    c.kind = kindOf(c.id);
    if (c.kind === "alias") {
      const target = aliasTarget(c.id);
      c.aliasOf = target !== c.id ? target : undefined;
      if (!c.aliasOf) c.kind = "datatype";
    }
  });

  // 3. Attributes, members and relations
  const relations: Relation[] = [];
  const usages: Relation[] = [];

  /** Name of the definition a $ref designates (aliases followed), or the $ref itself when unresolved */
  const refLabel = (ref: string, file: string): string => {
    const r = resolve(ref, file);
    const target = follow(r.id);
    return target ? classifiers.get(target)!.name : r.label;
  };

  const typeLabel = (s: JsonSchema, file: string): string => {
    if (!s || typeof s !== "object" || Object.keys(s).length === 0) return "any";
    if (isRef(s)) return refLabel(s.$ref, file);
    if ("const" in s) return JSON.stringify(s.const);
    if (s.enum) return enumLabel(s.enum);
    if (isArraySchema(s)) {
      const item = itemOf(s);
      return item ? typeLabel(item, file) : "any";
    }
    return compositeLabel(s, file) ?? simpleTypeLabel(s);
  };

  /** Type label of oneOf / anyOf ("A | B"), allOf ("A & B") or a map ("Map<string, A>"); undefined otherwise */
  const compositeLabel = (s: JsonSchema, file: string): string | undefined => {
    const alts = alternativesOf(s);
    if (alts) return alts.map((a) => typeLabel(a, file)).join(" | ");
    if (s.allOf) return s.allOf.map((a: JsonSchema) => typeLabel(a, file)).join(" & ");
    if (isMapSchema(s)) return `Map<string, ${typeLabel(s.additionalProperties, file)}>`;
    return undefined;
  };

  /** Definitions (of any kind) referenced by a schema, aliases followed */
  const definitionRefs = (s: JsonSchema, file: string): DefId[] => {
    const ids = collectRefs(s)
      .map((r) => follow(resolve(r, file).id))
      .filter((id): id is DefId => !!id && classifiers.has(id));
    return Array.from(new Set(ids));
  };
  const drawableRefs = (s: JsonSchema, file: string): DefId[] => definitionRefs(s, file).filter((id) => isDrawable(classifiers.get(id)));

  // Nested object -> synthetic class "Parent.property", linked by a composition
  const syntheticFor = (parent: Classifier, prop: string, schema: JsonSchema): DefId => {
    const id = `${parent.id}/properties/${escapePointer(prop)}`;
    if (!classifiers.has(id)) {
      // added during the iteration: Map.forEach will visit it and build its attributes
      classifiers.set(id, {
        id,
        name: `${parent.name}.${prop}`,
        file: parent.file,
        group: parent.group,
        kind: "class",
        synthetic: true,
        comment: schema.description,
        attributes: [],
        members: [],
        literals: [],
        constraints: [],
        schema,
      });
    }
    return id;
  };

  // Inline object among the alternatives of an abstract class -> synthetic subclass "Parent.anyOf[i]"
  const syntheticAlternative = (parent: Classifier, key: string, i: number, schema: JsonSchema): DefId => {
    const id = `${parent.id}/${key}/${i}`;
    if (!classifiers.has(id)) {
      classifiers.set(id, {
        id,
        name: typeof schema.title === "string" && schema.title.length <= 40 ? schema.title : `${parent.name}.${key}[${i}]`,
        file: parent.file,
        group: parent.group,
        kind: "class",
        synthetic: true,
        comment: schema.description,
        attributes: [],
        members: [],
        literals: [],
        constraints: [],
        schema,
      });
    }
    return id;
  };

  // Enum written in a property -> synthetic enumeration "Parent.property", used by the class («use»)
  const syntheticEnum = (parent: Classifier, prop: string, schema: JsonSchema): DefId => {
    const id = `${parent.id}/properties/${escapePointer(prop)}`;
    if (!classifiers.has(id)) {
      classifiers.set(id, {
        id,
        name: `${parent.name}.${prop}`,
        file: parent.file,
        group: parent.group,
        kind: "enumeration",
        synthetic: true,
        comment: schema.description,
        attributes: [],
        members: [],
        literals: literalsOf(schema),
        constraints: [],
        schema,
      });
    }
    return id;
  };

  const toAttribute = (owner: Classifier, name: string, s: JsonSchema, required: boolean): Attribute => {
    const file = owner.file;
    const array = isArraySchema(s);
    const item: JsonSchema = array ? itemOf(s) ?? {} : s;
    if (isInlineObject(item)) {
      const id = syntheticFor(owner, name, item);
      return {
        name,
        type: classifiers.get(id)!.name,
        multiplicity: multiplicity(s, required),
        required,
        constraints: constraintsOf(s, {}),
        target: id,
        refs: [id],
        relation: "composition",
      };
    }
    if (isInlineEnum(item)) {
      // the type keeps its short label ("bar" | "m", enum(4)); a click opens the enumeration
      return {
        name,
        type: typeLabel(s, file),
        multiplicity: multiplicity(s, required),
        required,
        constraints: constraintsOf(s, item),
        target: syntheticEnum(owner, name, item),
        refs: [],
        relation: array ? "aggregation" : "association",
      };
    }
    const refs = drawableRefs(s, file);
    // the type is clickable when it names one definition: a class, or else an enumeration, codelist, data type
    const used = refs.length ? refs : definitionRefs(s, file);
    const isConst = item && typeof item === "object" && "const" in item;
    return {
      name,
      type: isConst ? "" : typeLabel(s, file),
      value: isConst ? JSON.stringify(item.const) : undefined,
      multiplicity: multiplicity(s, required),
      required,
      constraints: constraintsOf(s, item ?? {}),
      target: used.length === 1 ? used[0] : undefined,
      refs,
      relation: array ? "aggregation" : "association",
    };
  };

  /** Attributes: the properties (of the class, of its inline allOf parts or of its alternatives), then "[key]" for a map */
  const addAttributes = (c: Classifier, propertySets: JsonSchema[], required: Set<string>, choice: boolean) => {
    propertySets.forEach((props) =>
      Object.entries<JsonSchema>(props).forEach(([propName, ps]) => {
        if (!c.attributes.some((a) => a.name === propName)) c.attributes.push(toAttribute(c, propName, ps, !choice && required.has(propName)));
      })
    );
    const extra = c.schema.additionalProperties;
    if (extra && typeof extra === "object") c.attributes.push({ ...toAttribute(c, "[key]", extra, false), multiplicity: "0..*" });
  };

  /** Generalization to the allOf $refs (inherited attributes stay in the parent class), links of the attributes */
  const addClassRelations = (c: Classifier, allOf: JsonSchema[]) => {
    allOf.filter(isRef).forEach((a) => {
      const parent = follow(resolve(a.$ref, c.file).id);
      if (parent && isDrawable(classifiers.get(parent))) relations.push({ kind: "generalization", source: c.id, target: parent });
    });
    c.attributes.forEach((a) =>
      a.refs.forEach((target) => relations.push({ kind: a.relation, source: c.id, target, role: a.name, multiplicity: a.multiplicity ?? "1" }))
    );
  };

  /** «use» dependencies: codelists, enumerations and data types used by the properties, and enums written in a property */
  const addUsages = (c: Classifier, propertySets: JsonSchema[]) => {
    Object.entries<JsonSchema>(Object.assign({}, ...propertySets)).forEach(([propName, ps]) => {
      if (isInlineObject(isArraySchema(ps) ? ps.items ?? {} : ps)) return; // its $refs belong to the synthetic class
      const used = new Set(collectRefs(ps).map((r) => follow(resolve(r, c.file).id)));
      used.forEach((target) => {
        if (target && !isDrawable(classifiers.get(target))) usages.push({ kind: "dependency", source: c.id, target, role: propName });
      });
    });
    c.attributes.forEach((a) => {
      const t = a.target ? classifiers.get(a.target) : undefined;
      if (t?.synthetic && t.kind === "enumeration") usages.push({ kind: "dependency", source: c.id, target: t.id, role: a.name });
    });
  };

  const buildClass = (c: Classifier) => {
    const s = c.schema;
    const alts = alternativesOf(s);
    const allOf: JsonSchema[] = Array.isArray(s.allOf) ? s.allOf : [];
    const inlineParts = allOf.filter((a) => !isRef(a));
    const required = new Set<string>([...(s.required ?? []), ...inlineParts.flatMap((a) => a.required ?? [])]);
    const propertySets: JsonSchema[] = alts
      ? alts.map((a) => a.properties ?? {})
      : [s.properties ?? {}, ...inlineParts.map((a) => a.properties ?? {})];
    if (alts) c.constraints.push(s.oneOf ? "oneOf" : "anyOf");
    addAttributes(c, propertySets, required, !!alts);
    c.constraints.push(...objectConstraints(s));
    addClassRelations(c, allOf);
    addUsages(c, propertySets);
  };

  /** Abstract class: its members (inline objects become synthetic subclasses), each one generalized to it */
  const buildAbstract = (c: Classifier) => {
    const key = c.schema.oneOf ? "oneOf" : "anyOf";
    const members = alternativesOf(c.schema)!.map((a, i) =>
      isRef(a) ? follow(resolve(a.$ref, c.file).id) : syntheticAlternative(c, key, i, a)
    );
    c.members = Array.from(new Set(members.filter((id): id is DefId => !!id)));
    c.members.forEach((m) => relations.push({ kind: "generalization", source: m, target: c.id }));
  };

  /** Data type: its type (and multiplicity for an array), then its constraints */
  const buildDatatype = (c: Classifier) => {
    const s = c.schema;
    const many = isArraySchema(s) ? multiplicity(s, true) : undefined;
    c.constraints.push(typeLabel(s, c.file) + (many ? ` [${many}]` : ""), ...constraintsOf(s, s).filter((x) => !x.startsWith("unique")));
  };

  classifiers.forEach((c) => {
    switch (c.kind) {
      case "class":
        buildClass(c);
        break;
      case "abstract":
        buildAbstract(c);
        break;
      case "codelist":
        c.constraints.push("string");
        break;
      case "datatype":
        buildDatatype(c);
        break;
      default: // enumeration: its values are already known; alias: short-circuited
        break;
    }
  });

  return { classifiers, relations, usages, diagnostics, documents, root: bundle.root, defaultDefinition: defaultDefinition() };

  function defaultDefinition(): DefId | undefined {
    const root = files[bundle.root];
    if (!root) return undefined;
    if (typeof root.$ref === "string") {
      const target = follow(resolveRef(root.$ref, bundle.root, files, quiet).id);
      if (target && classifiers.has(target)) return target;
    }
    const rootId = `${bundle.root}#`;
    if (isDrawable(classifiers.get(rootId))) return rootId;
    const all = Array.from(classifiers.values());
    return (all.find((c) => c.file === bundle.root && isDrawable(c)) ?? all.find((c) => isDrawable(c)) ?? all[0])?.id;
  }
}

/** Class or abstract class that "refers" in a relation (left → right in the diagram) */
export const referrerOf = (r: Relation) => (isInheritance(r.kind) ? r.target : r.source);
export const referencedOf = (r: Relation) => (isInheritance(r.kind) ? r.source : r.target);

/**
 * Definition designated by `ref`, a $ref written in the root document
 * ("#/definitions/EarthObservation", "mdj.json#/definitions/LI_Lineage") or a full id. Aliases are followed.
 */
export function findDefinition(model: SchemaModel, ref: string): DefId | undefined {
  let id: DefId | undefined;
  try {
    const hash = ref.indexOf("#");
    const url = new URL(hash < 0 ? ref : ref.slice(0, hash), model.root).href;
    id = `${url}#${hash < 0 ? "" : decodeURIComponent(ref.slice(hash + 1))}`;
  } catch {
    return undefined;
  }
  const c = model.classifiers.get(id);
  return c ? (c.aliasOf ?? c.id) : undefined;
}
