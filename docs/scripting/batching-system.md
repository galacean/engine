# Batching System

The Galacean Engine's batching system is a sophisticated rendering optimization mechanism that reduces draw calls by combining compatible render elements. This system is crucial for achieving high performance, especially when rendering many similar objects like sprites, UI elements, and particles.

## Core Components

### BatcherManager

The `BatcherManager` is the central coordinator of the batching system, managing different types of primitive chunk managers for various rendering contexts.

```ts
// BatcherManager is internal to the engine - not directly accessible
// It manages three specialized chunk managers:

// 2D rendering (sprites, images)
const manager2D = engine._batcherManager.primitiveChunkManager2D;

// Mask rendering (sprite masks)
const managerMask = engine._batcherManager.primitiveChunkManagerMask;

// UI rendering (UI components)
const managerUI = engine._batcherManager.primitiveChunkManagerUI;
```

#### Key Features
- **Automatic Management**: Creates chunk managers on-demand
- **Type Specialization**: Different managers for 2D, UI, and mask rendering
- **Memory Optimization**: Mask manager uses smaller chunks (128 vertices vs 4096)
- **Buffer Coordination**: Synchronizes vertex buffer uploads across all managers

### RenderQueue

The `RenderQueue` organizes render elements by type and handles sorting and batching operations.

```ts
// RenderQueue types (internal enum)
enum RenderQueueType {
  Opaque = 1000,      // Solid objects, front-to-back sorting
  AlphaTest = 2000,   // Alpha-tested objects
  Transparent = 3000  // Transparent objects, back-to-front sorting
}

// Sorting strategies
class RenderQueue {
  // Opaque objects: priority first, then distance (front-to-back)
  static compareForOpaque(a: RenderElement, b: RenderElement): number {
    return a.priority - b.priority || a.distanceForSort - b.distanceForSort;
  }

  // Transparent objects: priority first, then distance (back-to-front)
  static compareForTransparent(a: RenderElement, b: RenderElement): number {
    return a.priority - b.priority || b.distanceForSort - a.distanceForSort;
  }
}
```

### RenderElement and SubRenderElement

These classes represent individual render operations and their sub-components.

```ts
// RenderElement - represents a complete renderable object
class RenderElement {
  priority: number;              // Render priority (lower = earlier)
  distanceForSort: number;       // Distance from camera for sorting
  subRenderElements: SubRenderElement[]; // Sub-elements for multi-material objects
  renderQueueFlags: RenderQueueFlags;   // Which queues this element belongs to
}

// SubRenderElement - represents a single draw call
class SubRenderElement {
  component: Renderer;           // The renderer component
  primitive: Primitive;          // Geometry data
  material: Material;            // Material and shader
  subPrimitive: SubMesh;         // Specific mesh section
  batched: boolean;              // Whether this element is batched
  texture?: Texture2D;           // Primary texture (for 2D elements)
  subChunk?: SubPrimitiveChunk;  // Memory chunk (for batched elements)
}
```

## Memory Management

### PrimitiveChunk

The `PrimitiveChunk` manages large vertex and index buffers that can be subdivided for batching.

```ts
// PrimitiveChunk configuration
class PrimitiveChunk {
  // Default vertex layout for 2D/UI elements
  // POSITION (Vector3) + TEXCOORD_0 (Vector2) + COLOR_0 (Vector4)
  // Total: 36 bytes per vertex (9 floats)
  
  maxVertexCount: number = 4096;  // Default max vertices per chunk
  vertexStride: number = 36;      // Bytes per vertex
  
  // Memory buffers
  vertices: Float32Array;         // Vertex data
  indices: Uint16Array;          // Index data
  
  // Free space management
  vertexFreeAreas: VertexArea[]; // Available memory regions
}
```

#### Vertex Layout
```ts
// Standard 2D/UI vertex format
const vertexElements = [
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),    // 12 bytes
  new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0), // 8 bytes  
  new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0)     // 16 bytes
];
// Total: 36 bytes per vertex
```

### SubPrimitiveChunk

Represents a allocated portion of a `PrimitiveChunk` for a specific render element.

```ts
class SubPrimitiveChunk {
  chunk: PrimitiveChunk;         // Parent chunk
  vertexArea: VertexArea;        // Allocated vertex region
  subMesh: SubMesh;              // Drawing information
  indices: number[];             // Local indices for this sub-chunk
}
```

### Memory Allocation Strategy

