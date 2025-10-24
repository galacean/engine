# Input Manager System

Galacean's `InputManager` centralizes keyboard, pointer (mouse, touch, pen), and wheel input. It converts browser events into frame-based state so gameplay logic can query a consistent view each update. The manager lives on the engine instance and is updated automatically every frame before scripts run.

## Getting the Manager and Configuring Targets

```ts
import { PointerButton, WebGLEngine } from '@galacean/engine';

const engine = await WebGLEngine.create({
  canvas,
  input: {
    pointerTarget: document,  // capture drags outside the canvas
    keyboardTarget: window,
    wheelTarget: document
  }
});

const { inputManager } = engine;
```

By default the engine listens on the canvas for pointer/wheel and on `window` for keyboard. When running inside an `OffscreenCanvas`, the manager is not initialized (all queries return defaults, `pointers` is empty, `wheelDelta` is `null`). Feature-detect by checking `inputManager.pointers.length` or `inputManager.wheelDelta`.

## Keyboard Input

Keyboard state is tracked with three queries. Each method accepts an optional `Keys` enum; omit the argument to ask "any key".

| Method | Meaning |
| --- | --- |
| `isKeyHeldDown(key?)` | Key is currently pressed. Without arguments, returns true if *any* key is held. |
| `isKeyDown(key?)` | Key transitioned to pressed during the current frame. |
| `isKeyUp(key?)` | Key transitioned to released during the current frame. |

```ts
import { Keys, Script } from '@galacean/engine';
import { Vector3 } from '@galacean/engine-math';

class MovementScript extends Script {
  private readonly move = new Vector3();

  onUpdate(deltaTime: number): void {
    const input = this.engine.inputManager;
    this.move.set(0, 0, 0);

    if (input.isKeyHeldDown(Keys.KeyW)) this.move.z += 1;
    if (input.isKeyHeldDown(Keys.KeyS)) this.move.z -= 1;
    if (input.isKeyHeldDown(Keys.KeyD)) this.move.x += 1;
    if (input.isKeyHeldDown(Keys.KeyA)) this.move.x -= 1;

    if (this.move.length() > 0) {
      this.move.normalize();
      this.entity.transform.translate(this.move.scale(4 * deltaTime));
    }

    if (input.isKeyDown(Keys.Space)) this.jump();
  }
}
```

On macOS browsers the system suppresses `keyup` while either `Meta` key is held. When `MetaLeft`/`MetaRight` is released the manager clears every recorded key, so guard combination logic accordingly.

## Pointer Input

`inputManager.pointers` exposes the active pointers for the current frame (mouse, touches, pen contacts). The list is kept in ascending logical id order, and entries are removed the frame after their `phase` becomes `PointerPhase.Leave`.

Key fields on `Pointer`:

| Property | Description |
| --- | --- |
| `id` | Stable index (0-based) assigned by the manager. |
| `phase` | `PointerPhase.Down`, `Move`, `Stationary`, `Up`, or `Leave`. |
| `position` | Canvas-space pixel coordinates (already DPI corrected). |
| `deltaPosition` | Movement since the previous frame (0,0 when stationary). |
| `button` | Button involved in the last event for this pointer. |
| `pressedButtons` | Bit mask of all buttons currently held (`PointerButton`). |

Pointer button helpers mirror the keyboard trio:

```ts
import { PointerButton, PointerPhase, Script } from '@galacean/engine';
import { Vector3 } from '@galacean/engine-math';

class OrbitCamera extends Script {
  private yaw = 0;
  private pitch = 15;
  private readonly offset = new Vector3(0, 3, 8);

  onUpdate(): void {
    const input = this.engine.inputManager;
    const pointers = input.pointers;

    if (input.isPointerHeldDown(PointerButton.Primary) && pointers.length > 0) {
      const pointer = pointers[0];
      this.yaw -= pointer.deltaPosition.x * 0.2;
      this.pitch = Math.max(-80, Math.min(80, this.pitch - pointer.deltaPosition.y * 0.2));
    }

    if (input.isPointerDown(PointerButton.Secondary)) {
      this.resetCamera();
    }

    this.applyTransform();
  }
}
```

Set `inputManager.multiPointerEnabled = false` to force a single logical pointer (touch gestures collapse to index 0). Leave it enabled to process multi-touch.

## Pointer Callbacks on Scripts

Pointer interactions are delivered to scripts attached to entities with colliders. Events fire **before** `onUpdate` each frame.

```ts
import { PointerButton, PointerEventData, PointerPhase, Script } from '@galacean/engine';

class ButtonHandler extends Script {
  private pressed = false;

  onPointerDown(event: PointerEventData): void {
    if (event.pointer.button === PointerButton.Primary) this.pressed = true;
  }

  onPointerUp(event: PointerEventData): void {
    if (this.pressed && event.pointer.phase === PointerPhase.Up) {
      this.activate();
    }
    this.pressed = false;
  }
}
```

`PointerEventData` supplies the originating `Pointer` plus `worldPosition` from whichever emitter performed the raycast. The engine automatically adds a physics-based emitter when physics is enabled. You can extend the system by registering your own emitter:

```ts
import {
  Pointer,
  PointerEventData,
  PointerEventEmitter,
  PointerManager,
  registerPointerEventEmitter
} from '@galacean/engine';

@registerPointerEventEmitter()
class UiCanvasEmitter extends PointerEventEmitter {
  protected _init(): void {}
  processRaycast(): void { /* custom hit testing */ }
  processDrag(): void {}
  processDown(pointer: Pointer): void {}
  processUp(pointer: Pointer): void {}
  processLeave(pointer: Pointer): void {}
  dispose(): void {}
}
```

## Wheel Input

`inputManager.wheelDelta` aggregates all wheel events received in the previous frame and returns a `Vector3` (x, y, z). The vector is reset to `(0, 0, 0)` every update; the property is `null` if the manager is uninitialized.

```ts
const { wheelDelta } = engine.inputManager;
if (wheelDelta && wheelDelta.y !== 0) {
  camera.zoom(Math.sign(wheelDelta.y));
}
```

## Best Practices and Notes

- Avoid caching `Pointer` references across frames; always read from `inputManager.pointers` so recycled instances are handled correctly.
- Query input once per update and propagate the result to gameplay systems to keep deterministic ordering.
- Clamp pointer-driven rotations and normalise movement vectors to account for large deltas on high-DPI devices.
- For drag gestures, use both `deltaPosition` and `pressedButtons` to disambiguate multi-button mice.
- When UI needs to react without colliders, register a custom emitter that translates pointer hits to your own event system.
- Remember that `PointerPhase.Stationary` indicates no movement even if buttons remain pressed.

## Quick Reference

- `engine.inputManager.pointers: Readonly<Pointer[]>`
- `engine.inputManager.multiPointerEnabled: boolean`
- `engine.inputManager.wheelDelta: Readonly<Vector3> | null`
- `engine.inputManager.isKeyHeldDown/Down/Up(key?: Keys)`
- `engine.inputManager.isPointerHeldDown/Down/Up(button?: PointerButton)`
- `Pointer` fields: `id`, `phase`, `position`, `deltaPosition`, `button`, `pressedButtons`
- Script callbacks: `onPointerDown`, `onPointerUp`, `onPointerClick`, `onPointerEnter`, `onPointerExit`, `onPointerBeginDrag`, `onPointerDrag`, `onPointerEndDrag`, `onPointerDrop`
- Advanced: extend pointer picking via `@registerPointerEventEmitter`
