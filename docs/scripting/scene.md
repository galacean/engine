# Scene

Galacean's `Scene` class is the primary container for all game content, managing entity hierarchies, lighting environments, rendering settings, and physics simulation. Scenes serve as isolated worlds with their own lighting conditions, fog settings, shadow configuration, and post-processing effects, while coordinating with the engine's render pipeline and component systems.

## Overview

Every Scene provides:
- **Entity Management**: Root entity hierarchy with scene-wide search capabilities
- **Lighting System**: Ambient lighting, sun light configuration, and shadow mapping
- **Atmospheric Effects**: Fog rendering with multiple modes (linear, exponential)
- **Physics Integration**: Built-in physics world simulation
- **Post-Processing**: Scene-level effect pipeline management
- **Background Control**: Skybox, color, or texture backgrounds

Scenes are managed by the `SceneManager` and can be added/removed to control which content participates in rendering and updates. Multiple scenes can be active simultaneously.

## Quick Start

```ts
import { WebGLEngine, Scene, AmbientLight, DirectLight } from "@galacean/engine";
import { Color, Vector3 } from "@galacean/engine-math";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const sceneManager = engine.sceneManager;

// Create and add a scene
const scene = new Scene(engine, "MyScene");
sceneManager.addScene(scene);

// Add entities to the scene
const player = scene.createRootEntity("Player");
const enemy = scene.createRootEntity("Enemy");

// Configure lighting
scene.ambientLight.color.set(0.2, 0.2, 0.3, 1.0);

const sunEntity = scene.createRootEntity("Sun");
const sunLight = sunEntity.addComponent(DirectLight);
sunLight.color.set(1.0, 0.9, 0.8, 1.0);
sunLight.intensity = 1.0;

// Configure fog
scene.fogMode = FogMode.Linear;
scene.fogColor.set(0.5, 0.6, 0.7, 1.0);
scene.fogStart = 10;
scene.fogEnd = 100;
```

## Entity Management

### Creating and Managing Root Entities

```ts
// Create root entities
const player = scene.createRootEntity("Player");
const terrain = scene.createRootEntity("Terrain");

// Add existing entity as root
const existingEntity = new Entity(engine, "ExistingEntity");
scene.addRootEntity(existingEntity);



// Remove root entity
scene.removeRootEntity(player);

// Access root entities
console.log(scene.rootEntities.length);
const firstRoot = scene.getRootEntity(0);
const allRoots = scene.rootEntities; // Read-only array
```

### Entity Search Operations

```ts
// Find by name (searches entire scene hierarchy)
const player = scene.findEntityByName("Player");
const weapons = scene.findEntityByName("Weapon"); // Returns first match

// Find by path (slash-delimited hierarchy)
const playerWeapon = scene.findEntityByPath("Player/Equipment/Weapon");
const uiButton = scene.findEntityByPath("UI/MainMenu/StartButton");

// Note: Path search is case-sensitive and must match exact entity names
```

## Scene Management

### Multiple Scene Support

```ts
// Create multiple scenes
const gameScene = new Scene(engine, "GameScene");
const uiScene = new Scene(engine, "UIScene");

// Add scenes to engine (both will be rendered)
engine.sceneManager.addScene(gameScene);
engine.sceneManager.addScene(uiScene);

// Access all active scenes
const allScenes = engine.sceneManager.scenes;
console.log(`Active scenes: ${allScenes.length}`);

// Remove a scene
engine.sceneManager.removeScene(uiScene);

// Merge scenes
const sourceScene = new Scene(engine, "Source");
const destScene = new Scene(engine, "Destination");
engine.sceneManager.mergeScenes(sourceScene, destScene);
```

### Loading Scenes from Assets

```ts
import { AssetType } from "@galacean/engine";

// Load scene from asset
const scene = await engine.resourceManager.load({
  type: AssetType.Scene,
  url: "path/to/scene.json"
});

// Add loaded scene to engine
engine.sceneManager.addScene(scene);

// Or load and set as active scene (deprecated approach)
// engine.sceneManager.activeScene = scene;
```

