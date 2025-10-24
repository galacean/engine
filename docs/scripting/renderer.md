# Renderer

Galacean's `Renderer` class is the abstract base class for all rendering components in the engine. It provides fundamental rendering infrastructure including material management, shader data handling, transform matrices, bounding box calculations, and rendering pipeline integration. All visual components like MeshRenderer, SpriteRenderer, TextRenderer, and ParticleRenderer extend this base class.

## Overview

The Renderer class establishes the foundation for the rendering system:

- **Material Management**: Support for multiple materials with instance creation capabilities
- **Shader Data**: Per-renderer shader properties and macro management
- **Transform Integration**: Automatic matrix calculations and shader data updates
- **Culling System**: Bounding box calculations and frustum culling support
- **Rendering Pipeline**: Integration with the engine's rendering pipeline and batching system
- **Shadow Support**: Built-in shadow casting and receiving capabilities
- **Priority System**: Render order control through priority values

Every Renderer automatically registers with the scene's component manager and participates in the engine's frame-based rendering loop.

## Quick Start

```ts
import { WebGLEngine, MeshRenderer, Material } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;
const entity = scene.createRootEntity("RenderedObject");

// Add a MeshRenderer (extends Renderer)
const meshRenderer = entity.addComponent(MeshRenderer);

// Configure renderer properties
meshRenderer.receiveShadows = true;
meshRenderer.castShadows = true;
meshRenderer.priority = 100;

// Set materials
const material = new Material(engine, shader);
meshRenderer.setMaterial(material);

// Access shader data for custom properties
meshRenderer.shaderData.setFloat("custom_intensity", 2.0);
meshRenderer.shaderData.setColor("custom_tint", Color.red);
```

## Material Management

### Single Material Operations

```ts
const renderer = entity.getComponent(MeshRenderer);

// Set the first material
renderer.setMaterial(material);

// Get the first material
const material = renderer.getMaterial();

// Set material by index
renderer.setMaterial(materialA, 0);
renderer.setMaterial(materialB, 1);

// Get material by index
const materialA = renderer.getMaterial(0);
const materialB = renderer.getMaterial(1);

// Check material count (read-only)
console.log(`Renderer has ${renderer.materialCount} materials`);
```

### Multiple Materials

```ts
// Set multiple materials by index
renderer.setMaterial(materialA, 0);
renderer.setMaterial(materialB, 1);
renderer.setMaterial(materialC, 2);

// Get all materials
const allMaterials = renderer.getMaterials();
console.log(`Total materials: ${allMaterials.length}`);

// Iterate through materials
allMaterials.forEach((material, index) => {
  console.log(`Material ${index}:`, material?.name || "empty");
});
```

### Material Instancing

Material instancing creates unique copies per renderer to enable per-object customization:

```ts
// Get instance material (creates copy on first access)
const instanceMaterial = renderer.getInstanceMaterial();

// Get instance material by index
const instanceMaterialA = renderer.getInstanceMaterial(0);
const instanceMaterialB = renderer.getInstanceMaterial(1);

// Get all instance materials
const allInstanceMaterials = renderer.getInstanceMaterials();

// Instance materials can be modified independently
instanceMaterial.baseColor.set(1, 0, 0, 1); // Red tint for this renderer only

// Check if material is instanced
const materials = renderer.getMaterials();
const instanceMaterials = renderer.getInstanceMaterials();
const isInstanced = materials[0] !== instanceMaterials[0];
```

## Shader Data Management

Each renderer has its own ShaderData object for storing per-object shader properties:

```ts
const shaderData = renderer.shaderData;

// Set scalar values
shaderData.setFloat("metallic", 0.8);
shaderData.setInt("surfaceType", 1);
shaderData.setBool("isEmissive", true);

// Set vector values
shaderData.setVector2("uvOffset", new Vector2(0.1, 0.2));
shaderData.setVector3("worldPosition", new Vector3(10, 5, 0));
shaderData.setVector4("customColor", new Vector4(1, 0.5, 0.2, 1));

// Set matrix values
shaderData.setMatrix("customTransform", customMatrix);

// Set textures
shaderData.setTexture("diffuseTexture", diffuseTexture);
shaderData.setTextureArray("textureArray", [tex1, tex2, tex3]);

// Manage shader macros
shaderData.enableMacro("USE_NORMAL_MAP");
shaderData.disableMacro("USE_ALPHA_TEST");

// Check macro state
if (shaderData.hasMacro("USE_NORMAL_MAP")) {
  console.log("Normal mapping is enabled");
}
```

## MeshRenderer Specific Features

### Mesh Assignment and Vertex Colors

