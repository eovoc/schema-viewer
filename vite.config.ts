// Demo site: `npm run dev` (development), `npm run build` -> demo-dist/ (static files, ready for GitHub Pages).
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const src = (file: string) => fileURLToPath(new URL(`./src/${file}`, import.meta.url));

const LICENSES_FILE = "third-party-licenses.md";

// The EPL-2.0 (elkjs) requires the distributed program to say where its source code is available.
const elkjsSourceNotice = (): Plugin => ({
  name: "elkjs-source-notice",
  apply: "build",
  enforce: "post",
  writeBundle(options) {
    const elkjsPackage = new URL("./node_modules/elkjs/package.json", import.meta.url);
    const { version } = JSON.parse(readFileSync(elkjsPackage, "utf8")) as { version: string };
    appendFileSync(
      join(options.dir ?? "", LICENSES_FILE),
      "\n---\n\n## Source code of elkjs\n\n" +
        "elkjs is distributed in this site under the Eclipse Public License 2.0. " +
        "Its source code is available under this licence at https://github.com/kieler/elkjs " +
        `(version ${version}), and the source code of Eclipse ELK at https://github.com/eclipse-elk/elk.\n`,
    );
  },
});

export default defineConfig({
  root: "demo",
  // relative paths: the site works under https://<org>.github.io/<repo>/ as well as locally
  base: "./",
  plugins: [react(), elkjsSourceNotice()],
  resolve: {
    // the demo imports the package by its name, like another application would, but from the sources
    alias: [
      { find: "@eovoc/schema-viewer/style.css", replacement: src("styles.css") },
      { find: /^@eovoc\/schema-viewer$/, replacement: src("index.ts") },
    ],
  },
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
    // licences of the bundled dependencies (React, React Flow, elkjs…), published with the demo
    license: { fileName: LICENSES_FILE },
    // the ELK layout engine alone is ~1.5 MB; it is loaded on first use, in its own file
    chunkSizeWarningLimit: 1600,
  },
});
