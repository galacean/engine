# Engine

Galacean's `Engine` class is the central orchestrator that manages all core systems including rendering, physics, input, resources, and scene management. The Engine coordinates the frame loop, handles device context, provides cross-system communication, and serves as the primary entry point for creating 3D applications.

## Overview

The Engine manages multiple interconnected systems:
- **Rendering Pipeline**: Frame-based rendering with post-processing support
- **Resource Management**: Asset loading, caching, and memory management
- **Scene Management**: Multiple scene support with activation control
- **Input System**: Mouse, keyboard, and touch event handling
- **Physics Integration**: Optional physics engine coordination
- **XR Support**: Virtual and augmented reality capabilities
- **Timing Control**: Frame rate management and synchronization

Each Engine instance is bound to a specific rendering context (Canvas) and provides isolated execution environments for different applications or views.

## Quick Start

```ts
import { WebGLEngine } from "@galacean/engine";

// Create engine with canvas
const engine = await WebGLEngine.create({ 
  canvas: "canvas-id" // or HTMLCanvasElement
});

// Access core systems
const scene = engine.sceneManager.activeScene;
const resourceManager = engine.resourceManager;
const inputManager = engine.inputManager;

// Create and start the main loop
const rootEntity = scene.createRootEntity("Root");
engine.run(); // Start the frame loop

// Pause/resume as needed
engine.pause();
engine.resume();

// Clean shutdown
engine.destroy();
```

## Engine Creation and Configuration

```ts
import { WebGLEngine, PhysXPhysics, ColorSpace } from "@galacean/engine";

// Basic configuration
const engine = await WebGLEngine.create({
  canvas: "canvas-id", // string ID or HTMLCanvasElement
  graphicDeviceOptions: {
    antialias: true,
    alpha: false,
    stencil: true
  }
});

// Advanced configuration with all options
const engine = await WebGLEngine.create({
  canvas: document.getElementById("canvas"),
  colorSpace: ColorSpace.Gamma, // or ColorSpace.Linear
  graphicDeviceOptions: {
    antialias: true,
    alpha: false,
    stencil: true,
    webGLMode: "auto" // "webgl1", "webgl2", or "auto"
  },
  physics: new PhysXPhysics(), // Optional physics engine
  input: {
    pointerTarget: document // Set touch event listener source
  },
  gltf: {
    meshOpt: { workerCount: 4 } // GLTF loader configuration
  },
  ktx2Loader: {
    workerCount: 2 // KTX2 loader configuration
  }
});

// Initialize physics after creation (alternative approach)
engine.physicsManager.initialize(PhysXPhysics);
```

## Core Systems Access

### Resource Management

```ts
import { AssetType } from "@galacean/engine";

const resourceManager = engine.resourceManager;

// Load single asset
const texture = await resourceManager.load({
  url: "path/to/texture.jpg",
  type: AssetType.Texture2D
});

// Load multiple assets
const [texture2D, cubeTexture] = await resourceManager.load([
  { url: "path/to/texture.jpg", type: AssetType.Texture2D },
  {
    url: ["px.jpg", "nx.jpg", "py.jpg", "ny.jpg", "pz.jpg", "nz.jpg"],
    type: AssetType.TextureCube
  }
]);

// Load GLTF/GLB models
const scene = await resourceManager.load({
  url: "path/to/model.glb",
  type: AssetType.GLTF
});

// Manage resource lifecycle - force garbage collection
resourceManager.gc(); // Releases unused cached resources
```

### Scene Management

```ts
import { Scene } from "@galacean/engine";

const sceneManager = engine.sceneManager;

// Access default active scene
const activeScene = sceneManager.activeScene;

// Create and manage multiple scenes
const gameScene = new Scene(engine, "GameScene");
const menuScene = new Scene(engine, "MenuScene");

// Add scenes to engine
sceneManager.addScene(gameScene);
sceneManager.addScene(menuScene);

// Remove scenes
sceneManager.removeScene(menuScene);

// Load scene from asset
const loadedScene = await sceneManager.loadScene("path/to/scene.json");

// Merge scenes
sceneManager.mergeScenes(menuScene, gameScene); // Merge menuScene into gameScene

// Access all scenes
const allScenes = sceneManager.scenes; // ReadonlyArray<Scene>
console.log(`Total scenes: ${allScenes.length}`);

// Destroy scene (also removes it from engine)
gameScene.destroy();
```

