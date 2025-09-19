# Scene Manager

Galacean's Scene Manager provides comprehensive multi-scene management capabilities, enabling complex applications with multiple concurrent scenes, scene transitions, and dynamic scene loading. The SceneManager handles scene lifecycle, activation states, and provides utilities for scene merging and resource management.

The Scene Manager system includes:
- **Multi-Scene Support**: Simultaneous rendering and updating of multiple scenes
- **Scene Lifecycle Management**: Adding, removing, and destroying scenes
- **Dynamic Scene Loading**: Asynchronous loading of scene assets from URLs
- **Scene Merging**: Combining multiple scenes into a single scene
- **Activation Control**: Managing which scenes participate in rendering and updates
- **Resource Management**: Automatic cleanup and memory management

## Quick Start

```ts
import { WebGLEngine, Scene, SceneManager } from "@galacean/engine";

// Create engine and access scene manager
const engine = await WebGLEngine.create({ canvas: "canvas" });
const sceneManager = engine.sceneManager;

// Create multiple scenes
const gameScene = new Scene(engine, "GameScene");
const uiScene = new Scene(engine, "UIScene");
const backgroundScene = new Scene(engine, "BackgroundScene");

// Add scenes to manager
sceneManager.addScene(backgroundScene); // Renders first (background)
sceneManager.addScene(gameScene);       // Renders second (main content)
sceneManager.addScene(uiScene);         // Renders last (UI overlay)

// Access all active scenes
console.log("Active scenes:", sceneManager.scenes.map(s => s.name));

// Load scene from asset
sceneManager.loadScene("./assets/level1.scene").then(scene => {
  console.log("Level 1 loaded:", scene.name);
});

engine.run();
```

## Multi-Scene Management

The SceneManager supports multiple concurrent scenes with proper rendering order:

```ts
class MultiSceneApplication {
  private sceneManager: SceneManager;
  private scenes: Map<string, Scene> = new Map();

  constructor(engine: Engine) {
    this.sceneManager = engine.sceneManager;
    this.setupScenes(engine);
  }

  private setupScenes(engine: Engine): void {
    // Create different scene layers
    const backgroundScene = new Scene(engine, "Background");
    const gameWorldScene = new Scene(engine, "GameWorld");
    const effectsScene = new Scene(engine, "Effects");
    const uiScene = new Scene(engine, "UI");

    // Configure scene properties
    this.configureBackgroundScene(backgroundScene);
    this.configureGameWorldScene(gameWorldScene);
    this.configureEffectsScene(effectsScene);
    this.configureUIScene(uiScene);

    // Store scenes
    this.scenes.set("background", backgroundScene);
    this.scenes.set("gameworld", gameWorldScene);
    this.scenes.set("effects", effectsScene);
    this.scenes.set("ui", uiScene);

    // Add scenes in rendering order
    this.sceneManager.addScene(backgroundScene);
    this.sceneManager.addScene(gameWorldScene);
    this.sceneManager.addScene(effectsScene);
    this.sceneManager.addScene(uiScene);
  }

  private configureBackgroundScene(scene: Scene): void {
    // Background scene - no shadows, simple lighting
    scene.castShadows = false;
    scene.fogMode = FogMode.None;
    
    // Set background
    scene.background.mode = BackgroundMode.Sky;
  }

  private configureGameWorldScene(scene: Scene): void {
    // Main game scene - full lighting and effects
    scene.castShadows = true;
    scene.fogMode = FogMode.Linear;
    scene.fogStart = 50;
    scene.fogEnd = 500;
    scene.fogColor.set(0.5, 0.6, 0.7, 1);
  }

  private configureEffectsScene(scene: Scene): void {
    // Effects scene - transparent background, no fog
    scene.background.mode = BackgroundMode.Transparent;
    scene.fogMode = FogMode.None;
    scene.castShadows = false;
  }

  private configureUIScene(scene: Scene): void {
    // UI scene - orthographic, no lighting effects
    scene.background.mode = BackgroundMode.Transparent;
    scene.fogMode = FogMode.None;
    scene.castShadows = false;
  }

  getScene(name: string): Scene | undefined {
    return this.scenes.get(name);
  }

  toggleScene(name: string, active: boolean): void {
    const scene = this.scenes.get(name);
    if (scene) {
      scene.isActive = active;
      console.log(`Scene ${name} ${active ? 'activated' : 'deactivated'}`);
    }
  }

  removeScene(name: string): void {
    const scene = this.scenes.get(name);
    if (scene) {
      this.sceneManager.removeScene(scene);
      this.scenes.delete(name);
      console.log(`Scene ${name} removed`);
    }
  }
}

// Usage
const app = new MultiSceneApplication(engine);

// Toggle scenes dynamically
app.toggleScene("effects", false); // Disable effects
app.toggleScene("ui", false);      // Hide UI

// Access specific scenes
const gameScene = app.getScene("gameworld");
if (gameScene) {
  // Add game objects to main scene
  gameScene.addRootEntity(playerEntity);
}
```

