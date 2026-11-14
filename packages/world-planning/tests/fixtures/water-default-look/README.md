# Independent default Water appearance

These five PNGs were captured from Water commit `eca4f7c558fcf8661f52b5d5cbee3dc7e3f83661` (tree `45e8a90945464afb5ae5b866c55944f308a59c8b`) before replaceable texture integration. They preserve the existing Lake/River defaults and Ocean near/transition/far appearance. `provenance.json` records the fixed viewport, cameras, time and eight texture hashes. The original comparison used the same Core/Modify, lighting and bed as the permanent test.

`NativeWaterDefaultLook.test.ts` renders the current runtime against these independent images. It verifies the five PNG hashes and eight default texture hashes, checks stable consecutive frames, and checks that hiding water fails the comparison in each of the five views. The allowed mean RGB channel error is at most 1/255; at most 1% of pixels may differ by more than 8/255 in any RGB channel. `NativeWaterRendering.test.ts` separately checks current source/AOT delivery parity.

Run both from the Engine repository root after installing the locked dependencies and preparing the repository's Shader Parser/Compiler dist files and Modify shader cache:

```sh
pnpm exec vitest run --config packages/water/vitest.config.mjs packages/world-planning/tests/NativeWaterDefaultLook.test.ts packages/world-planning/tests/NativeWaterRendering.test.ts
```

The command uses the browser provider configured in `packages/water/vitest.config.mjs`. A shared browser runner may override the provider while importing this config; keep the same test files, fixtures, render setup, and thresholds. The fixed render target is 877 × 657, independent of the browser window size. `fixedTime: 0` freezes the engine clock from creation.

Do not regenerate these references from the current implementation to make a failure pass. An intentional default-look change requires a reviewed visual comparison against these images and updated capture provenance. The historical captures are inputs, not evidence that the current revision has passed on another GPU.