## Lighting System

### Ambient Lighting

```ts
import { AmbientLight } from "@galacean/engine";

// Scene automatically creates ambient light
const ambient = scene.ambientLight;

// Configure ambient color and intensity
ambient.color.set(0.2, 0.2, 0.3, 1.0);
ambient.intensity = 0.5;

// Use different ambient light
const customAmbient = new AmbientLight(engine);
customAmbient.color.set(0.3, 0.1, 0.1, 1.0); // Reddish ambient
scene.ambientLight = customAmbient;
```

### Sun Light Configuration

```ts
import { DirectLight } from "@galacean/engine";

// Create directional light as sun
const sunEntity = scene.createRootEntity("Sun");
const sunLight = sunEntity.addComponent(DirectLight);

// Configure sun properties
sunLight.color.set(1.0, 0.9, 0.7, 1.0);
sunLight.intensity = 2.0;
sunEntity.transform.setRotation(45, 30, 0); // Direction via rotation

// The scene will automatically use directional lights for lighting calculations
```

### Shadow Configuration

```ts
import { ShadowResolution, ShadowCascadesMode } from "@galacean/engine";

// Enable shadow casting
scene.castShadows = true;

// Configure shadow quality
scene.shadowResolution = ShadowResolution.High; // Low, Medium, High, VeryHigh

// Set shadow distance
scene.shadowDistance = 100; // Max distance for shadow rendering

// Configure shadow fade
scene.shadowFadeBorder = 0.1; // 10% fade at shadow edge (0 = no fade)

// Cascaded shadow mapping (for large outdoor scenes)
scene.shadowCascades = ShadowCascadesMode.FourCascades;

// Fine-tune cascade splits
scene.shadowTwoCascadeSplits = 0.3;               // For two cascades
scene.shadowFourCascadeSplits.set(0.1, 0.3, 0.6); // For four cascades

// Enable transparent shadow casting
scene.enableTransparentShadow = true;
```

## Atmospheric Effects

### Fog System

Galacean supports multiple fog modes for atmospheric depth:

```ts
import { FogMode } from "@galacean/engine";

// Linear fog (distance-based)
scene.fogMode = FogMode.Linear;
scene.fogColor.set(0.5, 0.6, 0.7, 1.0); // Sky blue fog
scene.fogStart = 10;  // Fog starts at distance 10
scene.fogEnd = 100;   // Full fog at distance 100

// Exponential fog (natural falloff)
scene.fogMode = FogMode.Exponential;
scene.fogDensity = 0.01; // Controls fog thickness

// Exponential squared fog (more dramatic falloff)
scene.fogMode = FogMode.ExponentialSquared;
scene.fogDensity = 0.005;

// Disable fog
scene.fogMode = FogMode.None;
```

### Background Configuration

```ts
import { BackgroundMode, Texture2D, TextureCube } from "@galacean/engine";

const background = scene.background;

// Solid color background
background.mode = BackgroundMode.SolidColor;
background.solidColor.set(0.2, 0.4, 0.8, 1.0);

// Skybox background
background.mode = BackgroundMode.Sky;
background.sky = skyboxMaterial; // SkyBoxMaterial or SkyProceduralMaterial

// Texture background
background.mode = BackgroundMode.Texture;
background.texture = backgroundTexture; // Texture2D
```

## Physics Integration

```ts
// Access built-in physics scene
const physicsScene = scene.physics;

// Physics configuration
physicsScene.gravity.set(0, -9.81, 0);

// Physics queries
const hit = physicsScene.raycast(origin, direction, maxDistance);
if (hit) {
  console.log("Hit entity:", hit.entity.name);
  console.log("Hit point:", hit.point);
}

// Overlap detection
const overlapping = physicsScene.overlapSphere(center, radius);
console.log(`Found ${overlapping.length} overlapping colliders`);
```

