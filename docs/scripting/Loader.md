# Loader System

Galacean's Loader system is the cornerstone of resource loading architecture, providing a unified, extensible framework for loading different asset types. The system supports custom loader development, resource caching, content restoration, and type-safe serialization while maintaining high performance across web and mobile platforms.

## Overview

The Loader system provides comprehensive asset loading capabilities:

- **Extensible Architecture**: Plugin-based design for custom asset types and formats
- **Type Safety**: Generic-based loader system with compile-time type checking  
- **Caching Strategy**: Intelligent resource caching with memory management
- **Format Support**: Built-in loaders for textures, models, audio, fonts, and more
- **Content Restoration**: Automatic recovery of loaded resources after context loss
- **Serialization**: Class registration system for runtime type resolution
- **Performance**: Optimized loading pipelines with parallel processing support

The system integrates seamlessly with ResourceManager and supports both eager and lazy loading patterns.

## Quick Start

```ts
import { WebGLEngine, Loader, AssetType, Texture2D, GLTFResource } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const resourceManager = engine.resourceManager;

// Load single asset
const texture = await resourceManager.load<Texture2D>({
  url: "textures/brick.jpg",
  type: AssetType.Texture2D
});

// Load multiple assets
const [model, normalMap] = await resourceManager.load([
  { url: "models/character.gltf", type: AssetType.GLTF },
  { url: "textures/character-normal.png", type: AssetType.Texture2D }
]);

// Load with custom parameters
const compressedTexture = await resourceManager.load<Texture2D>({
  url: "textures/terrain.ktx2",
  type: AssetType.KTX2,
  params: {
    format: "RGBA_ASTC_4x4",
    generateMipmaps: true
  }
});

// Check loading progress
const promise = resourceManager.load({ url: "large-model.gltf", type: AssetType.GLTF });
promise.onProgress((progress) => {
  console.log(`Loading: ${(progress * 100).toFixed(1)}%`);
});
const gltfResource = await promise;
```

## Built-in Loaders

### Texture Loaders

```ts
// Standard image formats
const diffuse = await resourceManager.load<Texture2D>({
  url: "diffuse.jpg",
  type: AssetType.Texture2D,
  params: {
    wrapModeU: TextureWrapMode.Repeat,
    wrapModeV: TextureWrapMode.Repeat,
    generateMipmaps: true
  }
});

// Compressed texture formats
const ktxTexture = await resourceManager.load<Texture2D>({
  url: "compressed.ktx",
  type: AssetType.KTX
});

const ktx2Texture = await resourceManager.load<Texture2D>({
  url: "compressed.ktx2", 
  type: AssetType.KTX2,
  params: {
    targetFormat: "ETC1_RGB"
  }
});

// Cube textures for skyboxes
const cubeTexture = await resourceManager.load<TextureCube>({
  url: "skybox.hdr",
  type: AssetType.HDR
});
```

### Model Loaders

```ts
// GLTF/GLB models with full scene support
const gltfResource = await resourceManager.load<GLTFResource>({
  url: "models/scene.gltf",
  type: AssetType.GLTF
});

// Access GLTF content
const { defaultSceneRoot, scenes, animations, materials } = gltfResource;
rootEntity.addChild(defaultSceneRoot);

// Primitive meshes
const sphereMesh = await resourceManager.load({
  url: "primitive://sphere",
  type: AssetType.Mesh,
  params: { radius: 1, segments: 32 }
});

// Custom mesh data
const bufferMesh = await resourceManager.load({
  url: "meshes/custom.mesh",
  type: AssetType.Mesh
});
```

### Material and Shader Loaders

```ts
// Material definitions
const material = await resourceManager.load({
  url: "materials/metal.material",
  type: AssetType.Material
});

// Shader files
const shader = await resourceManager.load({
  url: "shaders/custom.shader",
  type: AssetType.Shader
});

// Note: ShaderChunk loading is handled internally by the shader system
// and is not directly exposed through AssetType
```

### Audio and Font Loaders

```ts
// Audio assets
const audioClip = await resourceManager.load({
  url: "audio/music.mp3",
  type: AssetType.Audio
});

// Font resources
const font = await resourceManager.load({
  url: "fonts/roboto.ttf",
  type: AssetType.Font
});

// Source fonts for text rendering
const sourceFont = await resourceManager.load({
  url: "fonts/arial.json",
  type: AssetType.SourceFont
});
```

## Custom Loader Development

### Basic Loader Implementation

