import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// import.meta.url (not __dirname): works under both Vite's legacy and "native" ESM config loaders.
const r = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/**
 * Bundled library build (Rollup, via Vite's library mode): a single `dist/index.js` — this package
 * has no JSX in `src/` (only in `tests/`), so no `@vitejs/plugin-react` is needed for the build
 * itself. Declarations are generated separately by `tsconfig.build.json`'s own `tsc
 * --emitDeclarationOnly` pass (see `package.json`'s `build` script).
 */
export default defineConfig({
  build: {
    lib: {
      entry: r("src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      // Real npm dependencies (peer or direct), never bundled into this package's own output.
      // `yjs` in particular MUST stay external: bundling it would create a second Yjs instance,
      // breaking Y.Doc interop with every other consumer of the same document.
      external: ["react", "@tanstack/react-query", "@sudobility/screenwriter_types", "@sudobility/writing_core", "yjs"],
    },
    sourcemap: true,
    minify: false,
  },
});
