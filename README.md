# JSON Schema Viewer

Shows the definitions of a JSON Schema as interactive UML class diagrams.

The goal is a reusable React component (`@eovoc/schema-viewer`) and a demo page that loads any JSON Schema from a URL
(by default
[eof-eos-schema-soft.json](https://eovoc.github.io/eof-eos-validator/schemas/eof-eos-schema-soft.json)).

> Work in progress: for now the demo page loads a schema and every schema it references, and lists them.

## Run the demo

Requires Node.js 20.19 or later.

```bash
npm install
npm run dev       # http://localhost:5173
```

Another schema can be given in the field at the top of the page, or in the address bar:
`http://localhost:5173/?schema=<URL of the schema>`.
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

## Project layout

```
src/core/                 the logic (no React)
  loader.ts               loads a schema and the documents it references
  types.ts                shared types
demo/                     demo page
  index.html              HTML entry point
  main.tsx                starts React
  SchemaViewerPage.tsx    the page: navigation bar, schema URL field, loaded documents
  demo.css                styles of the page
LICENSE                   MIT licence
package.json              dependencies and npm scripts (dev, build, preview)
vite.config.ts            Vite configuration of the demo
tsconfig.json             TypeScript configuration
```

## Licence

[MIT](LICENSE)
