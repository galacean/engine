# RenderPipeline

Galacean's `RenderPipeline` system orchestrates the entire rendering process, managing render passes, culling operations, batching optimizations, and post-processing effects. The `BasicRenderPipeline` serves as the default implementation, providing a complete forward rendering pipeline with shadow mapping, ambient occlusion, and HDR support.

The render pipeline consists of several key components:
- **BasicRenderPipeline**: Main pipeline orchestrator handling render pass execution
- **RenderContext**: Rendering context management with camera matrices and render targets
- **CullingResults**: Organized render queues after frustum culling and sorting
- **BatcherManager**: Batching system for optimizing draw calls
- **Blitter**: Utility for efficient texture copying and post-processing
- **PipelinePass**: Base class for custom render passes

## Quick Start

```ts
import { WebGLEngine, Camera } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;

// Create camera with default pipeline
const cameraEntity = scene.createRootEntity("Camera");
const camera = cameraEntity.addComponent(Camera);

// Pipeline is automatically created and managed internally by the camera
// The render pipeline is not directly accessible from external code
// Advanced configuration is done through camera properties and custom passes

// For advanced rendering pipeline customization, you need to:
// 1. Create custom render passes by extending existing pipeline classes
// 2. Modify engine source code for deep pipeline changes
// 3. Use camera properties for standard configuration (HDR, MSAA, etc.)
```

## BasicRenderPipeline

The `BasicRenderPipeline` implements a complete forward rendering pipeline with multiple passes:

```ts
// Pipeline automatically handles these render passes:
// 1. Shadow mapping pass (cascaded shadow maps)
// 2. Depth-only pass (for depth texture generation)
// 3. Opaque geometry pass
// 4. Alpha-test geometry pass  
// 5. Opaque texture copy (for refraction effects)
// 6. Transparent geometry pass
// 7. Post-processing passes
// 8. Final composition pass

// The pipeline manages render targets and viewport automatically
camera.enableHDR = true;           // Enable HDR rendering
camera.opaqueTextureEnabled = true; // Enable opaque texture for refraction
camera.depthTextureMode = DepthTextureMode.Depth; // Generate depth texture
```

### Render Pass Execution

```ts
// The pipeline executes passes in this order (internal implementation):
// Note: BasicRenderPipeline is created internally by Camera, not directly accessible

// 1. Shadow Pass - generates shadow maps for directional lights
// 2. Depth Pass - creates depth texture for effects
// 3. Opaque Pass - renders opaque objects front-to-back
// 4. Alpha Test Pass - renders alpha-tested objects
// 5. Opaque Texture Copy - captures opaque results for refraction
// 6. Transparent Pass - renders transparent objects back-to-front
// 7. Post Process - applies screen-space effects
// 8. Final Pass - tone mapping and gamma correction
```

## RenderContext

The `RenderContext` manages rendering state and provides access to camera matrices, render targets, and shader replacement:

```ts
import { RenderContext, ContextRendererUpdateFlag } from "@galacean/engine";

// Context is automatically created during rendering
// Access context in custom render passes or renderers
class CustomRenderer extends Renderer {
  _render(context: RenderContext): void {
    // Access camera matrices
    const viewMatrix = context.viewMatrix;
    const projectionMatrix = context.projectionMatrix;
    const vpMatrix = context.viewProjectionMatrix;
    
    // Set render target
    context.setRenderTarget(customTarget, viewport, mipLevel);
    
    // Check if matrices need updating
    if (context.rendererUpdateFlag & ContextRendererUpdateFlag.viewProjectionMatrix) {
      // Update renderer-specific matrices
    }
  }
}
```

### Virtual Camera Integration

```ts
// Virtual camera transformations are applied internally by the engine
// The applyVirtualCamera method is called internally during rendering
// External code cannot access camera.virtualCamera directly

// The engine automatically handles:
// - View matrix transformation
// - Projection matrix with optional Y-flip for render targets
// - View-projection matrix combination
// - Shader uniform updates for camera parameters
```

## CullingResults

The `CullingResults` organizes renderers into separate queues after frustum culling:

