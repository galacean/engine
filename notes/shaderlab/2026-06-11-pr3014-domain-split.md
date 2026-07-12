# PR #3014 Domain Split

## Context

PR #3014 originally combined shaderlab fixes across Animation, Physics, Audio, and glTF Loader. The branch was updated first so the original PR head contained the latest relevant `fix/shaderlab` work, then the changes were split into domain-scoped PRs against the latest `origin/dev/2.0` (`de7549687`).

## Branches And PRs

- Animation: `fix/animation-shaderlab-split` -> https://github.com/galacean/engine/pull/3024
- Physics contact events and collision normals: `fix/physics-shaderlab-split` -> https://github.com/galacean/engine/pull/3025
- Physics kinematic synchronization: `fix/physics-kinematic-sync` -> https://github.com/galacean/engine/pull/3041
- Physics mesh rebuild and scaled defaults: `fix/physics-mesh-defaults` -> https://github.com/galacean/engine/pull/3042
- Audio: `fix/audio-shaderlab-split` -> https://github.com/galacean/engine/pull/3026
- glTF Loader: `fix/gltf-loader-shaderlab-split` -> https://github.com/galacean/engine/pull/3027
- Original combined PR #3014 was closed in favor of the scoped PRs.

## Scope Notes

- Animation includes Animator play-data cleanup, clip-change listener disposal, WeakMap-backed instance tracking, `_reset` cleanup guards, stale `AnimatorStateInstance` removal, and the hang regression test.
- Physics was subsequently split into a stack: #3025 owns contact-event demand and collision-normal orientation; #3041 owns target-versus-teleport kinematic synchronization, re-entry pose recovery, and CCD state; #3042 owns mesh rebuild, scaled PhysX defaults, and material/clone synchronization.
- Audio keeps pending AudioSource playback and AudioLoader fixes together.
- glTF Loader keeps schema/parser/skin parser fixes and related loader regression coverage together.

## Verification

- All split branches: `git diff --check origin/dev/2.0...HEAD` passed.
- Animation: `pnpm -F @galacean/engine-design run b:types`; `pnpm -F @galacean/engine-core run b:types`.
- Physics: `pnpm -F @galacean/engine-design run b:types`; `pnpm -F @galacean/engine-core run b:types`; `pnpm -F @galacean/engine-physics-lite run b:types`; `pnpm -F @galacean/engine-physics-physx run b:types`.
- Audio: `pnpm -F @galacean/engine-design run b:types`; `pnpm -F @galacean/engine-core run b:types`; `pnpm -F @galacean/engine-loader run b:types`.
- glTF Loader: `pnpm -F @galacean/engine-design run b:types`; `pnpm -F @galacean/engine-core run b:types`; `pnpm -F @galacean/engine-loader run b:types`.

Focused Vitest commands were attempted in clean split worktrees, but Vite dependency scanning failed before executing tests because local workspace package JavaScript entries were not built.