```ts
import { MeshRenderer, PrimitiveMesh, BlinnPhongMaterial } from "@galacean/engine";

const meshRenderer = entity.addComponent(MeshRenderer);

// Assign mesh geometry
meshRenderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);

// Enable vertex colors (if mesh has vertex color data)
meshRenderer.enableVertexColor = true;

// Set material
meshRenderer.setMaterial(new BlinnPhongMaterial(engine));
```

### Shadow Configuration

```ts
// Enable shadow casting and receiving
meshRenderer.castShadows = true;
meshRenderer.receiveShadows = true;

// Note: Scene must also have shadow casting enabled
scene.castShadows = true;
```

## Transform and Matrix Management

Renderers automatically manage transform-related shader data:

```ts
// Transform matrices are automatically updated
const entity = renderer.entity;
entity.transform.setPosition(10, 5, 0);
entity.transform.setRotation(0, 45, 0);

// Renderer automatically provides these matrices to shaders:
// - renderer_LocalMat: Local transformation matrix
// - renderer_ModelMat: World transformation matrix  
// - renderer_MVMat: Model-view matrix
// - renderer_MVPMat: Model-view-projection matrix
// - renderer_MVInvMat: Inverse model-view matrix
// - renderer_NormalMat: Normal transformation matrix

// Access bounding box (automatically calculated)
const bounds = renderer.bounds;
console.log("Bounds center:", bounds.getCenter(new Vector3()));
console.log("Bounds size:", bounds.getExtent(new Vector3()));

// Check if renderer was culled this frame
if (renderer.isCulled) {
  console.log("Renderer was culled and won't render");
}
```

## Shadow Configuration

```ts
// Enable/disable shadow receiving
renderer.receiveShadows = true;  // Receives shadows from other objects
renderer.receiveShadows = false; // No shadows will be cast on this object

// Enable/disable shadow casting
renderer.castShadows = true;  // Casts shadows on other objects
renderer.castShadows = false; // Won't cast shadows

// Shadow configuration example
const character = scene.createRootEntity("Character");
const characterRenderer = character.addComponent(MeshRenderer);
characterRenderer.receiveShadows = true;  // Character can be shadowed
characterRenderer.castShadows = true;     // Character casts shadows

const ground = scene.createRootEntity("Ground");
const groundRenderer = ground.addComponent(MeshRenderer);
groundRenderer.receiveShadows = true;     // Ground receives shadows
groundRenderer.castShadows = false;      // Ground doesn't cast shadows
```

## Render Priority and Sorting

```ts
// Set render priority (lower values render first)
renderer.priority = 0;    // Rendered first (background objects)
renderer.priority = 1000; // Rendered later (foreground objects)
renderer.priority = 3000; // Rendered last (UI, effects)

// Priority determines rendering order within the same layer
const backgroundRenderer = background.getComponent(MeshRenderer);
const midgroundRenderer = midground.getComponent(MeshRenderer);
const foregroundRenderer = foreground.getComponent(MeshRenderer);

backgroundRenderer.priority = 0;
midgroundRenderer.priority = 500;
foregroundRenderer.priority = 1000;

// Objects with the same priority are sorted by distance from camera
// - Opaque objects: front-to-back (for early depth testing)
// - Transparent objects: back-to-front (for correct blending)
```

## Custom Renderer Implementation

### Creating a Custom Renderer

```ts
import { Renderer, Entity, RenderContext, Material } from "@galacean/engine";

class CustomRenderer extends Renderer {
  private customIntensity = 1.0;

  constructor(entity: Entity) {
    super(entity);
    
    // Initialize custom renderer
    this.setMaterial(this.createDefaultMaterial());
  }

  get customProperty(): number {
    return this.customIntensity;
  }

  set customProperty(value: number) {
    this.customIntensity = value;
    // Update shader data when property changes
    this.shaderData.setFloat("custom_intensity", value);
  }

  // Override _updateBounds for custom bounding box calculation
  protected override _updateBounds(worldBounds: BoundingBox): void {
    // Calculate bounds based on your custom geometry
    const center = this.entity.transform.worldPosition;
    const size = this.customIntensity * 2; // Example: bounds based on custom property
    
    worldBounds.min.set(center.x - size, center.y - size, center.z - size);
    worldBounds.max.set(center.x + size, center.y + size, center.z + size);
  }

  // Override _render for custom rendering logic
  protected override _render(context: RenderContext): void {
    const material = this.getMaterial();
    if (!material) return;

    // Custom rendering implementation
    this.renderCustomGeometry(context, material);
  }

  // Override update for per-frame logic
  override update(deltaTime: number): void {
    // Custom per-frame update logic
    this.customProperty += deltaTime * 0.5; // Animate property
  }

  private createDefaultMaterial(): Material {
    // Create and return default material for this renderer
    const material = new Material(this.engine, customShader);
    material.shaderData.setFloat("custom_intensity", this.customIntensity);
    return material;
  }

  private renderCustomGeometry(context: RenderContext, material: Material): void {
    // Implement custom rendering logic here
    // This would typically involve WebGL calls or engine rendering APIs
  }
}
```