```ts
import { CullingResults, RenderQueueType } from "@galacean/engine";

// Results are automatically populated during pipeline execution.
// Custom render passes receive queue collections via the RenderContext parameter.
// Queues are organized by material transparency to preserve blending correctness.
```

### Queue Management

```ts
// RenderContext provides access to camera matrices and render targets
// Render queues are managed internally by the pipeline
// Available RenderContext properties and methods:
context.camera;                    // Current camera being rendered
context.virtualCamera;             // Virtual camera with matrices (read-only)
context.viewMatrix;                // Current view matrix
context.projectionMatrix;          // Current projection matrix
context.viewProjectionMatrix;      // Combined view-projection matrix
context.flipProjection;            // Whether Y-axis is flipped

// Methods:
context.setRenderTarget(destination, viewport, mipLevel?, faceIndex?); // Set render target
```

## BatcherManager

The `BatcherManager` optimizes rendering by batching compatible draw calls:

```ts
// BatcherManager is internal to the engine and not directly accessible
// Batching is automatically handled by the engine based on:
// - Material properties and shader compatibility
// - Mesh geometry and vertex layout
// - Renderer settings and render state

// To optimize batching, focus on:
// 1. Using shared materials across multiple objects
// 2. Grouping objects with similar properties together
// 3. Minimizing material property changes
// 4. Using texture atlases to reduce texture switches

// Batching happens automatically during rendering based on compatibility
```

### Batching Optimization Guidelines

```ts
// Optimize for automatic batching by grouping compatible objects
class OptimizedRenderer extends Renderer {
  // Use shared materials to enable batching
  static sharedMaterial = new UnlitMaterial(engine);

  constructor(entity: Entity) {
    super(entity);
    // Use the shared material for batching
    this.setMaterial(OptimizedRenderer.sharedMaterial);
  }

  // Group objects with similar properties
  setupForBatching(): void {
    // Use same mesh instances where possible
    // Keep material properties consistent
    // Minimize render state changes
  }
}
```

## Blitter

The `Blitter` provides efficient texture copying and post-processing utilities:

```ts
import { Blitter, RenderTarget, Texture2D } from "@galacean/engine";

// Basic texture copy
Blitter.blitTexture(
  engine,
  sourceTexture,    // Source texture
  targetRenderTarget, // Destination render target (null for screen)
  mipLevel,         // Mip level to write
  viewport,         // Viewport rectangle
  material,         // Optional material for custom processing
  passIndex         // Material pass index
);

// Copy with custom material for effects
const blurMaterial = new Material(engine, blurShader);
Blitter.blitTexture(engine, sourceTexture, targetRT, 0, viewport, blurMaterial);

// Screen-space post-processing
Blitter.blitTexture(engine, hdrTexture, null, 0, viewport, toneMappingMaterial);
```

### Advanced Blitting

```ts
// Blit with source scale and offset for partial copies
const sourceScaleOffset = new Vector4(0.5, 0.5, 0.25, 0.25); // scale XY, offset XY
Blitter.blitTexture(engine, source, target, 0, viewport, null, 0, sourceScaleOffset);

// Multi-pass post-processing chain
const tempRT1 = new RenderTarget(engine, width, height);
const tempRT2 = new RenderTarget(engine, width, height);

// Pass 1: Blur horizontal
Blitter.blitTexture(engine, sourceTexture, tempRT1, 0, viewport, blurHMaterial);
// Pass 2: Blur vertical  
Blitter.blitTexture(engine, tempRT1.getColorTexture(0), tempRT2, 0, viewport, blurVMaterial);
// Pass 3: Composite
Blitter.blitTexture(engine, tempRT2.getColorTexture(0), null, 0, viewport, compositeMaterial);
```

## PipelinePass

Create custom render passes by extending `PipelinePass`:

