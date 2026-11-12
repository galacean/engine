# Reconciliation with galacean/engine dev/2.0

Validated 2026-11-12 against `galacean/engine` commit
`4916add0371a4853ebe8d3c23fcd68cf150038d6` (2.0.0-alpha.56).
The preserved development head is `148f009116b51c9b3dcceb4f0762a32dd001b281`.
`galacean/engine-next` is deprecated; it is not the synchronization or push target.

The merge keeps the independent arrangement/shaping pipelines, procedural ridge
network, fracture controls, and original atomic-rock triplanar material. Ridge
demo source and generated output are unchanged by this reconciliation.

## Compatibility changes

- Resolve the lockfile while retaining World packages and adding the native
  shader parser/analyzer packages.
- Preserve World shader warmup, program caching, and feedback ABI checks while
  mapping authored feedback outputs to the compiler's generated GLSL names.
- Adopt normalized include keys, source locations, MRT declarations, independent
  same-name shader instances, and explicit material shader references. Keep
  World's identical-content sharing and legacy material metadata support.
- Make fog fallbacks and particle mode branches valid for the new analyzer while
  preserving the modified shader behavior for supported modes.
- Compile World shaders against the staged modified includes explicitly, and
  migrate plant offline compilation to `ShaderPrecompiler`.
- Build native compiler/parser dependencies during `prepare:engine`; update
  typecheck subpath resolution and built-in shader nullability assertions.

## Validation

| Check | Result |
| --- | --- |
| Frozen lockfile install | Passed |
| Native module build and type declarations | Passed |
| `pnpm --dir world prepare:engine` | Passed; 33 shaders, 64 staged includes |
| `pnpm --dir world build` | Passed |
| `pnpm --dir world typecheck` | Passed; no new diagnostics against the one existing native diagnostic |
| `pnpm --dir world check:boundaries` | Passed |
| Ridge `test:features` | Passed; four feature combinations and exact geometry/scene hashes retained |
| Native physics browser suites | 139/139 passed: PhysicsScene, MeshColliderLayer, ColliderLayer, CharacterController |
| Modified-engine browser compatibility | 79/80 passed; one independently reproduced upstream failure below |
| Scoped ESLint | No errors; seven existing warnings |

Run the modified-engine suite with:

```sh
pnpm --dir tests exec vitest run --config ../packages/modify/tests/vitest.compat.config.mjs
```

The suite uses the same `engineModify()` source substitutions as World. It covers
material references, shader identity and include resolution, MRT rendering,
transform-feedback GPU readback, and async warmup/cache/ABI behavior.

### Upstream failure retained

`tests/src/core/Shader.test.ts`, `Custom Shader > ShaderCompiler`, fails for its
GLSLES300 variant: generated fragment code retains `texture2D`, which WebGL2
rejects. The same case fails against the freshly built, unmodified native engine
without `engineModify()`. This is not a merge-specific regression; the test remains
enabled and no workaround is applied to native sources.

These checks establish build, type, feature-state, geometry parity, and focused
GPU/physics compatibility. They do not constitute a full interactive Seed World
playthrough or visual review.
