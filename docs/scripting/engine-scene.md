# Engine & Scene

Galacean's `Engine` is the central orchestrator that manages the rendering loop, resource lifecycle, and subsystem coordination. The `Scene` represents a complete 3D environment containing entities, lighting, and post-processing configuration, while `SceneManager` handles multiple scene creation, switching, and merging operations.

## Quick Start

```ts
import { WebGLEngine, Scene, Entity, MeshRenderer, PrimitiveMesh } from "@galacean/engine";

// Create and initialize engine
const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;

// Create a basic entity with mesh
const cubeEntity = scene.createRootEntity("Cube");
const renderer = cubeEntity.addComponent(MeshRenderer);
renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

// Start the render loop
engine.run();
```

- Engine automatically creates a default scene accessible via `sceneManager.activeScene`.
- Call `engine.run()` to start the main loop; use `pause()` and `resume()` for runtime control.
- Scene entities require explicit creation via `createRootEntity()` or constructor + `addRootEntity()`.

## Engine Lifecycle Management

```ts
// Engine configuration and creation
const engine = await WebGLEngine.create({
  canvas: "canvas",
  physics: new PhysXPhysics(),
  graphicDeviceOptions: {
    powerPreference: "high-performance",
    alpha: false,
    depth: true,
    stencil: true
  }
});

// Runtime control
engine.targetFrameRate = 60;  // Limit to 60 FPS
engine.vSyncCount = 1;        // V-sync configuration

// Pause and resume functionality
engine.pause();               // Stops render loop
engine.resume();              // Resumes from pause state

// Cleanup when done
engine.destroy();             // Disposes all resources
```

- `WebGLEngine.create()` initializes WebGL context, creates default scene, and prepares all subsystems.
- `targetFrameRate` controls frame limiting; set to 0 for unlimited framerate.
- `vSyncCount` adjusts vertical synchronization (0 = disabled, 1 = 60Hz, 2 = 30Hz).
- Always call `destroy()` for proper resource cleanup when the application ends.

> **Performance Tip**: Use `pause()` during inactive periods to reduce CPU/GPU usage and battery consumption.

## Scene Management Operations

```ts
const sceneManager = engine.sceneManager;

// Create additional scenes
const gameScene = new Scene(engine, "GameLevel");
const menuScene = new Scene(engine, "MainMenu");

sceneManager.addScene(gameScene);
sceneManager.addScene(menuScene);

// Switch between scenes
sceneManager.activeScene = gameScene;

// Merge scene content
sceneManager.mergeScenes(gameScene, menuScene); // Merge menuScene into gameScene

// Load scene from external source
const loadedScene = await sceneManager.loadScene(sceneUrl);
```

- `SceneManager` maintains a collection of scenes but only renders the `activeScene`.
- Scene switching immediately updates rendering; previous scene remains in memory.
- `mergeScenes()` moves all entities from source to target scene and destroys the source.
- Scene names are optional but useful for debugging and identification.

## Scene Hierarchy Operations

```ts
const scene = engine.sceneManager.activeScene;

// Create entities in scene
const rootEntity = scene.createRootEntity("GameRoot");
const childEntity = new Entity(engine, "Child");
rootEntity.addChild(childEntity);

// Scene-level entity management
scene.addRootEntity(rootEntity);
scene.removeRootEntity(rootEntity);

// Search operations
const foundEntity = scene.findEntityByName("Player");
const deepEntity = scene.findEntityByPath("/GameRoot/Player/Weapon");

// Access root entities
const rootCount = scene.rootEntitiesCount;
const allRoots = scene.rootEntities; // ReadonlyArray<Entity>
```

- Scene maintains a flat array of root entities, each managing their own hierarchy.
- `findEntityByPath()` supports slash-delimited navigation similar to file systems.
- `findEntityByName()` performs depth-first search across all entities in the scene.
- Root entity operations automatically handle activation/deactivation propagation.

## Environment Configuration

```ts
const scene = engine.sceneManager.activeScene;

// Background and ambient lighting
scene.background.mode = BackgroundMode.Sky;
scene.ambientLight.diffuseIntensity = 0.3;
scene.ambientLight.specularIntensity = 0.2;

// Fog configuration
scene.fogMode = FogMode.Linear;
scene.fogColor.set(0.5, 0.5, 0.6, 1.0);
scene.fogStart = 10;
scene.fogEnd = 100;

// Shadow settings
scene.castShadows = true;
scene.shadowResolution = ShadowResolution.Medium;
scene.shadowDistance = 50;
scene.shadowCascades = ShadowCascadesMode.TwoCascades;
```

