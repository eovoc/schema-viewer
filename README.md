# JSON Schema Viewer

Shows the definitions of a JSON Schema as interactive UML class diagrams.

The goal is a reusable React component (`@eovoc/schema-viewer`) and a demo page that loads any JSON Schema from a URL
(by default
[eof-eos-schema-soft.json](https://eovoc.github.io/eof-eos-validator/schemas/eof-eos-schema-soft.json)).

> Work in progress: for now the demo page lists the definitions and shows the selected one as text (UML notation).
> The diagram comes next.

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
    types.ts              shared types
  ui/
    Toc.tsx               table of contents
  styles.css              styles of the component
demo/                     demo page
  index.html              HTML entry point
  main.tsx                starts React
  SchemaViewerPage.tsx    the page: navigation bar, schema URL field, table of contents, definition
  DefinitionPanel.tsx     the selected definition as text (temporary, replaced by the diagram)
  demo.css                styles of the page
LICENSE                   MIT licence
package.json              dependencies and npm scripts (dev, build, preview)
vite.config.ts            Vite configuration of the demo
tsconfig.json             TypeScript configuration
```

## Licence

[MIT](LICENSE)
