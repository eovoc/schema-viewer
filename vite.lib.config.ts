// Library build: `npm run build:lib` -> lib-dist/ (schema-viewer.js, style.css; types by tsconfig.lib.json).
// Run automatically when the package is installed from GitHub (`prepare` script).
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("./src/lib/index.ts", import.meta.url));

// The stylesheet is added to the entry here rather than imported by src/lib/index.ts, so that the type declarations
// generated from it do not import a CSS file.
const bundleStyles = (): Plugin => ({
  name: "bundle-styles",
  transform(code, id) {
    if (id === entry) return { code: `import "./styles/index.css";\n${code}`, map: null };
  },
});

export default defineConfig({
  plugins: [react(), bundleStyles()],
  build: {
    outDir: "lib-dist",
    emptyOutDir: true,
    sourcemap: true,
    // readable output: the application using the package minifies it in its own build
    minify: false,
    lib: {
      entry,
      formats: ["es"],
      fileName: () => "schema-viewer.js",
      cssFileName: "style",
    },
    rollupOptions: {
      // provided by the application (peer dependencies) or installed with the package (dependencies)
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^@xyflow\/react($|\/)/, /^elkjs($|\/)/],
    },
  },
});
