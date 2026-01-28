# Build and Development Tools

Galacean Engine is developed in a pnpm workspace and relies on a Rollup-based toolchain for bundling, SWC for transpilation, Vitest/Playwright for automated testing, and ESLint/Prettier for linting and formatting. This document summarizes the scripts and configurations that drive those workflows.

## Project scripts
All commands are defined in the workspace `package.json` and should be invoked with pnpm.

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install workspace dependencies (enforced by `npx only-allow pnpm`). |
| `pnpm dev` | Start Rollup in development mode (`BUILD_TYPE=MODULE`, `NODE_ENV=development`) with live rebuilds and a static server on port `9999`. |
| `pnpm watch` | Continuous module build (`BUILD_TYPE=MODULE`, `NODE_ENV=release`). Source maps are kept inline for debugging optimized output. |
| `pnpm watch:umd` | Continuous UMD build (`BUILD_TYPE=UMD`). |
| `pnpm build` | Perform a release build by running `b:module` and `b:types` across all packages. |
| `pnpm b:module` | Single-pass Rollup build that emits both ES module and CommonJS bundles. |
| `pnpm b:umd` | Generate minified and verbose UMD bundles. |
| `pnpm b:types` | Run each package’s TypeScript declaration build. |
| `pnpm b:all` | Produce module and UMD bundles plus type declarations in one pass. |
| `pnpm clean` | Remove `dist/` and `types/` folders from every package. |
| `pnpm lint` | ESLint over `packages/*/src` (TypeScript only). |
| `pnpm test` | Execute unit tests with Vitest (pretest installs Vitest and Playwright Chromium). |
| `pnpm coverage` | Run Vitest with V8 coverage reporting (`HEADLESS=true`). |
| `pnpm e2e` | Run Playwright end-to-end tests (Chromium is installed via `pree2e`). |
| `pnpm e2e:debug` | Launch Playwright in UI/debug mode. |
| `pnpm examples` | Start the examples workspace (`pnpm --filter @galacean/engine-examples dev`). |
| `pnpm release` | Use `bumpp` to bump package versions. |

Husky is installed via `pnpm prepare`, and `lint-staged` runs `eslint --fix` on staged `.ts` files before commits.

## Rollup configuration
The root `rollup.config.js` orchestrates builds for every package under `packages/` (excluding `design`). Key aspects:

- **Inputs**: Each package’s `src/index.ts` is used as the root entry.
- **Environment variables**: `BUILD_TYPE` determines whether module, UMD, or both outputs are produced. `NODE_ENV` toggles debug/development behavior (e.g., the dev server plugin runs when `NODE_ENV=development`).
- **Plugins**:
  - `@rollup/plugin-node-resolve` and `@rollup/plugin-commonjs` allow bundling npm dependencies.
  - A custom GLSL plugin in `rollup-plugin-glsl` inlines shader files; compression is enabled for minified UMD builds.
  - `rollup-plugin-swc3` transpiles TypeScript/ESNext to ES5 (loose mode with external helpers) and produces source maps.
  - `rollup-plugin-jscc` injects compile-time macros (for example `_VERBOSE` for verbose shaderlab builds).
  - `@rollup/plugin-replace` wires build metadata, including the package version (`__buildVersion`).
  - `rollup-plugin-serve` serves package directories on port `9999` during `pnpm dev`.
  - `rollup-plugin-swc3/minify` compresses UMD bundles when `compress=true`.
- **Outputs**:
  - Module builds emit both ES module and CommonJS files as specified in each package’s `package.json` (`module` and `main` fields).
  - UMD builds honor the `umd` field in each package’s `package.json` (global name and externals) and emit `.js`, `.min.js`, and optional verbose builds.

## Type declarations
Each package exposes a `b:types` script (see the individual `package.json` files). `pnpm b:types` runs all of them in parallel, emitting `.d.ts` files to the `types/` directory inside each package.

## Development workflow
1. **Install** dependencies: `pnpm install`.
2. **Start** the dev server: `pnpm dev` (Rollup serves builds at `http://localhost:9999` and rebuilds on change). Use `pnpm examples` to launch the example playground in parallel.
3. **Run tests** whenever you touch core logic: `pnpm test` for unit tests, `pnpm e2e` for Playwright scenarios.
4. **Lint** before committing: `pnpm lint` (automatically enforced by `lint-staged` on staged files).
5. **Build** release artifacts: `pnpm build` or the more granular `b:*` scripts (module, UMD, types).
6. **Clean** generated folders with `pnpm clean` when switching branches or resolving build issues.

## Testing stack
- **Vitest** (configured by the root scripts) runs fast unit tests. Coverage uses the V8 provider via `@vitest/coverage-v8`.
- **Playwright** drives Chromium-based e2e tests. The repository installs the browser binary on-demand in the `pretest`/`pree2e` scripts.
- `pnpm coverage` sets `HEADLESS=true` to keep the tests deterministic under CI.

## Optimization notes
- The Rollup build respects package-level `dependencies` and `peerDependencies` when marking externals. Keep these fields current to avoid bundling unintended code.
- For UMD builds, declare globals in the package `umd.globals` map (`package.json`) so Rollup can wire the correct runtime module names.
- When authoring shader files, remember that release UMD builds will minify GLSL; keep debug builds (`NODE_ENV=development`) handy for readable output.
- Prefer named imports (e.g., `import { WebGLEngine } from "@galacean/engine"`) to enable downstream tree shaking when consumers bundle their apps.

## Best practices
- Use the provided scripts rather than invoking Rollup directly—environment variables and plugin options are coordinated for every package.
- Run `pnpm lint` and `pnpm test` before pushing to catch style or regression issues early.
- Keep the `rollup.config.js` plugin list in sync with any new package requirements (e.g., if you add a new asset suffix that needs to be inlined).
- Monitor bundle artifacts in `packages/*/dist` to ensure verbose/minified/module builds are generated as expected before publishing.
