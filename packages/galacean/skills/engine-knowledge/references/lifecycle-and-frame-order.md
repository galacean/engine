# Script Lifecycle and Frame Order

Use this reference when callback timing, activation ownership, or deferred destruction affects behavior.

## Activation and destruction

- `onAwake` runs once the first time the owning Entity becomes active in its hierarchy; the Script's `enabled` flag does not gate this first awakening.
- `onEnable` and `onDisable` follow the combined state of Entity hierarchy activation and Script enablement. Pair enable-scoped setup and teardown here.
- `onStart` runs once after the Script becomes active and before its first frame update; disabling and re-enabling a started Script does not run `onStart` again.
- `onDestroy` runs on irreversible destruction, not temporary disablement. Release resources at the lifecycle boundary that created them.
- Calling `destroy()` during a frame defers actual destruction (`destroyed === true`, `onDisable`, `onDestroy`) until the end of that frame after rendering.

## Frame phases

Within a rendered frame, work runs in this order:

1. Run pending `onStart` callbacks.
2. Run zero or more fixed physics steps; each step invokes active `onPhysicsUpdate` callbacks before simulation.
3. Dispatch pointer Script callbacks (`onPointer*`) after raw input sampling and physics work.
4. Run active `onUpdate` callbacks.
5. Advance `Animator` components.
6. Run active `onLateUpdate` callbacks.
7. Run Renderer updates (such as Spine and particles), then render each active Camera with per-camera `onBeginRender` and `onEndRender`.
8. Flush deferred `destroy()` calls (`onDisable` and `onDestroy`).

Fixed physics frequency is independent of rendered-frame frequency, so one rendered frame can contain zero, one, or multiple physics steps. Keep physics decisions in `onPhysicsUpdate` and visual follow-up in rendered-frame callbacks when their frequencies must stay independent.

`onBeginRender` and `onEndRender` are per-camera callbacks sent to Scripts on that Camera's Entity; an Entity hosting multiple active Cameras receives them once per active Camera each frame.