```ts
import { Loader, AssetPromise, LoadItem, ResourceManager, AssetType } from "@galacean/engine";

// Define custom asset type
export class CustomAsset {
  constructor(public data: any, public metadata: object) {}
}

// Implement custom loader
@resourceLoader(AssetType.Buffer, ["custom"])
export class CustomAssetLoader extends Loader<CustomAsset> {
  constructor() {
    super(true); // Enable caching
  }

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<CustomAsset> {
    return new AssetPromise((resolve, reject, setProgress) => {
      const request = resourceManager.request<ArrayBuffer>(item.url, {
        ...item,
        type: "arraybuffer"
      });

      request.onProgress = setProgress;
      
      request.then((buffer) => {
        try {
          // Custom parsing logic
          const data = this.parseCustomFormat(buffer);
          const metadata = this.extractMetadata(buffer);
          
          const asset = new CustomAsset(data, metadata);
          resolve(asset);
        } catch (error) {
          reject(error);
        }
      }).catch(reject);
    });
  }

  private parseCustomFormat(buffer: ArrayBuffer): any {
    // Implement custom format parsing
    const view = new DataView(buffer);
    // ... parsing logic
    return {};
  }

  private extractMetadata(buffer: ArrayBuffer): object {
    // Extract metadata from buffer
    return {};
  }
}
```

### Advanced Loader with Dependencies

```ts
@resourceLoader(AssetType.Prefab, ["prefab"])
export class PrefabLoader extends Loader<PrefabResource> {
  constructor() {
    super(true);
  }

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<PrefabResource> {
    return new AssetPromise(async (resolve, reject, setProgress) => {
      try {
        // Load prefab definition
        const prefabData = await resourceManager.request<any>(item.url, {
          ...item,
          type: "json"
        });

        setProgress(0.3);

        // Load dependent assets
        const dependencies = this.extractDependencies(prefabData);
        const dependentAssets = await Promise.all(
          dependencies.map(dep => resourceManager.load(dep))
        );

        setProgress(0.8);

        // Create prefab resource
        const prefabResource = new PrefabResource(item.url);
        prefabResource.data = prefabData;
        prefabResource.dependencies = dependentAssets;

        setProgress(1.0);
        resolve(prefabResource);
      } catch (error) {
        reject(error);
      }
    });
  }

  private extractDependencies(prefabData: any): LoadItem[] {
    // Extract asset dependencies from prefab data
    const dependencies: LoadItem[] = [];
    // ... dependency extraction logic
    return dependencies;
  }
}
```

## Loading Strategies

### Preloading Strategy

```ts
// Preload critical assets
const criticalAssets = [
  { url: "textures/ui-atlas.png", type: AssetType.Texture2D },
  { url: "models/player.gltf", type: AssetType.GLTF },
  { url: "audio/bgm.mp3", type: AssetType.Audio }
];

// Load with progress tracking
const totalAssets = criticalAssets.length;
let loadedCount = 0;

const promises = criticalAssets.map(asset => {
  const promise = resourceManager.load(asset);
  promise.then(() => {
    loadedCount++;
    console.log(`Loaded ${loadedCount}/${totalAssets} assets`);
  });
  return promise;
});

await Promise.all(promises);
console.log("All critical assets loaded");
```

### Lazy Loading Strategy

```ts
class AssetManager {
  private assetCache = new Map<string, Promise<any>>();

  async loadOnDemand<T>(url: string, type: AssetType): Promise<T> {
    if (!this.assetCache.has(url)) {
      const promise = resourceManager.load<T>({ url, type });
      this.assetCache.set(url, promise);
    }
    return this.assetCache.get(url)!;
  }

  async loadLevel(levelId: string) {
    // Load level-specific assets lazily
    const levelConfig = await this.loadOnDemand(`levels/${levelId}.json`, AssetType.JSON);
    const levelAssets = await Promise.all(
      levelConfig.assets.map(asset => this.loadOnDemand(asset.url, asset.type))
    );
    return { config: levelConfig, assets: levelAssets };
  }
}
```

### Memory Management

```ts
// Resource cleanup when no longer needed
class ResourceLifecycleManager {
  private resourceRefs = new Map<string, number>();

  addReference(url: string): void {
    const count = this.resourceRefs.get(url) || 0;
    this.resourceRefs.set(url, count + 1);
  }

  removeReference(url: string): void {
    const count = this.resourceRefs.get(url) || 0;
    if (count <= 1) {
      // Last reference, cleanup resource
      resourceManager.cancelNotLoaded(url);
      resourceManager.gc(); // Trigger garbage collection
      this.resourceRefs.delete(url);
    } else {
      this.resourceRefs.set(url, count - 1);
    }
  }

  cleanup(): void {
    // Force cleanup of all managed resources
    resourceManager.gc();
    this.resourceRefs.clear();
  }
}
```

## Error Handling and Recovery

### Retry Logic

```ts
class RobustLoader {
  async loadWithRetry<T>(
    item: LoadItem, 
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await resourceManager.load<T>(item);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          console.warn(`Load attempt ${attempt + 1} failed, retrying in ${retryDelay}ms...`);
          await this.delay(retryDelay);
          retryDelay *= 2; // Exponential backoff
        }
      }
    }
    
    throw new Error(`Failed to load ${item.url} after ${maxRetries + 1} attempts: ${lastError.message}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Fallback Resources

