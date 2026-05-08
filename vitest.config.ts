import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Coverage scope: pure-logic source that runs cleanly in a node
      // env without DOM, React, or platform plugins. Files genuinely
      // exercised through other channels (DOM event integration tests
      // we don't yet have) are excluded — they need a jsdom +
      // @testing-library/react setup that's its own project.
      include: ["src/model/**/*.ts", "src/lib/**/*.ts", "src/store/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/model/**/index.ts",
        // React hooks: need React Testing Library infra (skipped for now)
        "src/lib/useLongPress.ts",
        "src/store/useDebouncedParse.ts",
        // localStorage / window globals — need a DOM env (jsdom / happy-dom)
        "src/lib/draft.ts",
        "src/lib/env.ts",
        "src/lib/recentFiles.ts",
        // Heavy integration with Tauri / dialog / storage adapter — would
        // require mocking the entire IPC surface area. Validated via manual
        // smoke tests instead.
        "src/lib/fileActions.ts",
        // notes.ts mixes pure helpers (isPathReference,
        // suggestedSidecarFilename — exercised by notes.test.ts) with
        // Tauri-IO (resolveNotesPath / loadNotes / saveNotes need plugin-fs
        // mocks). Excluded from the file-level percentage; manual-testing-
        // guide.md covers the IO portion.
        "src/lib/notes.ts",
        // Platform / IO wrappers — small, mostly delegating, not worth
        // mocking for line count.
        "src/lib/storage/**",
        "src/lib/exportActions.ts",
        "src/lib/openExternal.ts",
        "src/lib/openFromOs.ts",
        "src/lib/settings.ts",
        "src/lib/telemetry.ts",
        "src/lib/theme.ts",
        "src/lib/updater.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