## Post-Processing Effects

```ts
// Access post-process manager
const postProcess = scene.postProcessManager;

// Add effects
import { BloomEffect, TonemappingEffect } from "@galacean/engine";

const bloom = postProcess.addEffect(BloomEffect);
bloom.intensity = 1.2;
bloom.threshold = 1.0;

const tonemap = postProcess.addEffect(TonemappingEffect);
tonemap.mode = TonemappingMode.ACES;

// Control effect order and enabled state
bloom.enabled = true;
postProcess.enabled = true; // Master enable/disable
```

## Ambient Occlusion

```ts
import { AmbientOcclusionQuality } from "@galacean/engine";

// Configure ambient occlusion
const ao = scene.ambientOcclusion;
ao.enabled = true;
ao.intensity = 1.0;
ao.radius = 0.3;
ao.quality = AmbientOcclusionQuality.High;

// Fine-tune settings
ao.bias = 0.025;
ao.blurSharpness = 10;
```

## Scene Activation and Lifecycle

```ts
// Scene active state
scene.isActive = true;  // Participates in updates and rendering
scene.isActive = false; // Paused, no updates or rendering

// Scene manager operations
sceneManager.activeScene = scene;  // Set as active scene
sceneManager.addScene(scene);      // Add to scene list
sceneManager.removeScene(scene);   // Remove from scene list

// Multiple scene management
const mainScene = new Scene(engine, "MainScene");
const uiScene = new Scene(engine, "UIScene");

sceneManager.addScene(mainScene);
sceneManager.addScene(uiScene);
sceneManager.activeScene = mainScene; // Primary scene for rendering
```

## Shader Data and Material Properties

```ts
// Access scene-level shader data
const shaderData = scene.shaderData;

// Set global material properties
shaderData.setFloat("_GlobalTime", time);
shaderData.setColor("_AmbientColor", ambientColor);
shaderData.setTexture("_GlobalNoise", noiseTexture);

// Enable/disable shader features
shaderData.enableMacro("CUSTOM_LIGHTING");
shaderData.disableMacro("SHADOWS_OFF");
```

## Advanced Patterns

### Multi-Scene Architecture

```ts
class GameSceneManager {
  private mainScene: Scene;
  private uiScene: Scene;
  private backgroundScene: Scene;

  constructor(engine: Engine) {
    this.mainScene = new Scene(engine, "MainGame");
    this.uiScene = new Scene(engine, "UI");
    this.backgroundScene = new Scene(engine, "Background");

    // Configure different scenes for different purposes
    this.setupMainScene();
    this.setupUIScene();
    this.setupBackgroundScene();
  }

  private setupMainScene(): void {
    // 3D game content
    this.mainScene.castShadows = true;
    this.mainScene.fogMode = FogMode.Linear;
    this.mainScene.fogStart = 50;
    this.mainScene.fogEnd = 500;
  }

  private setupUIScene(): void {
    // UI overlay - no fog, no shadows
    this.uiScene.castShadows = false;
    this.uiScene.fogMode = FogMode.None;
  }

  private setupBackgroundScene(): void {
    // Background elements - minimal features
    this.backgroundScene.castShadows = false;
    this.backgroundScene.fogMode = FogMode.None;
  }

  switchToLevel(levelName: string): void {
    // Clear current level
    this.clearScene(this.mainScene);
    
    // Load new level content
    this.loadLevel(levelName);
  }

  private clearScene(scene: Scene): void {
    while (scene.rootEntitiesCount > 0) {
      scene.getRootEntity(0).destroy();
    }
  }
}
```

### Dynamic Lighting Setup