### Input Handling

```ts
import { Keys } from "@galacean/engine";

const inputManager = engine.inputManager;

// Check keyboard input states
if (inputManager.isKeyHeldDown(Keys.Space)) {
  // Space key is currently being held down
}

if (inputManager.isKeyDown(Keys.Space)) {
  // Space key was pressed this frame
}

if (inputManager.isKeyUp(Keys.Space)) {
  // Space key was released this frame
}

// Access pointer data (supports multiple pointers)
const pointer0 = inputManager.pointers[0];
if (pointer0) {
  console.log("Pointer position:", pointer0.position);
  console.log("Pointer delta:", pointer0.deltaPosition);
}

// Check pointer states
if (inputManager.isPointerDown()) {
  // Mouse/touch is currently pressed
}
```

## Frame Loop and Timing

### Frame Rate Control

```ts
// V-sync based timing (default)
engine.vSyncCount = 1; // 60fps on 60Hz display
engine.vSyncCount = 2; // 30fps on 60Hz display
engine.vSyncCount = 0; // Disable v-sync, use target frame rate

// Custom frame rate (when v-sync disabled)
engine.targetFrameRate = 30;  // Target 30 FPS
engine.targetFrameRate = 120; // Target 120 FPS
engine.targetFrameRate = Number.POSITIVE_INFINITY; // Unlimited

// Access timing information
const time = engine.time;
console.log("Delta time:", time.deltaTime);
console.log("Total time:", time.totalTime);
console.log("Frame count:", time.frameCount);
```

### Manual Frame Control

```ts
// Manual update (when not using engine.run())
class CustomGameLoop {
  constructor(private engine: Engine) {}

  start(): void {
    this.update();
  }

  private update = (): void => {
    // Manual frame update
    engine.update();
    
    // Continue loop
    requestAnimationFrame(this.update);
  }
}

// Usage
const gameLoop = new CustomGameLoop(engine);
gameLoop.start();
```

## Engine Lifecycle

### Running and Control

```ts
// Start the engine main loop
engine.run(); // Begins automatic frame updates

// Check engine state
console.log(engine.isPaused); // false when running

// Pause execution
engine.pause(); // Stops frame updates and input processing

// Resume execution  
engine.resume(); // Resumes from where it was paused

// Clean shutdown
engine.destroy(); // Releases all resources and stops execution

// Check if destroyed
console.log(engine.destroyed); // true after destroy() is called
```

### Event Handling

```ts
// Engine lifecycle methods (not events)
engine.run(); // Start the engine
engine.pause(); // Pause execution
engine.resume(); // Resume from pause
engine.destroy(); // Clean shutdown

// Device context events
engine.on("devicelost", (engine) => {
  console.log("Graphics device lost - rendering suspended");
});

engine.on("devicerestored", (engine) => {
  console.log("Graphics device restored - rendering resumed");
});

// Check engine state
console.log("Is paused:", engine.isPaused);
console.log("Is destroyed:", engine.destroyed);
```

## Post-Processing Pipeline

```ts
import { PostProcessPass, BloomEffect } from "@galacean/engine";

// Add custom post-process pass
class CustomPostProcess extends PostProcessPass {
  constructor(engine: Engine) {
    super(engine);
    // Configure pass
  }

  render(context: RenderContext): void {
    // Custom post-processing logic
  }
}

// Add to engine
const customPass = new CustomPostProcess(engine);
engine.addPostProcessPass(customPass);

// Access all post-process passes
const allPasses = engine.postProcessPasses;
console.log(`${allPasses.length} post-process passes registered`);
```

