# Asset Management

Galacean groups all runtime asset loading, caching, and recovery features behind the `ResourceManager`. Each engine instance owns a single manager (`engine.resourceManager`) that knows how to locate registered loaders, queue requests, expose loading progress, and cooperate with the reference-counted asset system built on `ReferResource`.

## ResourceManager basics

### Getting the manager
```ts
import { WebGLEngine } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const resourceManager = engine.resourceManager;
```

### Loading signatures
`ResourceManager.load` accepts several forms:
```ts
resourceManager.load("textures/diffuse.png");                    // string URL
resourceManager.load({ url: "models/robot.gltf", type: AssetType.GLTF });
resourceManager.load(["textures/albedo.png", "models/robot.gltf"]);
resourceManager.load([
  { url: "env/posx.hdr" },
  { url: "env/negx.hdr" },
]);
```
- When you pass a `LoadItem`, you must provide either `url` **or** `urls` (the latter is used by cube textures). The manager infers `type` from the URL extension if you omit it.
- Per-item overrides (`retryCount`, `retryInterval`, `timeout`, `params`) fall back to manager defaults (`resourceManager.retryCount`, `retryInterval`, and `timeout`).
- Relative paths are resolved against `resourceManager.baseUrl` when it is not `null`.

All overloads return an `AssetPromise`, which is Promise-like and works with `await`, but also exposes progress and cancellation helpers.

## AssetPromise in practice
```ts
const promise = resourceManager.load(["textures/diffuse.png", "models/robot.gltf"]);
promise
  .onProgress(
    (loaded, total) => console.log(`batch: ${loaded}/${total}`),
    (url, loaded, total) => console.log(`${url}: ${loaded}/${total}`)
  )
  .then(([texture, gltf]) => { /* use assets */ })
  .catch(console.error);

// Cancel the entire batch if it is no longer needed.
promise.cancel();
```
- `AssetPromise` implements the standard `then/catch/finally` chain, so `await resourceManager.load(...)` works as expected.
- Use `.onProgress` for both aggregate and per-item progress callbacks.
- `.cancel()` invokes loader-specific cancellation if the request is still pending.

`ResourceManager.cancelNotLoaded()` builds on the same mechanism. Call it with no arguments to abort every queued load, with one URL, or with an array of URLs to cancel selectively.

## Caching & retrieval
Most loaders opt into caching by default. When a cached asset is requested again, the manager resolves immediately without reissuing network requests.

```ts
const texture = await resourceManager.load<Texture2D>("textures/wood.png");
const fromCache = resourceManager.getFromCache<Texture2D>("textures/wood.png");
```
- Loaders created with `@resourceLoader(..., useCache = false)` (built-in examples: `AssetType.Text`, `AssetType.JSON`, `AssetType.Buffer`) always bypass the cache.
- `resourceManager.findResourcesByType(Constructor)` returns all currently tracked `ReferResource` instances of that type.
- `resourceManager.getAssetPath(instanceId)` lets you map a resource back to the URL that produced it.

## Retry, timeout, and base URL defaults
```ts
resourceManager.retryCount = 2;        // per-item default, can be overridden on LoadItem
resourceManager.retryInterval = 500;   // ms between retries
resourceManager.timeout = 10_000;      // ms before the request aborts
resourceManager.baseUrl = "https://cdn.example.com/assets/";
```
The underlying `request` helper honors these values and exposes per-request overrides via `LoadItem` or a custom loader.

## Reference counting & garbage collection
All loadable engine assets derive from `ReferResource` and participate in reference counting. Components increment counts automatically when they reference resources; counts drop when components release or destroy the reference. Call `resourceManager.gc()` to try releasing every referable whose `refCount` has fallen to zero.

```ts
resourceManager.gc();                 // normal sweep
resourceManager.gc();                 // respects isGCIgnored flags

texture.isGCIgnored = true;           // opt-out of automatic GC when required
```
Manual ownership (for example, when you create procedural textures) should call `addRef`/`removeRef` on the resource or `destroy()` it when finished.

## Graphics context recovery
`GraphicsResource` derivatives (textures, buffers, render targets) automatically register themselves so the manager can:
- Flag the content as lost when WebGL reports a context loss.
- Rebuild GPU objects when the context is restored.