### Advanced Renderer Features

```ts
class AdvancedRenderer extends Renderer {
  
  // Override _canBatch for batching support
  override _canBatch(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    // Return true if these elements can be batched together
    // Check material compatibility, transform similarity, etc.
    return elementA.material === elementB.material && 
           this.areTransformsSimilar(elementA, elementB);
  }

  // Override _batch for custom batching logic
  override _batch(elementA: SubRenderElement, elementB?: SubRenderElement): void {
    // Implement batching logic to render multiple elements efficiently
    this.combineBatchElements(elementA, elementB);
  }

  // Custom update optimization
  override update(deltaTime: number): void {
    // Only update when necessary
    if (this.needsUpdate()) {
      this.performExpensiveCalculations();
    }
  }

  private areTransformsSimilar(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    // Custom logic to determine if transforms are similar enough for batching
    return true;
  }

  private combineBatchElements(elementA: SubRenderElement, elementB?: SubRenderElement): void {
    // Combine render elements for efficient rendering
  }

  private needsUpdate(): boolean {
    // Custom logic to determine if update is needed
    return true;
  }

  private performExpensiveCalculations(): void {
    // Expensive operations that should only run when necessary
  }
}
```

## Performance Optimization

### Efficient Material Management

```ts
class OptimizedRenderer extends Renderer {
  private static sharedMaterials = new Map<string, Material>();

  // Use shared materials when possible
  static getSharedMaterial(materialId: string): Material {
    if (!this.sharedMaterials.has(materialId)) {
      this.sharedMaterials.set(materialId, this.createMaterial(materialId));
    }
    return this.sharedMaterials.get(materialId);
  }

  // Only create instance materials when needed
  setupMaterials(): void {
    // Use shared material for common properties
    const sharedMaterial = OptimizedRenderer.getSharedMaterial("standard");
    this.setMaterial(sharedMaterial);

    // Only create instance if you need per-object customization
    if (this.needsCustomization()) {
      const instanceMaterial = this.getInstanceMaterial();
      instanceMaterial.baseColor.set(this.customColor.r, this.customColor.g, this.customColor.b, 1);
    }
  }

  private needsCustomization(): boolean {
    // Return true if this renderer needs unique material properties
    return this.customColor !== null;
  }
}
```

### Transform Update Optimization

```ts
class TransformOptimizedRenderer extends Renderer {
  private worldChangeFlag: BoolUpdateFlag;

  constructor(entity: Entity) {
    super(entity);
    this.worldChangeFlag = entity.registerWorldChangeFlag();
  }

  override update(deltaTime: number): void {
    // Only update transform-dependent data when the world matrix becomes dirty
    if (this.worldChangeFlag.flag) {
      this.worldChangeFlag.flag = false;
      this.updateTransformDependentData();
    }
  }

  private updateTransformDependentData(): void {
    // Update data that depends on transform changes
    this.shaderData.setMatrix("customMatrix", this.calculateCustomMatrix());
  }

  private calculateCustomMatrix(): Matrix {
    // Expensive transform-dependent calculation
    return new Matrix();
  }
}
```

## Common Patterns

### Multi-Material Renderer

```ts
class MultiMaterialRenderer extends Renderer {
  private materials: Material[] = [];

  addMaterial(material: Material): void {
    this.materials.push(material);
    this.setMaterials(this.materials);
  }

  removeMaterial(index: number): void {
    if (index >= 0 && index < this.materials.length) {
      this.materials.splice(index, 1);
      this.setMaterials(this.materials);
    }
  }

  setMaterialProperty(materialIndex: number, property: string, value: any): void {
    const instanceMaterial = this.getInstanceMaterial(materialIndex);
    if (instanceMaterial) {
      instanceMaterial.shaderData.setFloat(property, value);
    }
  }
}
```

### LOD (Level of Detail) Renderer

```ts
class LODRenderer extends Renderer {
  private lodMaterials: Material[] = [];
  private lodDistances: number[] = [10, 50, 100];

  override update(deltaTime: number): void {
    // Find camera by traversing scene entities
    const camera = this.findSceneCamera();
    if (camera) {
      const distance = Vector3.distance(
        this.entity.transform.worldPosition,
        camera.entity.transform.worldPosition
      );
      
      const lodLevel = this.calculateLODLevel(distance);
      this.setMaterial(this.lodMaterials[lodLevel]);
    }
  }

  private findSceneCamera(): Camera | null {
    // Traverse scene to find active camera
    const rootEntities = this.scene.rootEntities;
    for (let i = 0; i < rootEntities.length; i++) {
      const camera = this.findCameraInEntity(rootEntities[i]);
      if (camera) return camera;
    }
    return null;
  }

  private findCameraInEntity(entity: Entity): Camera | null {
    const camera = entity.getComponent(Camera);
    if (camera && camera.enabled) {
      return camera;
    }
    
    // Search in children
    for (let i = 0; i < entity.children.length; i++) {
      const childCamera = this.findCameraInEntity(entity.children[i]);
      if (childCamera) return childCamera;
    }
    
    return null;
  }

  private calculateLODLevel(distance: number): number {
    for (let i = 0; i < this.lodDistances.length; i++) {
      if (distance < this.lodDistances[i]) {
        return i;
      }
    }
    return this.lodDistances.length; // Lowest quality
  }
}
```