## Scene Loading and Asset Management

Load scenes dynamically from assets with proper resource management:

```ts
class SceneAssetManager {
  private sceneManager: SceneManager;
  private loadedScenes: Map<string, Scene> = new Map();
  private loadingPromises: Map<string, AssetPromise<Scene>> = new Map();

  constructor(engine: Engine) {
    this.sceneManager = engine.sceneManager;
  }

  async loadScene(url: string, name?: string): Promise<Scene> {
    // Check if already loaded
    if (this.loadedScenes.has(url)) {
      return this.loadedScenes.get(url)!;
    }

    // Check if currently loading
    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url)!;
    }

    // Start loading
    console.log(`Loading scene: ${url}`);
    const loadPromise = this.sceneManager.engine.resourceManager.load<Scene>({
      url,
      type: AssetType.Scene
    });

    this.loadingPromises.set(url, loadPromise);

    try {
      const scene = await loadPromise;
      
      // Set custom name if provided
      if (name) {
        scene.name = name;
      }

      // Store loaded scene
      this.loadedScenes.set(url, scene);
      this.loadingPromises.delete(url);

      console.log(`Scene loaded successfully: ${scene.name}`);
      return scene;

    } catch (error) {
      this.loadingPromises.delete(url);
      console.error(`Failed to load scene ${url}:`, error);
      throw error;
    }
  }

  async switchToScene(url: string, destroyOldScenes: boolean = true): Promise<Scene> {
    // Load new scene
    const newScene = await this.loadScene(url);

    // Destroy old scenes if requested
    if (destroyOldScenes) {
      this.destroyAllActiveScenes();
    }

    // Add new scene
    this.sceneManager.addScene(newScene);
    
    return newScene;
  }

  async addSceneLayer(url: string, index?: number): Promise<Scene> {
    const scene = await this.loadScene(url);
    
    if (typeof index === 'number') {
      this.sceneManager.addScene(index, scene);
    } else {
      this.sceneManager.addScene(scene);
    }
    
    return scene;
  }

  preloadScenes(urls: string[]): Promise<Scene[]> {
    const promises = urls.map(url => this.loadScene(url));
    return Promise.all(promises);
  }

  unloadScene(url: string): void {
    const scene = this.loadedScenes.get(url);
    if (scene) {
      // Remove from scene manager
      this.sceneManager.removeScene(scene);
      
      // Destroy scene and its resources
      scene.destroy();
      
      // Remove from cache
      this.loadedScenes.delete(url);
      
      console.log(`Scene unloaded: ${url}`);
    }
  }

  private destroyAllActiveScenes(): void {
    const activeScenes = [...this.sceneManager.scenes];
    activeScenes.forEach(scene => {
      this.sceneManager.removeScene(scene);
      scene.destroy();
    });
  }

  getLoadedScenes(): Scene[] {
    return Array.from(this.loadedScenes.values());
  }

  isSceneLoaded(url: string): boolean {
    return this.loadedScenes.has(url);
  }

  isSceneLoading(url: string): boolean {
    return this.loadingPromises.has(url);
  }
}

// Usage
const assetManager = new SceneAssetManager(engine);

// Preload multiple scenes
await assetManager.preloadScenes([
  "./assets/menu.scene",
  "./assets/level1.scene",
  "./assets/level2.scene"
]);

// Switch between scenes
await assetManager.switchToScene("./assets/menu.scene");

// Add overlay scene
await assetManager.addSceneLayer("./assets/hud.scene");

// Check loading status
if (assetManager.isSceneLoaded("./assets/level1.scene")) {
  console.log("Level 1 is ready to play");
}
```