## Device Management

### Graphics Device Control

```ts
// Simulate device loss (for testing)
engine.forceLoseDevice();

// Simulate device restoration (for testing)
engine.forceRestoreDevice();

// Handle device events automatically
engine.on("devicelost", () => {
  // Engine automatically handles resource cleanup
  console.log("Device lost - pausing rendering");
});

engine.on("devicerestored", () => {
  // Engine automatically restores resources
  console.log("Device restored - resuming rendering");
});
```

### Memory Management

```ts
// Clean up unused resources explicitly
const resourceManager = engine.resourceManager;
resourceManager.gc();

// Maintain your own bookkeeping for loaded assets
const loadedResources = new Set<string>();
loadedResources.add("texture.png");
console.log(`Tracked resources: ${loadedResources.size}`);

// Check engine state
console.log("Engine running:", !engine.isPaused);
console.log("Total entities:", engine.sceneManager.activeScene.rootEntitiesCount);
```

## XR Integration

```ts
import { WebXRDevice } from "@galacean/engine-xr-webxr";

// Create engine with XR support
const engine = await WebGLEngine.create({
  canvas: "canvas",
  xrDevice: new WebXRDevice()
});

// Access XR manager
const xrManager = engine.xrManager;

if (xrManager) {
  // Check XR availability
  const isSupported = await xrManager.isSessionSupported("immersive-vr");
  
  if (isSupported) {
    // Start XR session
    await xrManager.startSession("immersive-vr");
  }
}
```

## Performance Optimization

### Efficient Frame Loop

```ts
class OptimizedEngine {
  private engine: Engine;
  private lastUpdateTime = 0;
  private updateInterval = 1000 / 30; // 30 FPS for game logic

  constructor(engine: Engine) {
    this.engine = engine;
    this.setupOptimizedLoop();
  }

  private setupOptimizedLoop(): void {
    // Separate render and update frequencies
    this.engine.targetFrameRate = 60; // High framerate for smooth rendering
    
    this.engine.on("update", this.onUpdate);
  }

  private onUpdate = (): void => {
    const now = performance.now();
    
    // Run game logic at lower frequency
    if (now - this.lastUpdateTime >= this.updateInterval) {
      this.updateGameLogic();
      this.lastUpdateTime = now;
    }
  }

  private updateGameLogic(): void {
    // Heavy game logic runs at 30fps
    // while rendering continues at 60fps
  }
}
```

### Resource Management Strategy

```ts
class ResourceOptimizer {
  constructor(private engine: Engine) {
    this.setupResourceStrategy();
  }

  private setupResourceStrategy(): void {
    const resourceManager = this.engine.resourceManager;
    
    // Preload critical resources
    this.preloadCriticalAssets();
    
    // Set up periodic cleanup
    setInterval(() => {
      resourceManager.gc();
    }, 30000); // Clean up every 30 seconds
  }

  private async preloadCriticalAssets(): Promise<void> {
    const resourceManager = this.engine.resourceManager;
    
    // Load essential assets at startup
    const criticalAssets = [
      { url: "textures/ui-atlas.png", type: AssetType.Texture2D },
      { url: "models/player.glb", type: AssetType.GLTF },
      { url: "audio/ambient.mp3", type: AssetType.AudioClip }
    ];
    
    await Promise.all(
      criticalAssets.map(asset => resourceManager.load(asset))
    );
  }
}
```

## Advanced Patterns

### Multi-Engine Applications

```ts
class MultiEngineManager {
  private engines: Map<string, Engine> = new Map();

  async createEngine(id: string, canvasId: string): Promise<Engine> {
    const engine = await WebGLEngine.create({ canvas: canvasId });
    this.engines.set(id, engine);
    return engine;
  }

  getEngine(id: string): Engine | undefined {
    return this.engines.get(id);
  }

  pauseAll(): void {
    this.engines.forEach(engine => engine.pause());
  }

  resumeAll(): void {
    this.engines.forEach(engine => engine.resume());
  }

  destroyAll(): void {
    this.engines.forEach(engine => engine.destroy());
    this.engines.clear();
  }
}

// Usage for multi-viewport applications
const manager = new MultiEngineManager();
const mainEngine = await manager.createEngine("main", "main-canvas");
const miniMapEngine = await manager.createEngine("minimap", "minimap-canvas");
```