```ts
class DynamicLighting {
  private scene: Scene;
  private timeOfDay: number = 0.5; // 0 = midnight, 0.5 = noon, 1 = midnight

  constructor(scene: Scene) {
    this.scene = scene;
    this.setupSunLight();
  }

  updateTimeOfDay(deltaTime: number): void {
    this.timeOfDay += deltaTime * 0.1; // Day/night cycle speed
    this.timeOfDay %= 1.0;

    this.updateSunAngle();
    this.updateFogColor();
    this.updateAmbientLight();
  }

  private updateSunAngle(): void {
    const sunAngle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const sunElevation = Math.sin(sunAngle) * 90;
    const sunAzimuth = this.timeOfDay * 360;

    if (this.scene.sun) {
      this.scene.sun.entity.transform.setRotation(sunElevation, sunAzimuth, 0);
      
      // Dim sun during night
      const intensity = Math.max(0, Math.sin(sunAngle)) * 2;
      this.scene.sun.intensity = intensity;
    }
  }

  private updateFogColor(): void {
    const dayColor = new Color(0.5, 0.6, 0.8, 1.0);
    const nightColor = new Color(0.1, 0.1, 0.3, 1.0);
    
    // Interpolate based on time of day
    const t = Math.sin(this.timeOfDay * Math.PI * 2) * 0.5 + 0.5;
    Color.lerp(nightColor, dayColor, t, this.scene.fogColor);
  }

  private updateAmbientLight(): void {
    const dayIntensity = 0.6;
    const nightIntensity = 0.1;
    
    const t = Math.sin(this.timeOfDay * Math.PI * 2) * 0.5 + 0.5;
    this.scene.ambientLight.intensity = 
      nightIntensity + (dayIntensity - nightIntensity) * t;
  }
}
```

### Performance-Optimized Scene Loading

```ts
class PerformantSceneLoader {
  async loadSceneAsync(scene: Scene, sceneData: any): Promise<void> {
    // Disable scene during loading
    scene.isActive = false;

    try {
      // Load in batches to avoid frame drops
      await this.loadEntitiesInBatches(scene, sceneData.entities);
      await this.configureLighting(scene, sceneData.lighting);
      await this.setupEnvironment(scene, sceneData.environment);
    } finally {
      // Re-enable scene
      scene.isActive = true;
    }
  }

  private async loadEntitiesInBatches(scene: Scene, entityData: any[]): Promise<void> {
    const batchSize = 10;
    
    for (let i = 0; i < entityData.length; i += batchSize) {
      const batch = entityData.slice(i, i + batchSize);
      
      // Load batch
      for (const data of batch) {
        this.createEntityFromData(scene, data);
      }
      
      // Yield to main thread
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  private createEntityFromData(scene: Scene, data: any): Entity {
    const entity = scene.createRootEntity(data.name);
    
    // Configure transform
    entity.transform.setPosition(data.position.x, data.position.y, data.position.z);
    entity.transform.setRotation(data.rotation.x, data.rotation.y, data.rotation.z);
    entity.transform.setScale(data.scale.x, data.scale.y, data.scale.z);
    
    // Add components based on data
    if (data.mesh) {
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = this.loadMesh(data.mesh);
      renderer.material = this.loadMaterial(data.material);
    }
    
    return entity;
  }
}
```

## API Reference