## Scene Transitions

Implement smooth transitions between scenes:

```ts
class SceneTransitionManager {
  private sceneManager: SceneManager;
  private transitionInProgress: boolean = false;
  private fadeOverlay: Entity | null = null;

  constructor(engine: Engine) {
    this.sceneManager = engine.sceneManager;
    this.createFadeOverlay(engine);
  }

  private createFadeOverlay(engine: Engine): void {
    // Create UI scene for transition overlay
    const overlayScene = new Scene(engine, "TransitionOverlay");
    overlayScene.background.mode = BackgroundMode.Transparent;
    
    // Create fade overlay entity (implementation depends on UI system)
    this.fadeOverlay = new Entity(engine, "FadeOverlay");
    // Add UI components for fade effect
    
    overlayScene.addRootEntity(this.fadeOverlay);
    this.sceneManager.addScene(overlayScene); // Add as top layer
  }

  async fadeTransition(
    fromScenes: Scene[],
    toScenes: Scene[],
    duration: number = 1000
  ): Promise<void> {
    if (this.transitionInProgress) {
      throw new Error("Transition already in progress");
    }

    this.transitionInProgress = true;

    try {
      // Fade out
      await this.fadeOut(duration / 2);

      // Switch scenes
      fromScenes.forEach(scene => {
        this.sceneManager.removeScene(scene);
      });

      toScenes.forEach(scene => {
        this.sceneManager.addScene(scene);
      });

      // Fade in
      await this.fadeIn(duration / 2);

    } finally {
      this.transitionInProgress = false;
    }
  }

  async slideTransition(
    fromScene: Scene,
    toScene: Scene,
    direction: 'left' | 'right' | 'up' | 'down',
    duration: number = 1000
  ): Promise<void> {
    if (this.transitionInProgress) {
      throw new Error("Transition already in progress");
    }

    this.transitionInProgress = true;

    try {
      // Add new scene
      this.sceneManager.addScene(toScene);

      // Animate scenes
      await this.animateSlide(fromScene, toScene, direction, duration);

      // Remove old scene
      this.sceneManager.removeScene(fromScene);

    } finally {
      this.transitionInProgress = false;
    }
  }

  private async fadeOut(duration: number): Promise<void> {
    return new Promise(resolve => {
      // Animate fade overlay alpha from 0 to 1
      // Implementation depends on animation system
      setTimeout(resolve, duration);
    });
  }

  private async fadeIn(duration: number): Promise<void> {
    return new Promise(resolve => {
      // Animate fade overlay alpha from 1 to 0
      // Implementation depends on animation system
      setTimeout(resolve, duration);
    });
  }

  private async animateSlide(
    fromScene: Scene,
    toScene: Scene,
    direction: string,
    duration: number
  ): Promise<void> {
    return new Promise(resolve => {
      // Implement slide animation
      // Move camera or scene positions
      setTimeout(resolve, duration);
    });
  }

  async crossFadeTransition(
    fromScene: Scene,
    toScene: Scene,
    duration: number = 1000
  ): Promise<void> {
    if (this.transitionInProgress) {
      throw new Error("Transition already in progress");
    }

    this.transitionInProgress = true;

    try {
      // Add new scene
      this.sceneManager.addScene(toScene);

      // Initially hide new scene
      toScene.isActive = false;

      // Cross-fade animation
      await this.animateCrossFade(fromScene, toScene, duration);

      // Remove old scene
      this.sceneManager.removeScene(fromScene);

    } finally {
      this.transitionInProgress = false;
    }
  }

  private async animateCrossFade(
    fromScene: Scene,
    toScene: Scene,
    duration: number
  ): Promise<void> {
    return new Promise(resolve => {
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Fade out old scene, fade in new scene
        // Implementation depends on rendering system
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          toScene.isActive = true;
          resolve();
        }
      };

      toScene.isActive = true;
      animate();
    });
  }
}

// Usage
const transitionManager = new SceneTransitionManager(engine);

// Fade transition between scenes
await transitionManager.fadeTransition(
  [currentScene],
  [newScene],
  1500
);

// Slide transition
await transitionManager.slideTransition(
  menuScene,
  gameScene,
  'left',
  800
);

// Cross-fade transition
await transitionManager.crossFadeTransition(
  gameScene,
  endScene,
  2000
);
```

