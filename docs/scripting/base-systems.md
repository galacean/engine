# Base Systems

Galacean exposes several foundational utilities that almost every runtime feature builds upon. Understanding these base systems—event dispatching, logging, time management, and engine-bound object lifecycles—helps you integrate custom gameplay logic with the engine’s core services.

## EventDispatcher
`EventDispatcher` implements a lightweight publish/subscribe mechanism. The class is designed for inheritance (`Engine`, `Entity`, `Scene`, and many subsystems extend it) but can also be composed when needed.

```ts
import { EventDispatcher, WebGLEngine } from "@galacean/engine";

class GameManager extends EventDispatcher {
  private _score = 0;

  get score(): number {
    return this._score;
  }

  addScore(points: number): void {
    this._score += points;
    this.dispatch("scoreChanged", { score: this._score, delta: points });
  }
}

const manager = new GameManager();
const handler = ({ score, delta }) => console.log(`+${delta}, total: ${score}`);

manager.on("scoreChanged", handler);
manager.addScore(10);
manager.off("scoreChanged", handler);
```

Key API surface:
- `on(event, fn)` / `once(event, fn)` register persistent or one-shot listeners.
- `off(event, fn?)` removes listeners; omit `fn` to clear every listener for that event.
- `removeAllEventListeners(event?)` drops listeners for one event or all events.
- `hasEvent`, `eventNames`, and `listenerCount` expose diagnostics.
- `dispatch(event, data?)` synchronously invokes listeners. One-shot listeners automatically unregister themselves after invocation.

The engine itself extends `EventDispatcher` and currently emits:
- `"run"` once the main loop starts.
- `"shutdown"` during shutdown.
- `"devicelost"` and `"devicerestored"` around WebGL context loss.

```ts
const engine = await WebGLEngine.create({ canvas: "canvas" });
engine.on("devicerestored", () => rebuildUserTextures());
```

## Logger
`Logger` is a simple wrapper around the browser console. Logging is disabled by default to avoid noisy output—call `Logger.enable()` when you need diagnostics.

```ts
import { Logger } from "@galacean/engine";

Logger.enable();
Logger.debug("Frame begin");
Logger.info("Loaded scene", sceneName);
Logger.warn("Missing lightmap for", entity.name);
Logger.error("Failed to load", err);

if (Logger.isEnabled) {
  Logger.info("Verbose logging is active");
}

Logger.disable();
```

`Logger.enable()` binds `debug/info/warn/error` to their respective console methods; `Logger.disable()` replaces them with no-ops. The `isEnabled` flag mirrors the current state.

## Time
`engine.time` centralizes frame timing. Values are updated once per engine tick and feed both scripting logic and shaders.

```ts
const { time } = engine;

function update() {
  const dt = time.deltaTime;            // scaled delta (respects timeScale & maximumDeltaTime)
  const actual = time.actualDeltaTime;  // unscaled delta
  totalDistance += speed * dt;
}
```

Important properties:
- `frameCount`: total frames since the engine started.
- `deltaTime` / `elapsedTime`: scaled timing controlled by `timeScale`.
- `actualDeltaTime` / `actualElapsedTime`: real clock time (ignores `timeScale` and `maximumDeltaTime`).
- `maximumDeltaTime`: clamps large frame steps before scaling (default `0.333333` seconds).
- `timeScale`: global multiplier for the simulation (set to `0` to pause gameplay while UI continues to receive actual time).

## EngineObject
Anything that belongs to an engine instance derives from `EngineObject`. This base class provides:
- `instanceId`: a unique identifier within the process.
- `engine`: back-reference to the owning `Engine`.
- `destroyed`: indicates whether `destroy()` has been called.

```ts
import { EngineObject, Engine } from "@galacean/engine";

class ManagedHandle extends EngineObject {
  constructor(engine: Engine) {
    super(engine);
  }

  protected override _onDestroy(): void {
    // Always release custom resources first.
    releaseNativeHandle();
    // Call base last so ResourceManager bookkeeping stays intact.
    super._onDestroy();
  }
}

const handle = new ManagedHandle(engine);
handle.destroy();
```

`EngineObject.destroy()` calls `_onDestroy()` once and marks the instance as destroyed. The default implementation unregisters the object from the `ResourceManager`, so overrides should end with `super._onDestroy()` unless you intentionally bypass that behavior.

## Quick reference
| System | Key types | Highlights |
| --- | --- | --- |
| Events | `EventDispatcher` (and any subclass) | `on`, `once`, `off`, `removeAllEventListeners`, `dispatch`, diagnostics helpers. |
| Logging | `Logger` | `enable/disable`, `debug/info/warn/error`, `isEnabled`. |
| Timing | `Time` via `engine.time` | `frameCount`, `deltaTime`, `actualDeltaTime`, `timeScale`, `maximumDeltaTime`, shader uniforms (`scene_ElapsedTime`, `scene_DeltaTime`). |
| Lifetimes | `EngineObject` | `instanceId`, `engine`, `destroyed`, override `_onDestroy()` for cleanup. |

## Best practices
- Favor `EventDispatcher` for decoupled communication between components or gameplay systems. Remember to remove listeners (`off` or `removeAllEventListeners`) when entities or scripts are destroyed.
- Enable `Logger` only during development or when diagnosing issues; disable it in production builds to avoid unnecessary console work.
- Use `engine.time.deltaTime` for simulation updates and `actualDeltaTime` for UI or analytics that must ignore pauses.
- When extending `EngineObject`, encapsulate external resources and release them in `_onDestroy()`; avoid reusing instances after `destroyed` becomes `true`.
- Listen to engine-wide events such as `"devicelost"`/`"devicerestored"` if you maintain custom GPU resources.