### Engine Extension Pattern

```ts
class ExtendedEngine {
  private analyticsEnabled = false;
  private frameStats = {
    averageFPS: 0,
    frameCount: 0,
    totalTime: 0
  };

  constructor(private engine: Engine) {
    this.setupExtensions();
  }

  private setupExtensions(): void {
    // Add analytics
    this.setupPerformanceAnalytics();
    
    // Add custom managers
    this.setupCustomSystems();
  }

  private setupPerformanceAnalytics(): void {
    this.engine.on("update", () => {
      if (this.analyticsEnabled) {
        this.updateFrameStats();
      }
    });
  }

  private updateFrameStats(): void {
    const time = this.engine.time;
    this.frameStats.frameCount++;
    this.frameStats.totalTime += time.deltaTime;
    this.frameStats.averageFPS = this.frameStats.frameCount / this.frameStats.totalTime;
    
    // Log performance warnings
    if (time.deltaTime > 0.033) { // > 30 FPS
      console.warn(`Frame time spike: ${time.deltaTime * 1000}ms`);
    }
  }

  enableAnalytics(): void {
    this.analyticsEnabled = true;
  }

  getPerformanceStats(): typeof this.frameStats {
    return { ...this.frameStats };
  }
}
```

### Error Recovery System

```ts
class RobustEngine {
  private recoveryAttempts = 0;
  private maxRecoveryAttempts = 3;

  constructor(private engine: Engine) {
    this.setupErrorRecovery();
  }

  private setupErrorRecovery(): void {
    this.engine.on("devicelost", this.handleDeviceLost);
    this.engine.on("devicerestored", this.handleDeviceRestored);
    
    // Global error handling
    window.addEventListener("error", this.handleGlobalError);
  }

  private handleDeviceLost = (): void => {
    console.log("Device lost - attempting recovery");
    this.recoveryAttempts++;
    
    if (this.recoveryAttempts > this.maxRecoveryAttempts) {
      this.handleFatalError("Too many device recovery attempts");
      return;
    }
    
    // Pause non-essential systems
    this.pauseNonEssentialSystems();
  }

  private handleDeviceRestored = (): void => {
    console.log("Device restored - resuming operation");
    this.recoveryAttempts = 0;
    
    // Resume all systems
    this.resumeAllSystems();
  }

  private handleGlobalError = (event: ErrorEvent): void => {
    console.error("Global error:", event.error);
    
    // Attempt graceful degradation
    this.attemptGracefulDegradation();
  }

  private handleFatalError(message: string): void {
    console.error("Fatal error:", message);
    
    // Notify user and provide recovery options
    this.showErrorDialog(message);
  }

  private pauseNonEssentialSystems(): void {
    // Pause non-critical components
    // Keep essential systems running
  }

  private resumeAllSystems(): void {
    // Resume all paused systems
  }

  private attemptGracefulDegradation(): void {
    // Reduce quality settings
    // Disable non-essential features
  }

  private showErrorDialog(message: string): void {
    // Show user-friendly error message
    // Provide reload/recovery options
  }
}
```

## API Reference

