import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    // The first test in a file compiles every Convex module; give cold starts room.
    testTimeout: 30_000,
    server: { deps: { inline: ["convex-test"] } },
  },
});
