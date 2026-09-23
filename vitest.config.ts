import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const writingCoreDir = p("../writing_core");
const hasWritingCoreSibling = existsSync(writingCoreDir);
const screenwriterTypesSrc = p("../screenwriter_types/src/index.ts");

export default defineConfig({
  // Vitest does not read tsconfig `paths`; mirror them here (keep in sync with tsconfig.json). Each
  // entry is only applied when that sibling repo is actually checked out (local dev, the
  // "local-packages phase"); otherwise it falls through to the real, published npm dependency
  // (package.json) instead — CI checks out only this one repo, so `../screenwriter_types` and
  // `../writing_core` do not exist there. yjs/lib0 MUST point at writing_core's copy locally: one Yjs
  // instance at runtime; in CI they resolve via whatever `@sudobility/writing_core` transitively
  // installs, which is still exactly one copy.
  resolve: {
    alias: [
      ...(existsSync(screenwriterTypesSrc) ? [{ find: /^@sudobility\/screenwriter_types$/, replacement: screenwriterTypesSrc }] : []),
      ...(hasWritingCoreSibling
        ? [
            { find: /^@sudobility\/writing_core$/, replacement: p("../writing_core/src/index.ts") },
            { find: /^yjs$/, replacement: p("../writing_core/node_modules/yjs/dist/yjs.mjs") },
            { find: /^lib0\/(.*)$/, replacement: p("../writing_core/node_modules/lib0/") + "$1" },
          ]
        : []),
    ],
  },
  test: {
    environment: "node",
    fileParallelism: false, // integration tests share one spawned API and test DB
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
  },
});