```apidoc
WebGLEngine:
  Static Methods:
    create(config: WebGLEngineConfiguration): Promise<WebGLEngine>
      - Asynchronously create engine instance with configuration.

  Properties:
    canvas: WebCanvas
      - The rendering canvas associated with this engine instance.
    resourceManager: ResourceManager
      - Manages asset loading, caching, and memory management.
    sceneManager: SceneManager
      - Manages scene creation, activation, and lifecycle.
    inputManager: InputManager
      - Handles mouse, keyboard, and touch input events.
    physicsManager: PhysicsManager
      - Manages physics engine integration and initialization.
    xrManager: XRManager | undefined
      - XR/VR manager if XR device was configured during creation.
    time: Time
      - Provides frame timing information (deltaTime, totalTime, frameCount).
    isPaused: boolean
      - Whether the engine frame loop is currently paused.
    destroyed: boolean
      - Whether the engine has been destroyed.

  Frame Control Properties:
    vSyncCount: number
      - Vertical sync frame interval. 0 = disabled, 1 = 60fps, 2 = 30fps (on 60Hz).
    targetFrameRate: number
      - Target FPS when vSyncCount = 0. Use Number.POSITIVE_INFINITY for unlimited.

  Methods:
    run(): void
      - Start the main engine loop with automatic frame updates.
    pause(): void
      - Pause the engine loop and input processing.
    resume(): void
      - Resume the engine from paused state.
    update(): void
      - Manually update one frame (use when not calling run()).
    destroy(): void
      - Shutdown engine and release all resources. Safe to call during frame.

  Device Management Methods:
    forceLoseDevice(): void
      - Simulate graphics device loss (for testing).
    forceRestoreDevice(): void
      - Simulate graphics device restoration (for testing).

  Events:
    "devicelost": (engine: Engine) => void
      - Fired when graphics device is lost.
    "devicerestored": (engine: Engine) => void
      - Fired when graphics device is restored.

WebGLEngineConfiguration:
  canvas: string | HTMLCanvasElement | OffscreenCanvas
    - Canvas ID (string) or canvas object for rendering.
  colorSpace?: ColorSpace
    - Color space configuration (Gamma or Linear).
  graphicDeviceOptions?: WebGLGraphicDeviceOptions
    - Graphics device settings including WebGL mode and context options.
  physics?: Physics
    - Physics engine instance (e.g., new PhysXPhysics()).
  input?: InputConfiguration
    - Input system configuration including pointerTarget.
  gltf?: GLTFConfiguration
    - GLTF loader configuration including meshOpt settings.
  ktx2Loader?: KTX2Configuration
    - KTX2 loader configuration including worker count.
  xrDevice?: XRDevice
    - XR device for VR/AR support.
```

## Best Practices

- **Single Engine Per Canvas**: Each canvas should have its own Engine instance
- **Proper Lifecycle Management**: Always call `destroy()` when done to prevent memory leaks
- **Frame Rate Configuration**: Use v-sync when possible for smooth rendering
- **Resource Preloading**: Load critical assets before starting the main loop
- **Error Handling**: Implement device loss/restore handlers for robust applications
- **Performance Monitoring**: Track frame times and implement quality scaling
- **Graceful Shutdown**: Pause or destroy engines when navigating away from pages
- **Memory Management**: Periodically call resource garbage collection in long-running apps

## Common Issues

**Engine Won't Start**: Ensure canvas exists and is accessible:
```ts
// Wait for DOM if needed
document.addEventListener("DOMContentLoaded", async () => {
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.run();
});
```

**Performance Issues**: Monitor and optimize frame timing:
```ts
engine.on("update", () => {
  if (engine.time.deltaTime > 0.033) { // 30fps threshold
    console.warn("Frame time too high:", engine.time.deltaTime);
    // Implement quality reduction
  }
});
```

**Memory Leaks**: Always destroy engines and clean up references:
```ts
class GameManager {
  private engine?: Engine;

  async init(): Promise<void> {
    this.engine = await WebGLEngine.create({ canvas: "canvas" });
  }

  cleanup(): void {
    if (this.engine && !this.engine.destroyed) {
      this.engine.destroy();
      this.engine = undefined;
    }
  }
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  gameManager.cleanup();
});
```

**Device Context Loss**: Handle gracefully with automatic recovery:
```ts
engine.on("devicelost", () => {
  // Show loading indicator
  showLoadingScreen("Restoring graphics...");
});

engine.on("devicerestored", () => {
  // Hide loading indicator
  hideLoadingScreen();
});
```