- Scene background handles skybox, solid color, or texture rendering.
- Ambient light provides global illumination without directional bias.
- Fog affects all rendered objects; exponential modes use `fogDensity` instead of start/end.
- Shadow configuration impacts performance; choose resolution based on quality requirements.

## Post-Processing Integration

```ts
// Engine-level post-processing
const bloomEffect = new BloomEffect();
engine.addPostProcessPass(bloomEffect);

// Scene-specific effects
const scene = engine.sceneManager.activeScene;
scene.postProcessManager.addEffect(new TonemappingEffect());

// Ambient occlusion (requires depth texture)
scene.ambientOcclusion.enabled = true;
scene.ambientOcclusion.quality = AmbientOcclusionQuality.Medium;
```

- Engine post-processing applies to all scenes; scene effects apply only to that scene.
- Post-process order matters; add effects in desired execution sequence.
- Some effects require specific render targets; engine handles allocation automatically.

## Resource Management

```ts
// Engine resource access
const resourceManager = engine.resourceManager;
const texture = await resourceManager.load<Texture2D>("path/to/texture.jpg");

// Scene data management
const shaderData = scene.shaderData;
shaderData.setFloat("u_CustomValue", 1.5);
shaderData.setTexture("u_CustomTexture", texture);

// Physics integration
const physicsScene = scene.physics;
physicsScene.gravity = new Vector3(0, -9.81, 0);
```

- Engine coordinates resource loading across all scenes and systems.
- Scene shader data provides global uniform values accessible in all materials.
- Physics scene manages simulation parameters and collider registration.

## Performance Monitoring

```ts
// Frame timing information
const time = engine.time;
console.log(`FPS: ${1 / time.deltaTime}`);
console.log(`Frame: ${time.frameCount}`);

// Rendering statistics
console.log(`Render calls: ${engine.renderCount}`);

// Device capabilities
if (engine.destroyed) {
  console.log("Engine has been destroyed");
}

// Force device context testing
engine.forceLoseDevice();  // Simulate device loss
engine.forceRestoreDevice(); // Simulate device restoration
```

- `Time` provides frame timing, delta time, and total elapsed time since engine start.
- Engine tracks render call count and other performance metrics internally.
- Device loss testing helps validate application recovery behavior.

## API Reference

```apidoc
Engine:
  Properties:
    canvas: HTMLCanvasElement | OffscreenCanvas
      - Target canvas element for rendering output.
    resourceManager: ResourceManager
      - Central resource loading and caching system.
    sceneManager: SceneManager
      - Scene collection and active scene management.
    settings: EngineSettings
      - Engine configuration and capability information.
    time: Time
      - Frame timing and temporal information.
    targetFrameRate: number
      - Maximum frames per second; 0 = unlimited.
    vSyncCount: number
      - Vertical sync interval (0, 1, 2).
    isPaused: boolean
      - Whether the render loop is currently paused.
    destroyed: boolean
      - Whether the engine has been destroyed.

  Methods:
    static create(config: WebGLEngineConfiguration): Promise<WebGLEngine>
      - Creates and initializes a new WebGL engine instance.
    run(): void
      - Starts the main render loop.
    pause(): void
      - Pauses the render loop without destroying resources.
    resume(): void
      - Resumes the render loop from pause state.
    update(): void
      - Single frame update; called automatically by run().
    destroy(): void
      - Disposes all resources and stops the engine.
    createEntity(name?: string): Entity
      - Creates a detached entity owned by this engine.
    addPostProcessPass(pass: PostProcessPass): void
      - Adds engine-level post-processing effect.
    forceLoseDevice(): void
      - Simulates WebGL context loss for testing.
    forceRestoreDevice(): void
      - Simulates WebGL context restoration for testing.

SceneManager:
  Properties:
    engine: Engine
      - Owning engine instance.
    activeScene: Scene
      - Currently rendering scene.
    scenes: ReadonlyArray<Scene>
      - All scenes managed by this instance.

  Methods:
    addScene(scene: Scene, index?: number): void
      - Adds scene to management collection.
    removeScene(scene: Scene): void
      - Removes scene from collection and deactivates it.
    loadScene(url: string, options?: LoaderOptions): Promise<Scene>
      - Loads scene from external resource.
    mergeScenes(target: Scene, source: Scene): void
      - Moves all entities from source to target scene.

Scene:
  Properties:
    name: string
      - Scene identifier for debugging and management.
    isActive: boolean
      - Whether this scene participates in rendering.
    physics: PhysicsScene
      - Physics simulation instance for this scene.
    background: Background
      - Background rendering configuration.
    ambientLight: AmbientLight
      - Global ambient lighting settings.
    postProcessManager: PostProcessManager
      - Scene-specific post-processing effects.
    shaderData: ShaderData
      - Global shader uniform data for this scene.
    
    // Shadow Configuration
    castShadows: boolean
      - Enable shadow casting globally.
    shadowResolution: ShadowResolution
      - Shadow map texture resolution.
    shadowDistance: number
      - Maximum shadow rendering distance.
    shadowCascades: ShadowCascadesMode
      - Number of cascade splits for directional lights.
    
    // Fog Configuration
    fogMode: FogMode
      - Fog calculation method (Linear, Exponential, ExponentialSquared).
    fogColor: Color
      - Fog color applied to distant objects.
    fogStart: number
      - Linear fog start distance.
    fogEnd: number
      - Linear fog end distance.
    fogDensity: number
      - Exponential fog density parameter.

  Methods:
    createRootEntity(name?: string): Entity
      - Creates and adds new root entity to scene.
    addRootEntity(entity: Entity, index?: number): void
      - Adds existing entity as scene root.
    removeRootEntity(entity: Entity): void
      - Removes root entity from scene hierarchy.
    getRootEntity(index: number): Entity | undefined
      - Gets root entity by index.
    findEntityByName(name: string): Entity | null
      - Depth-first search for entity by name.
    findEntityByPath(path: string): Entity | null
      - Finds entity using slash-delimited path.
```