```ts
import { PipelinePass, RenderContext, CullingResults } from "@galacean/engine";

class CustomPostProcessPass extends PipelinePass {
  private material: Material;
  private renderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);
    this.material = new Material(engine, customShader);
    this.renderTarget = new RenderTarget(engine, 1024, 1024);
  }

  onRender(context: RenderContext, cullingResults: CullingResults): void {
    // Set render target
    context.setRenderTarget(this.renderTarget, PipelineUtils.defaultViewport);

    // Render custom effect
    // Note: You need to provide a source texture
    const sourceTexture = context.camera.renderTarget?.getColorTexture(0) ?? this.defaultTexture;

    Blitter.blitTexture(
      this.engine,
      sourceTexture,
      this.renderTarget,
      0,
      PipelineUtils.defaultViewport,
      this.material
    );
  }
}

// Add custom pass to pipeline (requires pipeline modification)
```

## Pipeline Configuration

Configure pipeline behavior through camera settings:

```ts
import { Camera, DepthTextureMode, MSAASamples } from "@galacean/engine";

const camera = cameraEntity.addComponent(Camera);

// Render target configuration
camera.renderTarget = customRenderTarget;  // Custom render target
camera.viewport = new Vector4(0, 0, 1, 1); // Viewport rectangle

// Quality settings
camera.msaaSamples = MSAASamples.FourX;     // Anti-aliasing (4x MSAA)
camera.enableHDR = true;                   // High dynamic range

// Feature toggles
camera.depthTextureMode = DepthTextureMode.Depth; // Depth texture generation
camera.opaqueTextureEnabled = true;        // Opaque texture for refraction
camera.enableFrustumCulling = true;        // Frustum culling

// Clear settings
camera.clearFlags = CameraClearFlags.All;
camera.clearColor = new Color(0.2, 0.3, 0.4, 1.0);
```

### Shadow Configuration

```ts
import { ShadowType, ShadowResolution, ShadowCascadesMode } from "@galacean/engine";

// Configure shadow settings on scene
const scene = engine.sceneManager.activeScene;
scene.shadowDistance = 100;               // Shadow distance
scene.shadowCascades = ShadowCascadesMode.FourCascades; // Cascade count
scene.shadowResolution = ShadowResolution.High; // Shadow map resolution

// Light shadow settings
const lightEntity = scene.createRootEntity("DirectionalLight");
const light = lightEntity.addComponent(DirectLight);
light.shadowType = ShadowType.SoftLow;    // Shadow quality
light.shadowStrength = 0.8;               // Shadow intensity
light.shadowBias = 0.001;                 // Shadow bias
light.shadowNormalBias = 0.1;             // Normal bias
```

## Performance Optimization

### Culling Optimization

```ts
// Layer-based culling
camera.cullingMask = Layer.Layer0 | Layer.Layer1; // Only render specific layers

// Distance-based culling
renderer.bounds; // Automatic bounds calculation for culling

// Custom culling in renderer
class OptimizedRenderer extends Renderer {
  // Override the protected _updateBounds method for custom bounds calculation
  protected override _updateBounds(worldBounds: BoundingBox): void {
    // Calculate custom bounds based on your renderer's geometry
    const center = this.entity.transform.worldPosition;
    const size = 1.0; // Custom size calculation

    worldBounds.min.set(center.x - size, center.y - size, center.z - size);
    worldBounds.max.set(center.x + size, center.y + size, center.z + size);
  }
}
```

### Batching Optimization

```ts
// Enable instancing for repeated objects
const instancedMaterial = new Material(engine, instancedShader);
instancedMaterial.enableInstancing = true;

// Use same material and mesh for better batching
const sharedMaterial = new PBRMaterial(engine);
const sharedMesh = PrimitiveMesh.createSphere(engine, 1);

// Multiple entities using same material/mesh will be batched
for (let i = 0; i < 100; i++) {
  const entity = scene.createRootEntity(`Sphere${i}`);
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = sharedMesh;
  renderer.setMaterial(sharedMaterial);
}
```

### Memory Management

```ts
// Dispose pipeline resources when no longer needed
pipeline.destroy();

// Reuse render targets
const rtPool = new Map<string, RenderTarget>();
function getRenderTarget(key: string, width: number, height: number): RenderTarget {
  if (!rtPool.has(key)) {
    rtPool.set(key, new RenderTarget(engine, width, height));
  }
  return rtPool.get(key);
}

// Clean up temporary resources
tempRT1.destroy();
tempRT2.destroy();
```

## API Reference

