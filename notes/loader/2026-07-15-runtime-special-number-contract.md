# Runtime v2 special-number contract

## Problem

JSON cannot represent `Infinity`, but runtime-v2 values need it for data such as particle burst cycles. Decoding the string only when `$type === "Burst"` coupled the generic reflection parser to one Engine class and one constructor position.

## Decision

Runtime v2 represents positive infinity as `{ "$number": "Infinity" }`. `ReflectionParser` resolves that value recursively in props, arrays, call arguments, and constructor arguments without knowing the consuming class. Builder/compiler code owns conversion from Editor source data into this runtime sentinel.

`$args` is valid only beside `$type`; mixed discriminator objects are rejected before any other sentinel branch can silently ignore it.

## Boundary

Only positive infinity is supported because it is the only current producer requirement. `NaN` and negative infinity remain invalid until a real format requirement exists.

## Rejected alternative

A `Burst.$args[2] === "Infinity"` parser branch was removed because it leaked particle constructor semantics into the format resolver and required parser changes for every future infinite numeric field.

## Verification

- `pnpm vitest run tests/src/core/resource/ResourceManager.test.ts tests/src/loader/SceneFormatV2.test.ts`: 71 passed.
- `pnpm build`: passed, including every package type declaration build.
- Engine ESLint: 0 errors; formatting and `git diff --check`: passed.
- Builder lowering tests: 45 passed; runtime schema-v2 typecheck and resource-package compiler build passed.