## API Reference

```apidoc
Renderer:
  Properties:
    shaderData: ShaderData
      - Per-renderer shader properties and macros. Use to set custom shader values.
    isCulled: boolean
      - Whether renderer was culled in current frame and won't participate in rendering.
    receiveShadows: boolean
      - Whether this renderer receives shadows from shadow-casting objects.
    castShadows: boolean
      - Whether this renderer casts shadows on other objects.
    materialCount: number
      - Number of material slots. Setting this resizes the materials array.
    bounds: BoundingBox
      - World-space bounding box of the renderer. Calculated automatically.
    priority: number
      - Render priority. Lower values render first, higher values render last.

  Methods:
    getMaterial(): Material | null
    getMaterial(index: number): Material | null
      - Get material by index. Returns null if no material at index.
    setMaterial(material: Material, index?: number): void
      - Set material at specified index. If index omitted, sets first material.
    getMaterials(): Material[]
      - Get array of all materials contained in the renderer.
    getInstanceMaterial(index?: number): Material
      - Get instance material at specified index. Creates copy on first access.
    getInstanceMaterials(): Material[]
      - Get copies (instances) of all materials contained in the renderer.
    update(deltaTime: number): void
      - Override for per-frame update logic. Called automatically if overridden.

  Protected Methods:
    _updateBounds(worldBounds: BoundingBox): void
      - Override to implement custom bounding box calculation.
    _render(context: RenderContext): void
      - Override to implement custom rendering logic. Must be implemented by subclasses.
    _update(context: RenderContext): void
      - Override for render-time update logic. Called once per frame during rendering.
    _canBatch(elementA: SubRenderElement, elementB: SubRenderElement): boolean
      - Override to enable batching. Return true if elements can be batched together.
    _batch(elementA: SubRenderElement, elementB?: SubRenderElement): void
      - Override to implement batching logic for efficient multi-object rendering.
    _updateTransformShaderData(context: RenderContext, onlyMVP: boolean, batched: boolean): void
      - Updates transform-related shader properties. Called automatically.

RendererUpdateFlags:
    WorldVolume = 0x1
      - Flag indicating world position and bounds need updating.
```

## Best Practices

- **Use Shared Materials**: Create shared materials for objects with identical properties to reduce memory usage
- **Instance Materials Sparingly**: Only create instance materials when you need per-object customization
- **Optimize Update Methods**: Only override `update()` if you need per-frame logic; empty updates still have overhead
- **Cache Transform Queries**: Avoid frequent transform property access in performance-critical code
- **Set Appropriate Priorities**: Use render priority to control draw order for correct transparency and depth testing
- **Implement Efficient Bounds**: Override `_updateBounds()` with accurate but efficient bounding box calculations
- **Use Shader Macros**: Enable/disable shader features through macros rather than multiple materials
- **Batch When Possible**: Implement batching for renderers that draw many similar objects

## Common Issues

**Material Reference Leaks**: Always set materials through Renderer methods to ensure proper reference counting:
```ts
// ✅ Correct - manages references automatically
renderer.setMaterial(material);

// ❌ Wrong - bypasses reference counting
// Never access internal material arrays directly
// Use setMaterial() method instead
```

**Bounds Not Updating**: Override `_updateBounds()` for custom geometry:
```ts
protected override _updateBounds(worldBounds: BoundingBox): void {
  // Calculate accurate bounds based on your renderer's geometry
  const center = this.entity.transform.worldPosition;
  worldBounds.min.set(center.x - 1, center.y - 1, center.z - 1);
  worldBounds.max.set(center.x + 1, center.y + 1, center.z + 1);
}
```

**Unnecessary Instancing**: Don't get instance materials unless you need unique properties:
```ts
// ✅ Use shared material when no customization needed
const material = renderer.getMaterial();

// ❌ Creates unnecessary instance
const material = renderer.getInstanceMaterial(); // Only if you need unique properties
```

**Update Performance**: Only implement `update()` when necessary:
```ts
// ✅ Only update when needed
override update(deltaTime: number): void {
  if (this.needsAnimation) {
    this.animateProperties(deltaTime);
  }
}

// ❌ Empty update still has overhead
override update(deltaTime: number): void {
  // Empty - remove this override
}
```
