# Animator State Instance Boundary

## Context

PR #3024 tried to split shared `AnimatorState` data from per-Animator runtime playback data, but the public API drifted to returning `AnimatorStatePlayData`. That exposed an internal runtime slot and made `findAnimatorState()` return the wrong object when the requested state existed but was not currently playing.

## Decision

Keep `AnimatorStateInstance` as the public per-Animator object. It owns the per-Animator overrides (`speed`, `wrapMode`) and holds the internal `AnimatorStatePlayData` slot. `AnimatorStatePlayData` stays internal and only tracks playback runtime state.

Use `WeakMap<AnimatorState, AnimatorStateData>` and `WeakMap<AnimatorState, AnimatorStateInstance>` in `AnimatorLayerData` so renamed or removed shared states do not collide by name. Keep a layer-local `stateDataList` for reset-time default-value restoration while the lookup path remains WeakMap-based.

Animation event handlers are rebuilt lazily from the state update version and entity scripts version. This covers clip event edits and scripts added after play without registering long-lived listeners on shared `AnimatorState` assets.

## Verification

- `pnpm -F @galacean/engine-core run b:types` passed.
- `pnpm run b:module` passed.
- `pnpm vitest tests/src/core/Animator.test.ts tests/src/core/AnimatorHang.test.ts --run` passed after using the same `@galacean/engine` WebGLEngine entrypoint as the rest of the test suite.
- `pnpm run coverage` passed locally with `111` files and `1423` tests.
- GitHub CI for PR #3024 passed build, lint, e2e, Codecov project, and Codecov patch on commit `c975875de`.
- Focused behavioral coverage was added for stable non-playing state instances, invalid layer lookup/play/crossFade, event binding after scripts are added post-play, and removing a default state.
