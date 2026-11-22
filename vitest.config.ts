import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Temporary policy configuration marker. tests/policy-marker.test.ts
    // expects this value to be present in the test process, and nothing
    // else in the repo provides it, so `pnpm test` failed on a clean
    // checkout. The value is a placeholder, not a secret.
    env: {
      UNUSED_POLICY_MARKER: "not-used",
    },
  },
});