For custom GPU objects or resources populated from URLs at runtime, create a `ContentRestorer` and register it:
```ts
class CustomTextureRestorer extends ContentRestorer<Texture2D> {
  constructor(texture: Texture2D, private url: string) {
    super(texture);
  }
  restoreContent() {
    return request<HTMLImageElement>(this.url).then((image) => {
      this.resource.setImageSource(image);
      this.resource.generateMipmaps();
      return this.resource;
    });
  }
}

resourceManager.addContentRestorer(new CustomTextureRestorer(texture, url));
```
`ContentRestorer.restoreContent` should return an `AssetPromise` or void; the manager awaits all promises before resuming rendering after a context restore.

## Custom loaders
Register new loaders with the `@resourceLoader` decorator so the manager can resolve asset types and extensions.
```ts
@resourceLoader("FBX", ["fbx"], true)
export class FBXLoader extends Loader<FBXResource> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<FBXResource> {
    return new AssetPromise((resolve, reject) => {
      // implement fetch + parse, call resolve/reject when done
    });
  }
}
```
- The first argument is the asset `type` string. You can reference this string in `LoadItem.type`.
- The extension list seeds the type inference table used by `ResourceManager.load("file.ext")`.
- The optional `useCache` flag controls whether successfully loaded assets are stored in the cache.

All loaders receive the resolved `LoadItem` (with retry/timeout already merged) and the manager instance so they can queue sub-loads or register referable resources.

## AssetType reference
Galacean ships the following asset types (see `AssetType` enum):

| Type | Description | Cached?* |
| --- | --- | --- |
| `Text` | Plain text files | No |
| `JSON` | Parsed JSON | No |
| `Buffer` | Binary `ArrayBuffer` | No |
| `Texture2D`, `TextureCube`, `KTX`, `KTXCube`, `KTX2` | Texture assets | Yes |
| `GLTF` | glTF or glb packages | Yes |
| `AnimationClip`, `AnimatorController` | Animation data | Yes |
| `Prefab`, `Scene`, `Project` | Editor-authored assets | Yes |
| `Mesh`, `PrimitiveMesh` | Mesh resources | Yes |
| `Material`, `Shader`, `ShaderChunk` | Rendering resources | Yes |
| `Sprite`, `SpriteAtlas` | 2D sprite data | Yes |
| `Env`, `HDR` | Environment lighting data | Yes |
| `Font`, `SourceFont` | Font data | Yes |
| `Audio` | Audio clips (mp3/ogg/wav) | Yes |
| `PhysicsMaterial` | Physics material presets | Yes |

*Caching is determined by the loader. Built-in Text/JSON/Buffer loaders opt out of caching; all other shipped loaders set `useCache = true`.

## Usage patterns

### Loading with progress & cancellation
```ts
const loadTask = resourceManager.load([
  { url: "textures/ground.png" },
  { url: "models/outdoor.glb", retryCount: 3 }
]);

const cancel = () => loadTask.cancel();

loadTask.onProgress(
  (loaded, total) => updateOverallProgress(loaded / total),
  (url, loaded, total) => updateRow(url, loaded / total)
);

const [texture, glb] = await loadTask;
```

### Loading cube textures with `urls`
```ts
const cubeTexture = await resourceManager.load<TextureCube>({
  type: AssetType.TextureCube,
  urls: ["px.png", "nx.png", "py.png", "ny.png", "pz.png", "nz.png"],
});
```

### Retrieving cached assets safely
```ts
let cached = resourceManager.getFromCache<Texture2D>("textures/ground.png");
if (!cached) {
  cached = await resourceManager.load("textures/ground.png");
}
```

### Releasing memory when leaving a scene
```ts
// Drop entity references (which decreases ref counts)
scene.destroy();

// Sweep referable assets whose refCount hit 0
resourceManager.gc();
```

## Best practices
- Prefer `await resourceManager.load()` or chain `AssetPromise` to take advantage of progress callbacks.
- Call `resourceManager.cancelNotLoaded()` when changing scenes or aborting downloads to avoid wasted bandwidth.
- Use manager-level defaults (`retryCount`, `retryInterval`, `timeout`) to centralize network policy.
- Keep long-lived shared assets (`isGCIgnored = true`) to prevent them from being reclaimed during GC sweeps.
- Register custom `ContentRestorer`s when you construct GPU resources manually so the engine can rebuild them after context loss.
- When extending the loader suite, always use the decorator so type inference and caching stay consistent.

## Notes
- `ResourceManager.load` understands editor-specific virtual paths and sub-packaged assets; API consumers typically only need to provide URLs.
- Sub-asset addressing (e.g., `model.gltf?q=meshes[0]`) is handled internally for glTF and prefab loaders—no extra parsing is required in user code.
- All API surface documented here is available in `packages/core/src/asset` and used throughout the engine; there is no separate runtime service to enable.
