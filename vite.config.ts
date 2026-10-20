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
  },
});
