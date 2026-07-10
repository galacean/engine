# glTF scene sub-asset key alignment

## Symptom

Editor source-v2 uses the glTF schema path `scenes[0]` for an instance asset key. The Engine loaded and cached the main GLTFResource, but a concurrent `?q=scenes[0]` request never resolved, so Scene and Prefab loading remained pending without a network or parser error.

## Root cause

`GLTFParserContext` stored scene roots in the internal `_sceneRoots` field and only published `_sceneRoots[index]` plus `defaultSceneRoot` to ResourceManager. Editor metadata and source-v2 use `scenes[index]`, matching the glTF schema rather than the Engine's private storage field. Cached query traversal also failed because GLTFResource exposed no `scenes` property.

## Decision

- `scenes[index]` is the canonical public sub-asset query key.
- GLTFResource exposes a read-only `scenes` view for cached query traversal.
- The parser publishes `scenes[index]` while retaining `_sceneRoots[index]` and `defaultSceneRoot` as compatibility aliases.
- The fix belongs in Engine, not in Editor CLI lowering or migration-specific key rewriting, because Editor already uses the glTF schema key consistently.

## Verification

- Loader test covers both first-load callback resolution and cached lookup for `?q=scenes[0]`.
- The migration runtime reproduction uses two source-v2 glTF instances and previously left both query promises pending while their main GLTFResource objects were cached.

## Source-v2 instance consumption

Editor source-v2 instance refs can select a glTF scene with key scenes[n]. Generic resource-ref resolution must not consume that key first, because it returns the scene Entity while HierarchyParser needs the owning GLTFResource to clone the selected scene.

HierarchyParser now:

- parses scenes[n] without regex and keeps defaultSceneRoot compatibility;
- loads the main glTF resource by URL;
- passes the selected index to instantiateSceneRoot(index);
- keeps ordinary Prefab refs on the existing path;
- rejects resources that are neither PrefabResource nor GLTFResource with a boundary-specific error.

Verification:

- pnpm run b:module: passed.
- HEADLESS=true pnpm exec vitest run tests/src/loader/GLTFLoader.test.ts tests/src/loader/SceneFormatV2.test.ts: 60 passed.
- A locally linked 3DCube source-v2 build loaded, entered gameplay, instantiated repeated glTF-backed dice, and produced no console errors.
