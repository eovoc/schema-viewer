# JSON Schema Viewer

Shows the definitions of a JSON Schema as interactive UML class diagrams.

The goal is a reusable React component (`@eovoc/schema-viewer`) and a demo page that loads any JSON Schema from a URL
(by default
[eof-eos-schema-soft.json](https://eovoc.github.io/eof-eos-validator/schemas/eof-eos-schema-soft.json)).

> Work in progress: the diagram works in the demo page; packaging as a reusable component comes next.

## Run the demo

Requires Node.js 20.19 or later.

```bash
npm install
npm run dev       # http://localhost:5173
```

Another schema can be given in the field at the top of the page, or in the address bar:
`http://localhost:5173/?schema=<URL of the schema>`. The selected definition is kept too:
`&def=#/definitions/EarthObservation` (root document) or `&def=mdj.json#/definitions/LI_Lineage` (another one).
The servers hosting the schemas must allow cross-origin requests (CORS); GitHub Pages does.

## The diagram

One definition at a time: the selected definition in the centre with all its attributes, what it references on the
right (each edge starts from the attribute row), what references it on the left (including its parent class).

- Click a class or an underlined type to open its diagram; hover an attribute to highlight its link.
- **Neighbour details** also shows the attributes of the neighbouring classes; **JSON** shows the schema of the
  definition; **⚠** lists the warnings (documents not loaded, malformed or unresolved `$ref`).
- More than 30 neighbours on one side are grouped in a "+N more" box.

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
| use of a codelist, enumeration or data type | «use» dependency |
| plain `$ref` (alias) | short-circuited: links point to the target |
| `type: string` without constraints | «codelist» |
| `enum` | «enumeration» |
| other simple types | «datatype» |
| `const` | `name = "value"` |
| `uniqueItems`, `format`, `pattern`, bounds | `{unique}`, `{format=…}`, `{pattern=…}`, `{>=…}` |
| object grouping definitions without being a schema (`definitions/thesaurus/*`) | its children are definitions, grouped under its name |
| root schema that is an object | class named after the file |
| `$ref` to the draft-07 meta-schema | type `JSONSchema` |
| malformed `$ref` (`#Name`, `x.json#definitions/Name`) | read as `#/definitions/Name` when it exists, reported as a warning |

## Project layout

```
src/                      the component (work in progress)
  core/                   the logic, no React
    loader.ts             loads a schema and the documents it references, resolves $ref
    schemaModel.ts        JSON Schema -> UML model (classes, attributes, relations)
    focusGraph.ts         diagram of one definition: boxes, edges, ELK layout
    types.ts              shared types
  ui/
    Toc.tsx               table of contents
    Diagram.tsx           the diagram: top bar, React Flow canvas, hover highlight, legend
    UmlNode.tsx           a UML class box
    UmlEdge.tsx           a UML edge and its markers (arrow, triangle, diamonds)
  styles.css              styles of the component
demo/                     demo page
  index.html              HTML entry point
  main.tsx                starts React
  SchemaViewerPage.tsx    the page: navigation bar, schema URL field, table of contents, diagram
  demo.css                styles of the page
LICENSE                   MIT licence
package.json              dependencies and npm scripts (dev, build, preview)
vite.config.ts            Vite configuration of the demo
tsconfig.json             TypeScript configuration
```

## Licence

[MIT](LICENSE)