```ts
// Allocation process
class PrimitiveChunkManager {
  allocateSubChunk(vertexCount: number): SubPrimitiveChunk {
    // 1. Try existing chunks first
    for (const chunk of this.primitiveChunks) {
      const subChunk = chunk.allocateSubChunk(vertexCount);
      if (subChunk) return subChunk;
    }
    
    // 2. Create new chunk if needed
    const newChunk = new PrimitiveChunk(this.engine, this.maxVertexCount);
    this.primitiveChunks.push(newChunk);
    return newChunk.allocateSubChunk(vertexCount);
  }
}
```

## Batching Process

### 1. Element Collection

Renderers create render elements during the culling phase:

```ts
// Example: SpriteRenderer creating render elements
class SpriteRenderer extends Renderer {
  _render(context: RenderContext): void {
    const engine = context.camera.engine;
    
    // Get render element from pool
    const renderElement = engine._renderElementPool.get();
    renderElement.set(this.priority, this._distanceForSort);
    
    // Create sub-render element
    const subRenderElement = engine._subRenderElementPool.get();
    const subChunk = this._subChunk; // Pre-allocated chunk
    
    subRenderElement.set(
      this,                           // renderer
      material,                       // material
      subChunk.chunk.primitive,       // primitive
      subChunk.subMesh,              // sub-mesh
      this.sprite.texture,           // texture
      subChunk                       // chunk reference
    );
    
    renderElement.addSubRenderElement(subRenderElement);
    context.camera._renderPipeline.pushRenderElement(context, renderElement);
  }
}
```

### 2. Sorting and Batching

The render queue sorts elements and performs batching:

```ts
// RenderQueue batching process
class RenderQueue {
  sortBatch(compareFunc: Function, batcherManager: BatcherManager): void {
    // 1. Sort elements by priority and distance
    Utils._quickSort(this.elements, 0, this.elements.length, compareFunc);
    
    // 2. Perform batching
    this.batch(batcherManager);
  }
  
  batch(batcherManager: BatcherManager): void {
    batcherManager.batch(this);
  }
}
```

### 3. Compatibility Checking

Elements can only be batched if they are compatible:

```ts
// BatchUtils compatibility checking
class BatchUtils {
  static canBatchSprite(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    // Check if batching is disabled
    if (elementB.shaderPasses[0].getTagValue("DisableBatch") === true) {
      return false;
    }
    
    // Must use same chunk
    if (elementA.subChunk.chunk !== elementB.subChunk.chunk) {
      return false;
    }
    
    const rendererA = elementA.component as SpriteRenderer;
    const rendererB = elementB.component as SpriteRenderer;
    
    // Check compatibility
    return (
      rendererA.maskInteraction === rendererB.maskInteraction &&
      rendererA.maskLayer === rendererB.maskLayer &&
      elementA.texture === elementB.texture &&
      elementA.material === elementB.material
    );
  }
}
```

### 4. Batch Execution

The `BatcherManager` processes compatible elements:

```ts
// BatcherManager.batch() algorithm
batch(renderQueue: RenderQueue): void {
  const { elements, batchedSubElements } = renderQueue;
  let previousElement: SubRenderElement;
  let previousRenderer: Renderer;
  let previousConstructor: Function;
  
  for (const element of elements) {
    for (const subElement of element.subRenderElements) {
      const renderer = subElement.component;
      const constructor = renderer.constructor;
      
      if (previousElement) {
        // Check if can batch with previous element
        if (previousConstructor === constructor && 
            previousRenderer._canBatch(previousElement, subElement)) {
          
          // Batch elements together
          previousRenderer._batch(previousElement, subElement);
          previousElement.batched = true;
        } else {
          // Cannot batch - add previous element to render list
          batchedSubElements.push(previousElement);
          
          // Start new batch
          previousElement = subElement;
          previousRenderer = renderer;
          previousConstructor = constructor;
          renderer._batch(subElement);
          subElement.batched = false;
        }
      } else {
        // First element
        previousElement = subElement;
        previousRenderer = renderer;
        previousConstructor = constructor;
        renderer._batch(subElement);
        subElement.batched = false;
      }
    }
  }
  
  // Add final element
  if (previousElement) {
    batchedSubElements.push(previousElement);
  }
}
```

## Optimization Strategies

### 1. Material Sharing