```apidoc
BasicRenderPipeline:
  Constructor:
    constructor(camera: Camera)
      - Creates a new render pipeline for the specified camera.

  Methods:
    render(context: RenderContext, cubeFace?: TextureCubeFace, mipLevel?: number, ignoreClear?: CameraClearFlags): void
      - Executes the complete rendering pipeline.
    destroy(): void
      - Releases all pipeline resources.

RenderContext:
  Properties:
    camera: Camera
      - The camera being rendered.
    viewMatrix: Matrix
      - Current view matrix.
    projectionMatrix: Matrix
      - Current projection matrix.
    viewProjectionMatrix: Matrix
      - Combined view-projection matrix.
    rendererUpdateFlag: ContextRendererUpdateFlag
      - Flags indicating which matrices need updating.

  Methods:
    setRenderTarget(destination: RenderTarget | null, viewport: Vector4, mipLevel?: number, faceIndex?: TextureCubeFace): void
      - Sets the active render target and viewport.

  Internal Methods (not accessible from external code):
    applyVirtualCamera(virtualCamera: VirtualCamera, flipProjection: boolean): void
      - Internal method that applies virtual camera transformations.

CullingResults:
  Internal Properties (managed by the engine):
    Render queues are managed internally and not directly accessible.
    The engine automatically sorts objects into opaque, alpha-tested, and transparent queues.

  Methods:
    reset(): void
      - Clears all render queues (internal use only).

BatcherManager (Internal):
  The BatcherManager is an internal engine component not accessible from external code.
  Batching is automatically handled based on material and mesh compatibility.

  To optimize batching:
  - Use shared materials across multiple objects
  - Group objects with similar rendering properties
  - Minimize material property changes during rendering

  Internal Methods (not accessible from external code):
    Batching methods are handled automatically by the engine.

Blitter:
  Static Methods:
    blitTexture(engine: Engine, source: Texture2D, destination: RenderTarget | null, mipLevel?: number, viewport?: Vector4, material?: Material, passIndex?: number, sourceScaleOffset?: Vector4): void
      - Copies texture data with optional material processing.
```

## Extending the Render Pipeline

**Important Note**: The render pipeline system uses internal APIs that are not publicly exposed. To extend or customize the rendering pipeline, you have several options:

### Option 1: Use Public Camera Configuration
```ts
// Configure rendering through public camera properties
camera.enableHDR = true;
camera.msaaSamples = MSAASamples.FourX;
camera.clearFlags = CameraClearFlags.SolidColor;
camera.cullingMask = Layer.Everything;
```

### Option 2: Create Custom Render Passes (Advanced)
For deep customization, you need to work with engine internals:

```ts
// This requires modifying engine source code or using type assertions
// Location: packages/core/src/RenderPipeline/BasicRenderPipeline.ts
// Location: packages/core/src/Camera.ts (lines 123, 465, 681)

// Example of extending BasicRenderPipeline (requires source modification):
class CustomRenderPipeline extends BasicRenderPipeline {
  // Override internal methods to add custom rendering logic
  // Note: This approach requires deep understanding of engine internals
}
```

### Option 3: Post-Processing Effects
Use the public post-processing system for visual effects:

```ts
import { PostProcessPass } from "@galacean/engine";

// Create custom post-processing effects
class CustomPostProcess extends PostProcessPass {
  // Implement custom visual effects
}
```

**Source Code References**:
- Camera render pipeline: `packages/core/src/Camera.ts:123` (`_renderPipeline`)
- Pipeline creation: `packages/core/src/Camera.ts:465` (constructor)
- Render execution: `packages/core/src/Camera.ts:681` (`_renderPipeline.render()`)
- BatcherManager: `packages/core/src/Engine.ts:68,240` (`_batcherManager`)
- RenderContext queues: `packages/core/src/RenderPipeline/RenderContext.ts`

## Best Practices

- Use the default `BasicRenderPipeline` unless you need custom rendering features
- Enable HDR only when necessary as it increases memory usage
- Configure shadow settings based on target platform performance
- Use layer-based culling to reduce unnecessary rendering
- Batch objects with the same material and mesh for better performance
- Dispose pipeline resources when switching scenes or cameras
- Profile rendering performance using browser developer tools