## Scene Merging and Composition

Combine multiple scenes into composite scenes for complex layouts:

```ts
class SceneComposer {
  private sceneManager: SceneManager;

  constructor(engine: Engine) {
    this.sceneManager = engine.sceneManager;
  }

  mergeScenes(sourceScene: Scene, targetScene: Scene): void {
    console.log(`Merging ${sourceScene.name} into ${targetScene.name}`);

    // Use built-in merge functionality
    this.sceneManager.mergeScenes(sourceScene, targetScene);

    // The source scene's entities are now part of target scene
    console.log(`Merge complete. Target scene now has ${targetScene.rootEntities.length} root entities`);
  }

  createCompositeScene(
    engine: Engine,
    name: string,
    sourceScenes: Scene[]
  ): Scene {
    const compositeScene = new Scene(engine, name);

    // Merge all source scenes into the composite
    sourceScenes.forEach(sourceScene => {
      this.mergeScenes(sourceScene, compositeScene);
    });

    return compositeScene;
  }

  async loadAndMergeScenes(
    engine: Engine,
    targetScene: Scene,
    sceneUrls: string[]
  ): Promise<void> {
    const loadPromises = sceneUrls.map(url =>
      engine.resourceManager.load<Scene>({ url, type: AssetType.Scene })
    );

    const loadedScenes = await Promise.all(loadPromises);

    loadedScenes.forEach(scene => {
      this.mergeScenes(scene, targetScene);
      // Clean up the source scene after merging
      scene.destroy();
    });
  }

  createLayeredComposition(
    engine: Engine,
    layers: Array<{ name: string; scenes: Scene[] }>
  ): Scene[] {
    return layers.map(layer => {
      const layerScene = new Scene(engine, layer.name);

      layer.scenes.forEach(scene => {
        this.mergeScenes(scene, layerScene);
      });

      return layerScene;
    });
  }

  splitSceneByTag(
    sourceScene: Scene,
    engine: Engine,
    tagToSceneMap: Map<string, string>
  ): Map<string, Scene> {
    const resultScenes = new Map<string, Scene>();

    // Create target scenes
    tagToSceneMap.forEach((sceneName, tag) => {
      resultScenes.set(tag, new Scene(engine, sceneName));
    });

    // Move entities based on tags
    const rootEntities = [...sourceScene.rootEntities];
    rootEntities.forEach(entity => {
      const entityTag = entity.tag;
      const targetScene = resultScenes.get(entityTag);

      if (targetScene) {
        sourceScene.removeRootEntity(entity);
        targetScene.addRootEntity(entity);
      }
    });

    return resultScenes;
  }
}

// Usage
const composer = new SceneComposer(engine);

// Merge multiple scenes into one
const mainScene = new Scene(engine, "MainScene");
const environmentScene = new Scene(engine, "Environment");
const propsScene = new Scene(engine, "Props");

composer.mergeScenes(environmentScene, mainScene);
composer.mergeScenes(propsScene, mainScene);

// Load and merge scenes from assets
await composer.loadAndMergeScenes(engine, mainScene, [
  "./assets/buildings.scene",
  "./assets/vegetation.scene",
  "./assets/lighting.scene"
]);

// Create layered composition
const layers = composer.createLayeredComposition(engine, [
  { name: "Background", scenes: [skyScene, terrainScene] },
  { name: "Midground", scenes: [buildingsScene, treesScene] },
  { name: "Foreground", scenes: [charactersScene, effectsScene] }
]);

layers.forEach(layer => sceneManager.addScene(layer));
```

