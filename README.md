# JSON Schema Viewer

Shows the definitions of a JSON Schema as interactive UML class diagrams.

The goal is a reusable React component (`@eovoc/schema-viewer`) and a demo page that loads any JSON Schema from a URL
(by default
[eof-eos-schema-soft.json](https://eovoc.github.io/eof-eos-validator/schemas/eof-eos-schema-soft.json)).

> Work in progress: for now the demo page only loads a schema and shows its JSON.

## Run the demo

Requires Node.js 20.19 or later.

```bash
npm install
npm run dev       # http://localhost:5173
```

Another schema can be given in the address bar: `http://localhost:5173/?schema=<URL of the schema>`.
The server hosting the schema must allow cross-origin requests (CORS); GitHub Pages does.

## Project layout

```
demo/                     demo page
  index.html              HTML entry point
  main.tsx                starts React
  SchemaViewerPage.tsx    the page: navigation bar, schema URL field, content
  demo.css                styles of the page
LICENSE                   MIT licence
package.json              dependencies and npm scripts (dev, build, preview)
vite.config.ts            Vite configuration of the demo
tsconfig.json             TypeScript configuration
```

## Licence

[MIT](LICENSE)
