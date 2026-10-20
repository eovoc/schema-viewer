// Library build: `npm run build:lib` -> dist/ (schema-viewer.js, style.css; types by tsconfig.lib.json).
// Run automatically when the package is installed from GitHub (`prepare` script).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    // readable output: the application using the package minifies it in its own build
    minify: false,
    lib: {
      entry: "src/lib.ts",
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
