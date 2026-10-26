// Table of contents: definitions grouped by document (and container, e.g. "thesaurus"), search field,
// current definition highlighted. Documents and containers can be collapsed.
import { useEffect, useMemo, useRef, useState } from "react";
import { fileName } from "../../utils/refs";
import type { Classifier, DefId, SchemaModel } from "../../core/types";

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

/** Key of a collapsible part: the document, or the document + container */
const partKey = (file: string, group?: string) => (group ? `${file}|${group}` : file);

export default function Toc({ model, focus, onSelect }: Readonly<Props>) {
  const [query, setQuery] = useState("");
  const activeRef = useRef<HTMLButtonElement>(null);
  const searching = query.trim() !== "";

  // Open parts. At first only the one holding the selected definition; a part is opened automatically when the
  // selection moves into it (click in the diagram), and stays as the user left it otherwise.
  const focused = focus ? model.classifiers.get(focus) : undefined;
  const focusParts = focused ? [partKey(focused.file), ...(focused.group ? [partKey(focused.file, focused.group)] : [])] : [model.root];
  const [open, setOpen] = useState(() => new Set(focusParts));
  const [openedFor, setOpenedFor] = useState(focus);
  if (focus !== openedFor) {
    // adjusting state while rendering, when the selection changes (React's recommended pattern, no effect needed)
    setOpenedFor(focus);
    if (focusParts.some((p) => !open.has(p))) setOpen(new Set([...open, ...focusParts]));
  }
  const toggle = (key: string) => {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpen(next);
  };
  // while searching, every part with a match is shown open
  const isOpen = (key: string) => searching || open.has(key);

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    const all = Array.from(model.classifiers.values()).filter((c) => !c.synthetic);
    return model.documents.map((file) => {
      const inFile = all.filter((c) => c.file === file);
      const matching = inFile.filter((c) => c.name.toLowerCase().includes(q) || (c.group ?? "").toLowerCase().includes(q));
      const groups = new Map<string | undefined, Classifier[]>();
      matching.sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.name.localeCompare(b.name));
      matching.forEach((c) => groups.set(c.group, [...(groups.get(c.group) ?? []), c]));
      return { file, total: q ? matching.length : inFile.length, groups: Array.from(groups, ([group, items]) => ({ group, items })) };
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

  /** Clickable heading of a document or a container */
  const heading = (key: string, label: string, count: number, title?: string) => (
    <button type="button" className="uml-toc__toggle" aria-expanded={isOpen(key)} onClick={() => toggle(key)} disabled={searching} title={title}>
      <span className="uml-toc__chevron" aria-hidden="true" />
      {label} <span className="uml-toc__count">{count}</span>
    </button>
  );

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
        {sections
          .filter((s) => !searching || s.total > 0)
          .map((s) => (
            <section key={s.file}>
              <h2 className="uml-toc__file">{heading(partKey(s.file), fileName(s.file), s.total, s.file)}</h2>
              {isOpen(partKey(s.file)) &&
                s.groups.map((g) => (
                  <div key={g.group ?? ""}>
                    {g.group && <h3 className="uml-toc__group">{heading(partKey(s.file, g.group), g.group, g.items.length)}</h3>}
                    {(!g.group || isOpen(partKey(s.file, g.group))) && <ul>{g.items.map(entry)}</ul>}
                  </div>
                ))}
            </section>
          ))}
        {searching && sections.every((s) => s.total === 0) && <p className="uml-toc__empty">No definition matches “{query.trim()}”.</p>}
      </nav>
    </aside>
  );
}
