# Audio context lifecycle CI fix

## Context

PR #3026 failed only in the `codecov` job. The failing step was `Test`, not the Codecov upload. The job log showed `AudioSourcePendingPlayback.test.ts` failures with `RangeError: Maximum call stack size exceeded`, while lint, build, and e2e checks were green on the same head.

## Root cause

`AudioManager` treated every foreground `suspended` state as an external browser interruption. That made a caller-controlled `AudioManager.suspend()` eligible for automatic click/pointer resume.

The iOS foreground recovery path also scheduled a delayed `context.resume()` without retaining or invalidating the timer. If the page was hidden again before the delay elapsed, the stale callback could resume audio while hidden.

The test file amplified the problem by relying on `document.hidden` getter mocks and fake timers across lifecycle tests. In full coverage order this left enough asynchronous state behind to reproduce the CI-only stack overflow.

## Fix

- Track caller-controlled suspension separately from browser interruptions.
- Store and clear the foreground recovery timer on hide, explicit suspend, and explicit resume.
- Guard the delayed recovery callback and its async result against hidden pages, stale contexts, and caller-controlled suspension.
- Make the audio lifecycle tests import the source audio module, reset `AudioManager` listeners/state per case, and drive scheduled callbacks explicitly instead of relying on DOM getter mocks or fake timer ordering.

## Verification

- `pnpm exec vitest run tests/src/core/audio/AudioSourcePendingPlayback.test.ts`
- `pnpm exec cross-env HEADLESS=true vitest run --coverage tests/src/core/audio/AudioSourcePendingPlayback.test.ts`
- `pnpm exec cross-env HEADLESS=true vitest run --coverage tests/src/core/PolyfillAudioContext.test.ts tests/src/core/audio/AudioSource.test.ts tests/src/core/audio/AudioSourcePendingPlayback.test.ts`
- `pnpm -F @galacean/engine-core run b:types`
- `pnpm exec eslint packages/core/src/audio/AudioManager.ts tests/src/core/audio/AudioSourcePendingPlayback.test.ts`

`npm run build` was also attempted locally, but this machine failed during shader precompile before reaching the audio change. The failure was from shader compiler precompile resolving render-state enums as `undefined`; the live PR CI had already passed the build job on the same PR head.
