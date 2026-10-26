# JSON Schema Viewer

React component that shows the definitions of a JSON Schema as interactive UML class diagrams, and a demo page that
loads any JSON Schema from a URL (by default
[eof-eos-schema-soft.json](https://eovoc.github.io/eof-eos-validator/schemas/eof-eos-schema-soft.json)).

- **Table of contents** of every definition, grouped by file (each file can be collapsed), with a search field.
- **One diagram at a time**: the selected definition and its neighbours. Click to navigate.
- **Referenced schemas are loaded too**: give the URL of the root schema, the files named in its `$ref` follow.

## Use the component in another project

### Install

The package is installed from GitHub (it is not published on the npm registry):

```bash
npm install github:eovoc/schema-viewer
```

npm downloads the repository and builds the component (`dist/`) during the installation.
Requires React 18 or later in the project, and Node.js 20.19 or later.

### Display a schema

```tsx
import { SchemaViewer } from "@eovoc/schema-viewer";
import "@eovoc/schema-viewer/style.css";

export default function MyPage() {
  return (
    <div style={{ height: 700 }}>
      <SchemaViewer src="https://eovoc.github.io/eof-eos-validator/schemas/eof-eos-schema-soft.json" />
    </div>
  );
}
```

The viewer fills its container: give the container a height.
The servers hosting the schemas must allow cross-origin requests (CORS); GitHub Pages does.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `src` | `string` | required | URL of the root JSON Schema |
| `selected` | `string` | | Selected definition, as a `$ref` written in the root schema (`"#/definitions/EarthObservation"`, `"mdj.json#/definitions/LI_Lineage"`). When passed, the selection is controlled: update it in `onSelect`. `undefined` shows the default definition |
| `onSelect` | `(id, model) => void` | | A definition was chosen in the table of contents or in the diagram. `id` is its full id; `relativeRef(id, model.root)` gives the short form |
| `onLoad` | `(model) => void` | | The schema and the schemas it references are loaded |
| `onError` | `(error) => void` | | The root schema could not be loaded |
| `fetchSchema` | `(url, signal) => Promise<object>` | `fetch` | How to download a schema, e.g. to add an authentication header |
| `showToc` | `boolean` | `true` | Show the table of contents |
| `neighbourDetails` | `boolean` | `false` | Initial state of "Neighbour details" |
| `showConstraints` | `boolean` | `true` | Initial state of "Constraints": `{unique}`, `{closed}`, `{format=…}`… in the boxes |
| `showEnumerations` | `boolean` | `true` | Initial state of "Enumerations": enumerations used by a class, on its right |
| `className`, `style` | | | Applied to the root element |

Without `selected`, the viewer keeps the selection itself. The default definition is the target of the root `$ref`,
or the first class.

### Keep the selection in the URL

The component does not touch the address bar: each application manages its URLs its own way. To make links shareable
and the back button work, control the selection, as the demo page does (`demo/pages/SchemaViewerPage/SchemaViewerPage.tsx`):

```tsx
const [def, setDef] = useState(() => new URLSearchParams(location.search).get("def") ?? undefined);

<SchemaViewer
  src="https://eovoc.github.io/eof-eos-validator/schemas/eof-eos-schema-soft.json"
  selected={def}
  onSelect={(id, model) => {
    const ref = relativeRef(id, model.root); // "#/definitions/X" or "mdj.json#/definitions/Y"
    history.pushState(null, "", `?def=${encodeURIComponent(ref)}`);
    setDef(ref);
  }}
/>
```

### Change the colours

Every style is scoped under the `.schema-viewer` class, and colours are CSS variables. Override them in a
stylesheet loaded after `@eovoc/schema-viewer/style.css`:

```css
.schema-viewer {
  --uml-accent: #4f6ef7;        /* selection and highlight */
  --uml-header-class: #e3edf9;  /* header of a class */
  --uml-toc-width: 240px;       /* width of the table of contents */
}
```

To change only one viewer, give it a class (`<SchemaViewer className="…" />`) and use that class instead.
The other variables are in `src/styles/base.css`.

### Other exports

`loadSchemaBundle` (loads a schema and the schemas it references), `buildSchemaModel` (JSON Schema to UML model),
`findDefinition`, `relativeRef` and the types (`SchemaModel`, `Classifier`, `Attribute`, `Relation`…), for other
uses of the model such as an export or tests.

## Run the demo

```bash
npm install
npm run dev       # http://localhost:5173
```

Another schema can be given in the field at the top of the page, or in the address bar:
`http://localhost:5173/?schema=<URL of the schema>`. The selected definition is kept too:
`&def=#/definitions/EarthObservation` (root document) or `&def=mdj.json#/definitions/LI_Lineage` (another one).

| Command | |
|---|---|
| `npm run dev` | demo page, reloaded on each change |
| `npm run build` | component (`dist/`) and demo site (`demo-dist/`, static files with relative paths, ready for GitHub Pages) |
| `npm run build:lib` | component only (run automatically by `npm install`) |
| `npm run preview` | serves `demo-dist/` |

## The diagram

One definition at a time: the selected definition in the centre with all its attributes, what it references on the
right (each edge starts from the attribute row), what references it on the left (including its parent class).
Each edge shows the name of the attribute and its multiplicity, next to the class at the other end.

- Click a class or an underlined type (class, enumeration, codelist, data type) to open its diagram; hover an attribute to highlight its link.
- **Constraints** shows or hides the constraints in braces (`{unique}`, `{closed}`, `{format=…}`…);
  **Neighbour details** also shows the attributes of the neighbouring classes (the values of the enumerations, the subclasses of the abstract classes);
  **Enumerations** shows, on the right of a class, the enumerations it uses («use» dependency); **JSON** shows the schema of the
  definition; **⚠** lists the warnings (documents not loaded, malformed or unresolved `$ref`).
- More than 30 neighbours on one side are grouped in a "+N more" box.
- Large enumerations and abstract classes show their first 14 values or subclasses; "… +N (show all)" opens the full list, scrollable inside the box.

Layout by [ELK](https://github.com/kieler/elkjs) (loaded on first use), rendering by [React Flow](https://reactflow.dev).

## Referenced schemas

The documents named in `$ref` are loaded too, recursively, each one once:

| `$ref` | Document loaded |
|---|---|
| `#/definitions/X` | none (same document) |
| `mdj.json#/definitions/X` | `mdj.json` next to the document containing the `$ref` |
| `https://host/x.json#/definitions/X` | `https://host/x.json` |
| `http://json-schema.org/draft-07/schema#` | none (JSON Schema meta-schema) |

Only the root schema must load: a referenced document that cannot be loaded is reported and the rest is shown.

## JSON Schema → UML rules

Written for draft-07 schemas (`definitions`); `$defs` and `$anchor` are read too.

| JSON Schema | UML |
|---|---|
| `type: object` + `properties` | class |
| property | attribute `name: Type [multiplicity] {constraints}` (multiplicity omitted when exactly 1) |
| `required`, `type: array`, `minItems` / `maxItems` | multiplicity `0..1`, `1..*`, … |
| `$ref` property to a class | association |
| array of `$ref` property | aggregation (a convention: JSON Schema does not distinguish it from an association) |
| nested object property | composition to a class named `Parent.property` |
| `oneOf` / `anyOf` of `$ref` to classes (with or without `type: object`) | abstract class + generalization of each alternative |
| `oneOf` / `anyOf` mixing `$ref` and inline objects | abstract class; each inline object is a subclass named `Parent.anyOf[i]` |
| `oneOf` / `anyOf` of inline objects only | class with the merged attributes and a `{oneOf}` constraint |
| `allOf` with `$ref` | generalization to the parent class; the inline parts of `allOf` are merged into the class |
| use of a codelist, enumeration or data type | «use» dependency (enumerations: also drawn in the class diagram, see "Enumerations") |
| plain `$ref` (alias) | short-circuited: links point to the target |
| `type: string` without constraints | «codelist» |
| `enum` | «enumeration» |
| `enum` written in a property (no `$ref`, any number of values) | «enumeration» named `Parent.property`, used by the class («use»); the attribute keeps its short type (`"bar" \| "m"`, `enum(4)`) |
| other simple types | «datatype» |
| `const` | `name = "value"` |
| `uniqueItems`, `format`, `pattern`, bounds | `{unique}`, `{format=…}`, `{pattern=…}`, `{>=…}` |
| `additionalProperties: false` | `{closed}`: no other property allowed |
| object grouping definitions without being a schema (`definitions/thesaurus/*`) | its children are definitions, grouped under its name |
| root schema that is an object | class named after the file |
| `$ref` to the draft-07 meta-schema | type `JSONSchema` |
| malformed `$ref` (`#Name`, `x.json#definitions/Name`) | read as `#/definitions/Name` when it exists, reported as a warning |

## Project layout

```
src/                      the component
  index.ts                what the package exports
  SchemaViewer.tsx        <SchemaViewer>: loading, selection, table of contents + diagram
  styles.css              styles, scoped under .schema-viewer
  lib.ts                  entry of the library build (exports + stylesheet)
  core/                   reads and interprets the schemas (plain TypeScript, no React)
    loader.ts             loads a schema and the schemas it references, resolves $ref
    schemaModel.ts        JSON Schema -> UML model (classes, attributes, relations)
    focusGraph.ts         diagram of one definition: boxes, edges, ELK layout
    types.ts              shared types
  ui/                     React components that display the result
    Toc.tsx               table of contents
    Diagram.tsx           the diagram: top bar, React Flow canvas, hover highlight, legend
    UmlNode.tsx           a UML class box
    UmlEdge.tsx           a UML edge and its markers (arrow, triangle, diamonds)
demo/                     demo page (uses the component like another application would)
  index.html              HTML entry point
  main.tsx                starts React
  SchemaViewerPage.tsx    navigation bar, schema URL field, <SchemaViewer>, URL of the page
  demo.css                styles of the page
package.json              dependencies, npm scripts, what the package exports
vite.config.ts            Vite configuration of the demo
vite.lib.config.ts        Vite configuration of the component build (dist/)
tsconfig.json             TypeScript configuration
tsconfig.lib.json         generation of the type declarations (dist/*.d.ts)
LICENSE                   Apache 2.0 licence
NOTICE                    copyright notice (Apache 2.0)
```

## Licence

Copyright 2026 Spacebel. Licensed under the [Apache License 2.0](LICENSE); see also [NOTICE](NOTICE).

The component does not bundle the code of its dependencies: they are installed with it, each under its own licence
(React and React Flow: MIT; elkjs: EPL-2.0, source code at https://github.com/kieler/elkjs).
The only exception is the stylesheet of React Flow, included in `dist/style.css` with its MIT licence notice.
The demo site bundles them: the build writes their licences, and where to get the source code of elkjs,
to `third-party-licenses.md`, published with the site.
