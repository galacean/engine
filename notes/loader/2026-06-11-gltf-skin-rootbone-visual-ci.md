# glTF skin rootBone visual CI regression

## Symptom

PR #3027 failed e2e visual checks in Animator, Shadow, Camera, and Material cases with tiny image diffs.
Local reproduction on `fix/gltf-loader-shaderlab-split` initially failed because `odiff-bin` postinstall had not linked the binary; after `pnpm rebuild odiff-bin`, the same visual diffs reproduced.

Representative local failures before the fix:

- `Animator/additive`: `0.0015625%`
- `Animator/crossfade`: `0.00489583333333%`
- `Animator/play`: `0.0028125%`
- `Animator/playBackWards`: `0.00104166666667%`
- `Animator/stateMachine`: `0.00375%`
- `Shadow/basic`: `0.0132291666667%`
- `Camera/opaqueTexture`: `0.00135416666667%`

## Root Cause

`GLTFSkinParser` started including nodes that reference a skin (`node.skin === skinIndex`) when inferring `skin.rootBone` for glTF skins with no explicit `skin.skeleton`.

For the shared Mixamo GLB used by the failing e2e cases:

- `skin.skeleton` is absent.
- joints-only LCA is `mixamorig:Hips`.
- joints plus skinned mesh nodes LCA is `Armature`.
- `Armature` has scale `0.01`; the skinned mesh nodes are siblings of `mixamorig:Hips`.

`Skin.rootBone` is not only a bounds hint. Setting it changes `SkinnedMeshRenderer._transformEntity`, feeds renderer transform matrices, and changes `Skin._updateSkinMatrices()` through `rootBone.getInvModelMatrix()`. Promoting rootBone from `mixamorig:Hips` to `Armature` changed the rendered coordinate space enough to trigger strict visual snapshots.

## Fix

Infer missing `skin.skeleton` from joints only. Nodes that use the skin are mesh owners, not skeleton joints, and must not participate in skeleton root inference.

Keep the separate bounds behavior for explicit root bones outside the joint list: `GLTFSceneParser` still transforms mesh bounds into explicit rootBone space.

## Verification

- `pnpm vitest run tests/src/loader/GLTFLoader.test.ts --testNamePattern "Multi-root skins without skeleton"` failed before the fix with `skins[0].rootBone === defaultSceneRoot`.
- `npm run build` passed.
- `pnpm vitest run tests/src/loader/GLTFLoader.test.ts --testNamePattern "Multi-root skins without skeleton|Skinned mesh bounds"` passed.
- `CI=true PLAYWRIGHT_FORCE_TTY=1 npx playwright test --grep "(Animator.*(additive|crossfade|play$|playBackWards|stateMachine$)|Material.*unlit|Shadow.*basic|Camera.*opaqueTexture)" --reporter=list,github` passed: 8/8.