```ts
class FallbackResourceManager {
  private fallbacks = new Map<string, string>();

  registerFallback(resourceType: string, fallbackUrl: string): void {
    this.fallbacks.set(resourceType, fallbackUrl);
  }

  async loadWithFallback<T>(item: LoadItem): Promise<T> {
    try {
      return await resourceManager.load<T>(item);
    } catch (error) {
      const fallbackUrl = this.fallbacks.get(item.type.toString());
      if (fallbackUrl) {
        console.warn(`Failed to load ${item.url}, using fallback: ${fallbackUrl}`);
        return await resourceManager.load<T>({ ...item, url: fallbackUrl });
      }
      throw error;
    }
  }
}

// Setup fallbacks
const fallbackManager = new FallbackResourceManager();
fallbackManager.registerFallback(AssetType.Texture2D.toString(), "textures/missing.png");
fallbackManager.registerFallback(AssetType.GLTF.toString(), "models/error.gltf");
```

## Performance Optimization

### Loading Profiling

```ts
class LoadingProfiler {
  private stats = new Map<string, { count: number; totalTime: number; avgTime: number }>();

  async profiledLoad<T>(item: LoadItem): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await resourceManager.load<T>(item);
      const loadTime = performance.now() - startTime;
      
      this.updateStats(item.type.toString(), loadTime);
      console.log(`Loaded ${item.url} in ${loadTime.toFixed(2)}ms`);
      
      return result;
    } catch (error) {
      const failTime = performance.now() - startTime;
      console.error(`Failed to load ${item.url} after ${failTime.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  private updateStats(type: string, loadTime: number): void {
    const current = this.stats.get(type) || { count: 0, totalTime: 0, avgTime: 0 };
    current.count++;
    current.totalTime += loadTime;
    current.avgTime = current.totalTime / current.count;
    this.stats.set(type, current);
  }

  getStats(): Map<string, { count: number; totalTime: number; avgTime: number }> {
    return new Map(this.stats);
  }
}
```

### Concurrent Loading Limits

```ts
class ConcurrentLoadManager {
  private concurrentLimit = 6; // Browser typical limit
  private activeLoads = 0;
  private pendingQueue: (() => void)[] = [];

  async load<T>(item: LoadItem): Promise<T> {
    return new Promise((resolve, reject) => {
      const loadFunction = async () => {
        this.activeLoads++;
        try {
          const result = await resourceManager.load<T>(item);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeLoads--;
          this.processQueue();
        }
      };

      if (this.activeLoads < this.concurrentLimit) {
        loadFunction();
      } else {
        this.pendingQueue.push(loadFunction);
      }
    });
  }

  private processQueue(): void {
    if (this.pendingQueue.length > 0 && this.activeLoads < this.concurrentLimit) {
      const nextLoad = this.pendingQueue.shift()!;
      nextLoad();
    }
  }
}
```

## API Reference

```apidoc
Loader<T>:
  Properties:
    useCache: boolean
      - Controls whether loaded resources are cached for reuse.

  Methods:
    constructor(useCache: boolean)
      - Creates a new loader instance with caching configuration.
    initialize(engine: Engine, configuration: EngineConfiguration): Promise<void>
      - Optional initialization method called during engine setup.
    load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<T>
      - Main loading method that must be implemented by subclasses.

LoadItem:
  Properties:
    url: string
      - URL or path to the resource to load.
    type: AssetType
      - Type identifier for the resource format.
    params?: any
      - Optional parameters specific to the loader type.

AssetPromise<T>:
  Properties:
    onProgress: (progress: number) => void
      - Callback for loading progress updates (0.0 to 1.0).

  Methods:
    then(onResolve: (value: T) => void, onReject?: (error: Error) => void): Promise<T>
      - Standard Promise.then() implementation.
    catch(onReject: (error: Error) => void): Promise<T>
      - Standard Promise.catch() implementation.

ResourceManager:
  Methods:
    load<T>(item: LoadItem | LoadItem[]): AssetPromise<T> | AssetPromise<T[]>
      - Loads single or multiple resources with type safety.
    request<T>(url: string, config?: RequestConfig): Promise<T>
      - Low-level request method for custom loading logic.
    cancelNotLoaded(url: string): void
      - Cancels pending loads for the specified URL.
    gc(): void
      - Triggers garbage collection of unused resources.
```

## Best Practices

### Type Safety
- Always specify generic types when loading resources
- Use AssetType constants rather than strings for type identification
- Implement proper error handling for loading failures

### Performance
- Enable caching for reusable resources
- Use concurrent loading limits to prevent browser connection saturation
- Implement resource pooling for frequently loaded/unloaded assets
- Profile loading times to identify bottlenecks

### Error Resilience
- Implement retry logic for network-dependent loads
- Provide fallback resources for critical assets
- Use loading progress indicators for user experience
- Log loading failures for debugging and analytics

### Memory Management
- Call resourceManager.gc() when appropriate to free unused resources
- Use weak references for cached resources when possible
- Monitor memory usage patterns during resource-intensive operations
- Implement cleanup strategies for level transitions
