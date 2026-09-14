# Script Lifecycle and Frame Order

Use this reference when callback timing or activation ownership changes the implementation.

## Activation

- `onAwake` runs once, the first time the owning entity becomes active in its hierarchy. The Script's `enabled` flag does not gate this first awakening.
- `onEnable` and `onDisable` follow the combined state of entity hierarchy activation and component enablement.
- `onStart` runs once after the Script becomes active and before its first frame-level update. Disabling and re-enabling a started Script does not run it again.
- `onDestroy` belongs to irreversible destruction, not temporary disablement. Release subscriptions or owned external resources at the lifecycle boundary that actually created them.

## Frame phases

The relevant order within a rendered frame is:

1. Run pending `onStart` callbacks.
2. Run zero or more fixed physics steps. Each step invokes active `onPhysicsUpdate` callbacks before simulation.
3. Dispatch pointer Script callbacks after the frame's raw input sampling and physics work.
4. Run active `onUpdate` callbacks.
5. Advance animation.
6. Run active `onLateUpdate` callbacks.
7. Render cameras.

Fixed physics frequency is independent of rendered-frame frequency. A rendered frame can therefore contain no physics step, one step, or several steps.

`onBeginRender` and `onEndRender` are per-camera callbacks sent to Scripts on that Camera's Entity. A Script on an Entity with multiple active Cameras can therefore receive them multiple times during one rendered frame.

## Pointer input within a frame

`Pointer.phase` is the current phase, not a record of every transition processed during the frame. A short press and release may both occur before `onUpdate`, leaving the phase at `Up`. It also reports `Stationary` when a pointer produced no event in that frame, and `Leave` is set by a leave or cancel event. `InputManager.isPointerDown()` and `isPointerUp()` preserve the respective frame events and can both be true; these queries are not mutually exclusive, and each result stays true for the whole frame it belongs to. They aggregate pointers and do not identify which pointer produced an event. Pointer Script callbacks receive individual dispatched events.

## Ownership guidance

- Initialize state that exists for the Script's whole lifetime in `onAwake` or `onStart`, based on whether hierarchy activation must already have happened.
- Pair work repeated by enablement with `onEnable` and `onDisable`.
- Keep physics decisions in the fixed-step phase and visual follow-up in the rendered-frame phase when their frequencies must remain independent.
