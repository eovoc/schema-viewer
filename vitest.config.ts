// Unit tests: `npm test` (once) or `npm run test:watch`. The tests are in tests/, outside the published package.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // the tested code (loader, UML model, diagram layout) needs no browser
    environment: "node",
  },
});
