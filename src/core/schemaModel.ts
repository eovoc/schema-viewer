// JSON Schema (draft-07, one or more documents) -> UML model: classes, attributes, relations.
// The rules are listed in the README ("JSON Schema -> UML rules").
import { collectRefs, escapePointer, fileName, getPointer, pointerName, resolveRef } from "./loader";
import type { Attribute, Classifier, ClassifierKind, DefId, JsonSchema, Relation, SchemaBundle, SchemaModel } from "./types";
import { isDrawable, isInheritance } from "./types";

const ANNOTATIONS = new Set(["$comment", "description", "title", "$id", "examples", "default"]);

const isArraySchema = (s: JsonSchema) => !!s && (s.type === "array" || (s.items !== undefined && s.type === undefined));
const alternativesOf = (s: JsonSchema): JsonSchema[] | undefined => s.oneOf ?? s.anyOf;

type RawKind = ClassifierKind | "union";

const isObjectSchema = (s: JsonSchema) => !!s && typeof s === "object" && typeof s.$ref !== "string" && (!!s.properties || s.type === "object");
const isInlineObject = (s: JsonSchema) => !!s && typeof s === "object" && typeof s.$ref !== "string" && !!s.properties;

function rawKind(s: JsonSchema): RawKind {
  if (s.enum) return "enumeration";
  if (Array.isArray(s.allOf)) return "class"; // inheritance through allOf + merged attributes
  const alts = alternativesOf(s);
  // { type: "object", oneOf: [$ref…] } (e.g. GeoJSON Geometry) is a union, not an empty class
  if (alts && !s.properties && alts.every((a) => typeof a?.$ref === "string")) return "union";
  if (s.properties || s.type === "object" || (s.additionalProperties && typeof s.additionalProperties === "object")) return "class";
  if (alts) {
    if (alts.every((a) => typeof a?.$ref === "string")) return "union";
    // mix of $refs and inline objects: abstract class, inline objects become synthetic subclasses
    if (alts.some((a) => typeof a?.$ref === "string") && alts.every((a) => typeof a?.$ref === "string" || isObjectSchema(a))) return "union";
    if (alts.every((a) => a && (a.properties || a.type === "object"))) return "class"; // choice between inline objects
    return "datatype";
  }
  if (typeof s.$ref === "string" && Object.keys(s).every((k) => k === "$ref" || ANNOTATIONS.has(k))) return "alias";
  if (s.type === "string" && Object.keys(s).every((k) => k === "type" || ANNOTATIONS.has(k))) return "codelist";
  return "datatype";
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
      literals: (schema.enum ?? []).map((v: unknown) => (typeof v === "string" ? v : JSON.stringify(v))),
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

  const typeLabel = (s: JsonSchema, file: string): string => {
    if (!s || typeof s !== "object" || Object.keys(s).length === 0) return "any";
    if (typeof s.$ref === "string") {
      const r = resolve(s.$ref, file);
      const target = follow(r.id);
      return target ? classifiers.get(target)!.name : r.label;
    }
    if ("const" in s) return JSON.stringify(s.const);
    if (s.enum) return s.enum.length <= 3 ? s.enum.map((v: unknown) => JSON.stringify(v)).join(" | ") : `enum(${s.enum.length})`;
    if (isArraySchema(s)) return s.items ? typeLabel(Array.isArray(s.items) ? s.items[0] : s.items, file) : "any";
    const alts = alternativesOf(s);
    if (alts) return alts.map((a) => typeLabel(a, file)).join(" | ");
    if (s.allOf) return s.allOf.map((a: JsonSchema) => typeLabel(a, file)).join(" & ");
    if (s.type === "object" && s.additionalProperties && typeof s.additionalProperties === "object" && !s.properties) {
      return `Map<string, ${typeLabel(s.additionalProperties, file)}>`;
    }
    if (s.type === "object" && s.properties) return "object {…}";
    if (Array.isArray(s.type)) return s.type.join(" | ");
    return s.type ?? "any";
  };

  const drawableRefs = (s: JsonSchema, file: string): DefId[] => {
    const ids = collectRefs(s)
      .map((r) => follow(resolve(r, file).id))
      .filter((id): id is DefId => !!id && isDrawable(classifiers.get(id)));
    return Array.from(new Set(ids));
  };

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

  const toAttribute = (owner: Classifier, name: string, s: JsonSchema, required: boolean): Attribute => {
    const file = owner.file;
    const array = isArraySchema(s);
    const item: JsonSchema = array ? (Array.isArray(s.items) ? s.items[0] : s.items) ?? {} : s;
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
    const refs = drawableRefs(s, file);
    const isConst = item && typeof item === "object" && "const" in item;
    return {
      name,
      type: isConst ? "" : typeLabel(s, file),
      value: isConst ? JSON.stringify(item.const) : undefined,
      multiplicity: multiplicity(s, required),
      required,
      constraints: constraintsOf(s, item ?? {}),
      target: refs.length === 1 ? refs[0] : undefined,
      refs,
      relation: array ? "aggregation" : "association",
    };
  };

  classifiers.forEach((c) => {
    const s = c.schema;
    switch (c.kind) {
      case "class": {
        const alts = alternativesOf(s);
        const allOf: JsonSchema[] = Array.isArray(s.allOf) ? s.allOf : [];
        const inlineParts = allOf.filter((a) => typeof a?.$ref !== "string");
        const required = new Set<string>([...(s.required ?? []), ...inlineParts.flatMap((a) => a.required ?? [])]);
        const propertySets: JsonSchema[] = alts
          ? alts.map((a) => a.properties ?? {})
          : [s.properties ?? {}, ...inlineParts.map((a) => a.properties ?? {})];
        if (alts) c.constraints.push(s.oneOf ? "oneOf" : "anyOf");
        propertySets.forEach((props) =>
          Object.entries<JsonSchema>(props).forEach(([propName, ps]) => {
            if (!c.attributes.some((a) => a.name === propName)) c.attributes.push(toAttribute(c, propName, ps, !alts && required.has(propName)));
          })
        );
        if (s.additionalProperties && typeof s.additionalProperties === "object") {
          c.attributes.push({ ...toAttribute(c, "[key]", s.additionalProperties, false), multiplicity: "0..*" });
        }
        if (s.minProperties !== undefined) c.constraints.push(`minProperties=${s.minProperties}`);
        if (s.maxProperties !== undefined) c.constraints.push(`maxProperties=${s.maxProperties}`);
        if (s.additionalProperties === false) c.constraints.push("closed");
        // allOf + $ref: superclass (inherited attributes stay in the parent class)
        allOf
          .filter((a) => typeof a?.$ref === "string")
          .forEach((a) => {
            const parent = follow(resolve(a.$ref, c.file).id);
            if (parent && isDrawable(classifiers.get(parent))) relations.push({ kind: "generalization", source: c.id, target: parent });
          });
        c.attributes.forEach((a) =>
          a.refs.forEach((target) => relations.push({ kind: a.relation, source: c.id, target, role: a.name, multiplicity: a.multiplicity ?? "1" }))
        );
        Object.entries<JsonSchema>(Object.assign({}, ...propertySets)).forEach(([propName, ps]) => {
          if (isInlineObject(isArraySchema(ps) ? ps.items ?? {} : ps)) return; // its $refs belong to the synthetic class
          const used = new Set(collectRefs(ps).map((r) => follow(resolve(r, c.file).id)));
          used.forEach((target) => {
            if (target && !isDrawable(classifiers.get(target))) usages.push({ kind: "dependency", source: c.id, target, role: propName });
          });
        });
        break;
      }
      case "abstract": {
        const key = s.oneOf ? "oneOf" : "anyOf";
        const members = alternativesOf(s)!.map((a, i) =>
          typeof a?.$ref === "string" ? follow(resolve(a.$ref, c.file).id) : syntheticAlternative(c, key, i, a)
        );
        c.members = Array.from(new Set(members.filter((id): id is DefId => !!id)));
        c.members.forEach((m) => relations.push({ kind: "generalization", source: m, target: c.id }));
        break;
      }
      case "enumeration":
        break;
      case "codelist":
        c.constraints.push("string");
        break;
      case "datatype": {
        c.constraints.push(typeLabel(s, c.file) + (isArraySchema(s) && multiplicity(s, true) ? ` [${multiplicity(s, true)}]` : ""));
        c.constraints.push(...constraintsOf(s, s).filter((x) => !x.startsWith("unique")));
        break;
      }
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
