// TEMPORARY (step 3): the selected definition as text, to check how the schema is read.
// Replaced by the UML diagram in step 4.
import { fileName } from "../src/core/loader";
import { referencedOf, referrerOf } from "../src/core/schemaModel";
import type { Attribute, DefId, SchemaModel } from "../src/core/types";
import { isDrawable, isInheritance } from "../src/core/types";

const KIND_LABEL: Record<string, string> = {
  class: "class",
  abstract: "abstract class",
  enumeration: "enumeration",
  codelist: "codelist",
  datatype: "data type",
  alias: "alias",
};

interface Props {
  model: SchemaModel;
  id: DefId;
  onSelect: (id: DefId) => void;
}

export default function DefinitionPanel({ model, id, onSelect }: Props) {
  const c = model.classifiers.get(id)!;
  const name = (target: DefId) => model.classifiers.get(target)?.name ?? target;
  const link = (target: DefId, text = name(target)) => (
    <button type="button" className="type-link" onClick={() => onSelect(target)}>
      {text}
    </button>
  );

  // parents (inheritance) and the classes that use this definition
  const parents = model.relations.filter((r) => isInheritance(r.kind) && r.source === id).map((r) => r.target);
  const users = (isDrawable(c) ? model.relations : model.usages).filter(
    (r) => referencedOf(r) === id && !(isInheritance(r.kind) && r.target === id)
  );

  return (
    <article className="definition">
      <header>
        <span className={`uml-kind-dot uml-kind-dot--${c.kind}`} aria-hidden="true" />
        <h2 className={c.kind === "abstract" ? "italic" : undefined}>{c.name}</h2>
        <span className="badge">{KIND_LABEL[c.kind]}</span>
        <span className="badge badge--file" title={c.file}>
          {fileName(c.file)}
          {c.group ? ` › ${c.group}` : ""}
        </span>
      </header>
      {c.comment && <p className="comment">{c.comment}</p>}

      {parents.length > 0 && <p>Specializes: {parents.map((p) => <span key={p}>{link(p)} </span>)}</p>}

      {c.kind === "class" && (
        <ul className="attributes">
          {c.attributes.map((a) => (
            <li key={a.name}>
              <AttributeLine a={a} link={link} />
            </li>
          ))}
          {c.attributes.length === 0 && <li className="muted">no attributes</li>}
          {c.constraints.length > 0 && <li className="muted">{`{${c.constraints.join(", ")}}`}</li>}
        </ul>
      )}
      {c.kind === "abstract" && (
        <p>
          Subclasses: {c.members.map((m) => <span key={m}>{link(m)} </span>)}
        </p>
      )}
      {c.kind === "enumeration" && <p>Values: {c.literals.join(", ")}</p>}
      {(c.kind === "codelist" || c.kind === "datatype") && <p>Type: {c.constraints.join(" ")}</p>}
      {c.kind === "alias" && c.aliasOf && <p>Alias of {link(c.aliasOf)}</p>}

      <h3>Used by ({users.length})</h3>
      <ul className="users">
        {users.map((r, i) => (
          <li key={i}>
            {link(referrerOf(r))}
            {r.role && <span className="muted">.{r.role}</span>} <span className="muted">({r.kind})</span>
          </li>
        ))}
      </ul>

      <details>
        <summary>JSON</summary>
        <pre className="json">{JSON.stringify(c.schema, null, 2)}</pre>
      </details>
    </article>
  );
}

function AttributeLine({ a, link }: { a: Attribute; link: (id: DefId, text?: string) => React.ReactNode }) {
  return (
    <>
      <span className="attr-name">{a.name}</span>
      {a.value !== undefined ? (
        <> = {a.value}</>
      ) : (
        <>: {a.target ? link(a.target, a.type) : <span className="type">{a.type}</span>}</>
      )}
      {a.multiplicity && <span className="muted"> [{a.multiplicity}]</span>}
      {a.constraints.length > 0 && <span className="muted"> {`{${a.constraints.join(", ")}}`}</span>}
      <span className="relation"> {a.refs.length > 0 ? a.relation : ""}</span>
    </>
  );
}
