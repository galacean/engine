# Hidden Playback Gate

## Problem

PR #3026 hardened `AudioManager.resume()` and hidden lifecycle handling, but one hidden/play ordering still allowed a source to start while the page was already hidden.

The race was:

- `document.hidden` becomes `true`, or `pagehide` starts.
- `AudioManager._onHidden()` either has not run yet or has called async `context.suspend()` but the context still reports `running`.
- `AudioSource.play()` sees the raw context state through `AudioManager.isAudioContextRunning()` and calls `_startPlayback()`.
- The source can then survive until foreground resume even though the playback request happened while hidden.

## Root Cause

`isAudioContextRunning()` is a raw WebAudio state query. Using it directly as the `AudioSource.play()` start permission mixed two different concerns:

- whether the underlying context state is currently `running`
- whether engine lifecycle state allows starting new playback

The raw state can lag hidden lifecycle intent because `AudioContext.suspend()` resolves asynchronously.

## Fix

Keep `isAudioContextRunning()` as a raw state check and add an internal playback gate:

```ts
AudioManager._canStartPlayback()
```

The gate rejects playback while `document.hidden` or `_hidden` is true, synchronizes hidden state by calling `_onHidden()` when `document.hidden` is already true, and only then checks the raw context state.

`AudioSource.play()` now uses this gate in both start points:

- the initial fast path before `_startPlayback()`
- the post-`AudioManager.resume()` retry path

## Verification

Passed:

```bash
pnpm exec vitest run tests/src/core/audio/AudioSourcePendingPlayback.test.ts
pnpm exec cross-env HEADLESS=true vitest run tests/src/core/audio/AudioSource.test.ts tests/src/core/audio/AudioSourcePendingPlayback.test.ts
pnpm -F @galacean/engine-core run b:types
pnpm exec eslint packages/core/src/audio/AudioManager.ts packages/core/src/audio/AudioSource.ts tests/src/core/audio/AudioSourcePendingPlayback.test.ts
git diff --check HEAD
```