```ts
// Good: Shared material enables batching
const sharedMaterial = new UnlitMaterial(engine);
sharedMaterial.baseTexture = atlas; // Use texture atlas

// Apply to multiple sprites
sprite1.setMaterial(sharedMaterial);
sprite2.setMaterial(sharedMaterial);
sprite3.setMaterial(sharedMaterial);
// These can be batched together
```

### 2. Texture Atlasing

```ts
// Good: Single atlas texture
const atlas = await engine.resourceManager.load<Texture2D>("atlas.png");

// Bad: Multiple individual textures
const tex1 = await engine.resourceManager.load<Texture2D>("sprite1.png");
const tex2 = await engine.resourceManager.load<Texture2D>("sprite2.png");
// Cannot batch due to different textures
```

### 3. Render Priority Management

```ts
// Group objects by priority for better batching
class GameObjectManager {
  setupBatchingPriorities(): void {
    // Background elements
    this.backgroundSprites.forEach(sprite => sprite.priority = 0);
    
    // Game objects
    this.gameObjects.forEach(obj => obj.priority = 100);
    
    // UI elements
    this.uiElements.forEach(ui => ui.priority = 200);
    
    // Effects
    this.effects.forEach(effect => effect.priority = 300);
  }
}
```

### 4. Chunk Size Optimization

```ts
// Different chunk sizes for different use cases
const batcherManager = engine._batcherManager;

// 2D sprites: Large chunks (4096 vertices)
const manager2D = batcherManager.primitiveChunkManager2D;

// UI elements: Large chunks (4096 vertices) 
const managerUI = batcherManager.primitiveChunkManagerUI;

// Masks: Small chunks (128 vertices) - masks are typically few
const managerMask = batcherManager.primitiveChunkManagerMask;
```

## Performance Considerations

### Buffer Upload Optimization

```ts
// PrimitiveChunk uses optimized buffer updates
uploadBuffer(): void {
  const { primitive, updateVertexStart, updateVertexEnd } = this;
  
  // Only upload changed regions
  if (updateVertexStart !== Number.MAX_SAFE_INTEGER) {
    primitive.vertexBufferBindings[0].buffer.setData(
      this.vertices,
      updateVertexStart * 4,      // byte offset
      updateVertexStart,          // element offset  
      updateVertexEnd - updateVertexStart, // element count
      SetDataOptions.Discard      // Discard for performance
    );
  }
  
  // Upload index data
  primitive.indexBufferBinding.buffer.setData(
    this.indices, 0, 0, this.updateIndexLength, SetDataOptions.Discard
  );
}
```

### Memory Pool Usage

```ts
// Object pools reduce garbage collection
class PrimitiveChunk {
  static areaPool = new ReturnableObjectPool(VertexArea, 10);
  static subChunkPool = new ReturnableObjectPool(SubPrimitiveChunk, 10);
  static subMeshPool = new ReturnableObjectPool(SubMesh, 10);
}

// Engine-level pools
class Engine {
  _renderElementPool = new ClearableObjectPool(RenderElement);
  _subRenderElementPool = new ClearableObjectPool(SubRenderElement);
}
```

## Best Practices

### 1. Design for Batching

```ts
// Good: Design systems with batching in mind
class ParticleSystem {
  constructor() {
    // Use shared material for all particles
    this.material = new UnlitMaterial(engine);
    this.material.baseTexture = this.particleAtlas;
  }
  
  createParticle(): Particle {
    const particle = new Particle();
    particle.setMaterial(this.material); // Shared material
    return particle;
  }
}
```

### 2. Minimize State Changes

```ts
// Good: Group by material properties
const sprites = [sprite1, sprite2, sprite3];
sprites.sort((a, b) => {
  // Sort by material first, then by texture
  if (a.material !== b.material) {
    return a.material.instanceId - b.material.instanceId;
  }
  return a.texture.instanceId - b.texture.instanceId;
});
```

### 3. Monitor Batching Effectiveness

```ts
// Check batching statistics (development only)
class BatchingProfiler {
  measureBatchingEfficiency(): void {
    const renderQueue = camera._renderPipeline._cullingResults.opaqueQueue;
    const totalElements = renderQueue.elements.length;
    const batchedElements = renderQueue.batchedSubElements.length;
    
    console.log(`Batching efficiency: ${batchedElements}/${totalElements} elements`);
    console.log(`Draw call reduction: ${((totalElements - batchedElements) / totalElements * 100).toFixed(1)}%`);
  }
}
```

The batching system is a critical performance optimization that works automatically but can be significantly improved through careful design decisions around materials, textures, and object organization.
