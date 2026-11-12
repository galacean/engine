# Reconciliation with experimental/engine-next

Validated 2026-11-12 against `galacean/engine` branch
`experimental/engine-next`, commit
`79c8a42d20b1623d6c3c4d0ee6e07b1d46101661`.
The preserved development head is
`f014439dd7a2dcd2531adb49a81fa7313764fb89`.

This is the current World synchronization target. The earlier native `dev/2.0`
reconciliation remains in history, including its newer shader interface-lowering
contracts. The repository remains `galacean/engine`.

## Integrated behavior

The merge brings the experimental branch's atomic-rock backend and assembly,
water authoring and startup, templates, building previews, texture-array loading,
and asynchronous Seed World preparation. The ridge demo and its independent
arrangement/shaping pipelines retain their existing source and generated output.

Conflict resolutions retain explicit shader references, authored shader names,
canonical source locations, source/precompiled content caching, and the incoming
null-reference fallback. Source-cache identity also includes the canonical include
namespace. The plant precompiler retains its logical source filename.

Focused validation exposed three additional integration issues addressed here:

- Forward progress and cancellation when applying texture sampler overrides;
  retain authored/runtime sampler state during KTX2 content restoration.
- Move the building plan fixture to `world/fixtures`, retaining its original
  test import path, so preview pages do not import another demo's private source.
- Migrate the incoming rock shader test to `ShaderPrecompiler` and give shared
  toon lighting the matching WebGL1 direct-light-array path. Test both shader
  language targets.

## Validation

| Check | Result |
| --- | --- |
| Frozen lockfile install | Passed |
| Modified shader preparation | Passed; 33 shaders against 64 staged includes |
| Seed World production build | Passed |
| World typecheck | Passed; no new diagnostics against the existing native baseline |
| Package/demo boundaries | Passed |
| Experimental World rock/startup/warmup/assets/click-routing tests | 63/63 passed, 13 suites |
| Atomic procedural-rock tests | 58/58 passed, five suites |
| Water startup/source browser tests | 4/4 passed |
| Shared building fixture consumers | 10/10 passed |
| Modified-engine shader/resource browser compatibility | 89/90 passed; existing upstream failure below |
| Ridge state, jobs, feature switches and geometry parity | Passed on the fixture's Node 20 runtime; numerical serialization detail below |

The compatibility suite includes real GPU transform-feedback and texture-array
readback, with decoded KTX2 input supplied locally. It does not test external
transcoder downloads or a full interactive Seed World playthrough.

### Existing upstream shader failure

`tests/src/core/Shader.test.ts`, `Custom Shader > ShaderCompiler`, still fails
because its GLSLES300 fragment retains `texture2D`. The prior reconciliation
reproduced this against unmodified native `dev/2.0`; native engine/compiler source
is unchanged by the experimental merge. The test remains enabled.

### Ridge hash across Node versions

The same seed 482 request produces the recorded full-scene hash on Node 20.18.1
(V8 11.3). Node 25.2.1 (V8 14.1) differs in 286 of 54,483 numeric leaves, by at most
`7.105427357601002e-15` (two ULP). There are no structural or nonnumeric changes.
All 25 rock records/placements, base and carved geometry hashes, terrain, guides,
labels, camera, metrics, and ridge nodes match exactly. Differences are confined
to procedural field samples and one duplicated curve height. The fixture was
not rebaselined; the original exact check passes on its original runtime.
