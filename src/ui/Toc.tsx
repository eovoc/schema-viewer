// Table of contents: definitions grouped by document (and container), filter, current definition highlighted.
import { useEffect, useMemo, useRef, useState } from "react";
import { fileName } from "../core/loader";
import type { Classifier, DefId, SchemaModel } from "../core/types";

interface Props {
  model: SchemaModel;
  focus?: DefId;
  onSelect: (id: DefId) => void;
}

interface Section {
  file: string;
  total: number;
  groups: { group?: string; items: Classifier[] }[];
}

export default function Toc({ model, focus, onSelect }: Readonly<Props>) {
  const [query, setQuery] = useState("");
  const activeRef = useRef<HTMLButtonElement>(null);

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    const all = Array.from(model.classifiers.values()).filter((c) => !c.synthetic);
    return model.documents.map((file) => {
      const inFile = all.filter((c) => c.file === file);
      const matching = inFile.filter((c) => c.name.toLowerCase().includes(q) || (c.group ?? "").toLowerCase().includes(q));
      const groups = new Map<string | undefined, Classifier[]>();
      matching
        .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.name.localeCompare(b.name))
        .forEach((c) => groups.set(c.group, [...(groups.get(c.group) ?? []), c]));
      return { file, total: inFile.length, groups: Array.from(groups, ([group, items]) => ({ group, items })) };
    });
  }, [model, query]);

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [focus]);

  const entry = (c: Classifier) => {
    const target = c.kind === "alias" && c.aliasOf ? c.aliasOf : c.id;
    const active = c.id === focus;
    return (
      <li key={c.id}>
        <button
          type="button"
          ref={active ? activeRef : undefined}
          onClick={() => onSelect(target)}
          aria-current={active ? "true" : undefined}
          className={`uml-toc__link${active ? " uml-toc__link--active" : ""}${c.kind === "alias" ? " uml-toc__link--alias" : ""}`}
          title={c.kind === "alias" ? `Alias of ${model.classifiers.get(target)?.name}` : c.comment}
        >
          <span className={`uml-kind-dot uml-kind-dot--${c.kind}`} aria-hidden="true" />
          <span className="uml-toc__name">{c.name}</span>
          {c.kind === "alias" && <span className="uml-toc__alias"> → {model.classifiers.get(target)?.name}</span>}
        </button>
      </li>
    );
  };

  return (
    <aside className="uml-toc" aria-label="Definitions">
      <input
        className="uml-toc__filter"
        type="search"
        placeholder="Search definitions…"
        aria-label="Search definitions"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <nav className="uml-toc__list">
        {sections.map((s) => (
          <section key={s.file}>
            <h2 className="uml-toc__file" title={s.file}>
              {fileName(s.file)} <span className="uml-toc__count">{s.total}</span>
            </h2>
            {s.groups.map((g) => (
              <div key={g.group ?? ""}>
                {g.group && <h3 className="uml-toc__group">{g.group}</h3>}
                <ul>{g.items.map(entry)}</ul>
              </div>
            ))}
          </section>
        ))}
      </nav>
    </aside>
  );
}
