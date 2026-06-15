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

## Review follow-up

The first fix still left two `resume()` edges open:

- Calling `AudioManager.resume()` while hidden could resume the shared context and make already-started source nodes continue in the background.
- Calling `AudioSource.play()` after an explicit `AudioManager.suspend()` could register pending playback, hit an autoplay rejection, and stay stuck because `suspend()` had already removed the gesture listeners.

The follow-up fix keeps hidden `resume()` as a no-op before touching the context, and restores gesture retry state when `context.resume()` rejects while pending sources exist. Coverage now also drives `_onContextStateChange()` directly for external non-running context state.

## Second review follow-up

The hidden `resume()` guard still had one ordering hole: `document.hidden` could already be `true` while `AudioManager._hidden` was still `false`. If another visibility listener called `AudioManager.resume()` in that window, the previous guard set `_hidden = true` and returned without suspending the running context. The real `_onHidden()` call then saw `_hidden === true` and skipped the required suspend.

The fix routes the `document.hidden` branch through `_onHidden()`, and makes `_onHidden()` idempotent only when the context is already not running. `_resumePendingSources()` now also checks `document.hidden` so pending sources do not start in the same pre-handler hidden window.

Regression coverage now includes both orders:

- `document.hidden === true`, then `AudioManager.resume()`, before the hidden handler runs.
- `document.hidden === true`, then `_resumePendingSources()`, before the hidden handler runs.

## Verification

- `pnpm exec vitest run tests/src/core/audio/AudioSourcePendingPlayback.test.ts`
- `pnpm exec cross-env HEADLESS=true vitest run --coverage tests/src/core/audio/AudioSourcePendingPlayback.test.ts`
- `pnpm exec cross-env HEADLESS=true vitest run --coverage tests/src/core/PolyfillAudioContext.test.ts tests/src/core/audio/AudioSource.test.ts tests/src/core/audio/AudioSourcePendingPlayback.test.ts`
- `pnpm -F @galacean/engine-core run b:types`
- `pnpm exec eslint packages/core/src/audio/AudioManager.ts tests/src/core/audio/AudioSourcePendingPlayback.test.ts`

`npm run build` was also attempted locally, but this machine failed during shader precompile before reaching the audio change. The failure was from shader compiler precompile resolving render-state enums as `undefined`; the live PR CI had already passed the build job on the same PR head.