## API Reference

```apidoc
SceneManager:
  Properties:
    scenes: ReadonlyArray<Scene>
      - Array of all active scenes in rendering order.
    activeScene: Scene (deprecated)
      - The first scene in the scenes array (use scenes[0] instead).
    engine: Engine
      - Reference to the engine instance.

  Methods:
    addScene(scene: Scene): void
      - Add scene to the end of the scenes array.
    addScene(index: number, scene: Scene): void
      - Add scene at specified index in the scenes array.
    removeScene(scene: Scene): void
      - Remove scene from the manager and deactivate it.
    loadScene(url: string): Promise<Scene>
      - Load scene from asset URL.
    mergeScenes(sourceScene: Scene, destScene: Scene): void
      - Merge all entities from source scene into destination scene.

Scene:
  Properties:
    name: string
      - The name of the scene.
    isActive: boolean
      - Whether the scene participates in rendering and updates.
    engine: Engine
      - Reference to the engine instance.
    rootEntities: ReadonlyArray<Entity>
      - Array of root-level entities in the scene.
    background: Background
      - Scene background configuration.
    ambientLight: AmbientLight
      - Scene ambient lighting settings.
    fogMode: FogMode
      - Fog rendering mode (None, Linear, Exponential, ExponentialSquared).
    fogStart: number
      - Fog start distance (for linear fog).
    fogEnd: number
      - Fog end distance (for linear fog).
    fogDensity: number
      - Fog density (for exponential fog modes).
    fogColor: Color
      - Fog color.
    castShadows: boolean
      - Whether entities in this scene cast shadows.

  Methods:
    addRootEntity(entity: Entity): void
      - Add entity as root-level entity in the scene.
    removeRootEntity(entity: Entity): void
      - Remove root-level entity from the scene.
    getRootEntity(index?: number): Entity | null
      - Get root entity by index (default: 0).
    findEntityByName(name: string): Entity | null
      - Find entity by name in the scene hierarchy.
    findEntityByPath(path: string): Entity | null
      - Find entity by hierarchical path.
    destroy(): void
      - Destroy the scene and all its entities.

AssetPromise<T>:
  Methods:
    then(onFulfilled?: (value: T) => any, onRejected?: (reason: any) => any): AssetPromise<any>
      - Promise-like then method for chaining.
    catch(onRejected?: (reason: any) => any): AssetPromise<any>
      - Promise-like catch method for error handling.
```

## Performance Optimization

Optimize scene management for better performance:

## Best Practices

- Traverse `scene.rootEntities` to maintain counts of entities, active nodes, and render components.
- Gather `DirectLight`, `PointLight`, and `SpotLight` components to manage lighting budgets.
- Profile frame time via `engine.time.deltaTime` and rely on DevTools/engine overlays for memory statistics.
- Cull or disable distant entities and switch complex scenes to simpler fog or lighting presets when metrics exceed your targets.

- **Scene Organization**: Use multiple scenes for different layers (background, game world, UI)
- **Rendering Order**: Add scenes in the order they should be rendered (background first, UI last)
- **Resource Management**: Properly destroy scenes when no longer needed to prevent memory leaks
- **Scene Transitions**: Implement smooth transitions between scenes for better user experience
- **Performance Monitoring**: Monitor scene complexity and optimize based on performance metrics
- **State Management**: Save and restore scene states for checkpoints and persistence
- **Asset Loading**: Use asynchronous scene loading to prevent blocking the main thread
- **Scene Merging**: Use scene merging to combine related content into single scenes
- **Activation Control**: Use scene.isActive to temporarily disable scenes without removing them
- **Memory Optimization**: Regularly clean up unused scenes and entities to manage memory usage

This comprehensive Scene Manager system enables complex multi-scene applications with proper lifecycle management, smooth transitions, and performance optimization capabilities.