```apidoc
Scene:
  Properties:
    name: string
      - Scene identifier for debugging and management.
    isActive: boolean
      - Controls scene participation in updates and rendering.
    physics: PhysicsScene
      - Built-in physics world for collision detection and simulation.
    postProcessManager: PostProcessManager
      - Manages post-processing effects pipeline.
    ambientOcclusion: AmbientOcclusion
      - Screen-space ambient occlusion settings.
    background: Background
      - Scene background configuration (skybox, color, texture).
    shaderData: ShaderData
      - Scene-level shader uniforms and macros.

  Lighting Properties:
    ambientLight: AmbientLight
      - Global ambient lighting for the scene.
    sun: DirectLight | null
      - Primary directional light source. If null, uses brightest directional light.
    castShadows: boolean
      - Enable/disable shadow casting for the scene.
    shadowResolution: ShadowResolution
      - Quality setting for shadow maps (Low, Medium, High, VeryHigh).
    shadowDistance: number
      - Maximum distance for shadow rendering.
    shadowFadeBorder: number
      - Shadow fade percentage at max distance [0-1].
    shadowCascades: ShadowCascadesMode
      - Number of shadow cascades (None, Two, Four).
    shadowTwoCascadeSplits: number
      - Split ratio for two-cascade shadows.
    shadowFourCascadeSplits: Vector3
      - Split ratios for four-cascade shadows.
    enableTransparentShadow: boolean
      - Allow transparent objects to cast shadows.

  Fog Properties:
    fogMode: FogMode
      - Fog type (None, Linear, Exponential, ExponentialSquared).
    fogColor: Color
      - Fog color and alpha.
    fogStart: number
      - Distance where linear fog begins.
    fogEnd: number
      - Distance where linear fog reaches maximum density.
    fogDensity: number
      - Density parameter for exponential fog modes.

  Entity Management:
    rootEntities: ReadonlyArray<Entity>
      - Read-only array of root entities in scene.

  Methods:
    createRootEntity(name?: string): Entity
      - Create and add new root entity to scene.
    addRootEntity(entity: Entity): void
      - Add existing entity as root to scene.
    removeRootEntity(entity: Entity): void
      - Remove entity from scene roots (entity becomes orphaned).
    getRootEntity(index: number): Entity | undefined
      - Get root entity by index.
    findEntityByName(name: string): Entity | null
      - Search entire scene hierarchy for entity by name.
    findEntityByPath(path: string): Entity | null
      - Find entity using slash-delimited path (e.g., "Player/Weapon").
    destroy(): void
      - Destroy scene and automatically remove from active scenes.

SceneManager:
  Properties:
    scenes: ReadonlyArray<Scene>
      - List of all active scenes in the engine.

  Methods:
    addScene(scene: Scene): void
      - Add scene to engine for rendering.
    removeScene(scene: Scene): void
      - Remove scene from engine.
    mergeScenes(sourceScene: Scene, destScene: Scene): void
      - Merge all entities from sourceScene into destScene.
    loadScene(url: string): Promise<Scene>
      - Load scene asset from URL.
```

## Best Practices

- **Scene Organization**: Use descriptive names and organize entities logically in the hierarchy
- **Lighting Design**: Balance ambient and directional lighting for visual appeal and performance
- **Shadow Optimization**: Use appropriate shadow resolution and distance for your target platforms
- **Fog Configuration**: Match fog settings to your scene's visual style and depth requirements
- **Entity Search**: Cache frequently accessed entities rather than repeated `findEntityByName` calls
- **Multi-Scene Architecture**: Separate different types of content (3D world, UI, background) into different scenes
- **Resource Management**: Properly destroy scenes to release all associated resources
- **Performance Monitoring**: Disable unused features (shadows, fog, post-processing) when not needed

## Common Issues

**Scene Activation**: Remember that inactive scenes don't update or render:
```ts
// Ensure scene is active for rendering
scene.isActive = true;
sceneManager.activeScene = scene;
```

**Shadow Performance**: Shadows can be expensive - optimize settings:
```ts
// Reduce shadow distance for better performance
scene.shadowDistance = 50; // Instead of 200
scene.shadowResolution = ShadowResolution.Medium; // Instead of High
```

**Entity Search Performance**: Avoid frequent scene-wide searches:
```ts
// Bad: Searching every frame
onUpdate() {
  const player = scene.findEntityByName("Player"); // Expensive!
}

// Good: Cache the reference
onAwake() {
  this.player = scene.findEntityByName("Player");
}
```

**Resource Cleanup**: Always properly destroy scenes:
```ts
// Proper cleanup
scene.destroy(); // Destroys all entities and releases resources
```
