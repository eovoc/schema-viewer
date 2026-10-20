// Demo site: `npm run dev` (development), `npm run build` -> demo-dist/ (static files, ready for GitHub Pages).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "demo",
  // relative paths: the site works under https://<org>.github.io/<repo>/ as well as locally
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
    // the ELK layout engine alone is ~1.5 MB; it is loaded on first use, in its own file
    chunkSizeWarningLimit: 1600,
  },
});