## Configuration Reference

### WebGLEngineConfiguration

```apidoc
WebGLEngineConfiguration:
  Properties:
    canvas: HTMLCanvasElement | OffscreenCanvas | string
      - Canvas element, OffscreenCanvas, or canvas element ID for rendering.
    physics?: IPhysics
      - Physics system implementation (e.g., PhysXPhysics, LitePhysics).
    xrDevice?: IXRDevice
      - XR device implementation for WebXR support.
    shaderLab?: IShaderLab
      - Custom shader compilation system.
    input?: IInputOptions
      - Input handling configuration options.
    graphicDeviceOptions?: WebGLGraphicDeviceOptions
      - WebGL context and rendering configuration.
```

### WebGLGraphicDeviceOptions

```apidoc
WebGLGraphicDeviceOptions:
  Properties:
    webGLMode?: WebGLMode
      - WebGL version mode (WebGL 1.0 or 2.0).
    alpha?: boolean
      - Whether the canvas has an alpha channel. @defaultValue `true`
    depth?: boolean
      - Whether to enable depth buffer. @defaultValue `true`
    desynchronized?: boolean
      - Whether to enable low-latency rendering mode.
    failIfMajorPerformanceCaveat?: boolean
      - Whether to fail creation if performance is significantly reduced.
    powerPreference?: WebGLPowerPreference
      - GPU power preference: "default", "high-performance", or "low-power".
    premultipliedAlpha?: boolean
      - Whether alpha values are premultiplied. @defaultValue `true`
    preserveDrawingBuffer?: boolean
      - Whether to preserve drawing buffer contents. @defaultValue `false`
    stencil?: boolean
      - Whether to enable stencil buffer. @defaultValue `false`
    xrCompatible?: boolean
      - Whether the context is compatible with WebXR. @defaultValue `false`
```

### Configuration Examples

```typescript
// Basic configuration
const engine = await WebGLEngine.create({
  canvas: "canvas-id"
});

// Full configuration with physics and graphics options
const engine = await WebGLEngine.create({
  canvas: document.getElementById("canvas"),
  physics: new PhysXPhysics(),
  graphicDeviceOptions: {
    webGLMode: WebGLMode.WebGL2,
    powerPreference: "high-performance",
    alpha: false,
    depth: true,
    stencil: true,
    preserveDrawingBuffer: false,
    xrCompatible: true
  }
});

// XR-enabled configuration
const engine = await WebGLEngine.create({
  canvas: "canvas",
  xrDevice: new WebXRDevice(),
  graphicDeviceOptions: {
    xrCompatible: true
  }
});
```

## Best Practices

- **Engine Lifecycle**: Create engine once, reuse across scenes. Destroy only when application terminates.
- **Scene Organization**: Use meaningful entity hierarchies; group related objects under parent entities.
- **Resource Sharing**: Load resources at engine level to share across multiple scenes efficiently.
- **Performance Monitoring**: Track `time.deltaTime` for frame-rate independent animations and logic.
- **Device Recovery**: Implement device loss handlers for robust web deployment.
- **Memory Management**: Use `pause()` instead of `destroy()` for temporary inactivity to avoid re-initialization costs.
