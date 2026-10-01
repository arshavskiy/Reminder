import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Some suites import the whole extraction pipeline, which takes longer than
    // the 5s default on a cold cache and made documentFields.test.ts time out.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
