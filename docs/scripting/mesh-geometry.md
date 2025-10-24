# Mesh and Geometry

Galacean's mesh and geometry system provides comprehensive 3D mesh management, procedural geometry generation, and advanced vertex data operations. Built on efficient GPU buffer management and vertex manipulation capabilities, it supports complex mesh operations including blend shapes, skinning, and dynamic vertex modifications for high-performance 3D applications.

## Overview

The mesh system consists of several key components:
- **ModelMesh**: Advanced mesh class with vertex data management, blend shapes, and GPU buffer operations
- **PrimitiveMesh**: Factory class for creating procedural primitive geometries
- **Vertex Buffer Management**: Efficient GPU buffer binding and vertex attribute handling
- **Blend Shapes**: Morph target animation support for facial animation and deformation
- **Mesh Renderers**: MeshRenderer and SkinnedMeshRenderer for rendering mesh data

## Quick Start

```ts
import { WebGLEngine, ModelMesh, PrimitiveMesh, MeshRenderer } from "@galacean/engine";
import { Vector3, Color } from "@galacean/engine-math";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;

// Create primitive mesh
const entity = scene.createRootEntity("Sphere");
const meshRenderer = entity.addComponent(MeshRenderer);

// Generate sphere geometry
const sphereMesh = PrimitiveMesh.createSphere(engine, 1.0, 32);
meshRenderer.mesh = sphereMesh;

// Access and modify vertex data
const positions = sphereMesh.getPositions();
const normals = sphereMesh.getNormals();

// Create custom mesh with vertex data
const customMesh = new ModelMesh(engine);
customMesh.setPositions([
  new Vector3(-1, -1, 0),
  new Vector3(1, -1, 0),
  new Vector3(0, 1, 0)
]);
customMesh.setIndices(new Uint16Array([0, 1, 2]));
customMesh.uploadData(false);

engine.run();
```

## ModelMesh System

### Advanced Vertex Data Management

ModelMesh provides comprehensive vertex data operations with automatic GPU buffer synchronization:

```ts
import { ModelMesh, VertexAttribute } from "@galacean/engine";
import { Vector3, Vector2, Vector4, Color } from "@galacean/engine-math";

const mesh = new ModelMesh(engine);

// Set vertex positions
const positions = [
  new Vector3(0, 1, 0),    // Top vertex
  new Vector3(-1, -1, 0),  // Bottom left
  new Vector3(1, -1, 0)    // Bottom right
];
mesh.setPositions(positions);

// Set texture coordinates
const uvs = [
  new Vector2(0.5, 1),     // Top center
  new Vector2(0, 0),       // Bottom left
  new Vector2(1, 0)        // Bottom right
];
mesh.setUVs(uvs);

// Set vertex normals
const normals = [
  new Vector3(0, 0, 1),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, 1)
];
mesh.setNormals(normals);

// Set vertex colors
const colors = [
  new Color(1, 0, 0, 1),   // Red
  new Color(0, 1, 0, 1),   // Green
  new Color(0, 0, 1, 1)    // Blue
];
mesh.setColors(colors);

// Set indices for triangle topology
mesh.setIndices(new Uint16Array([0, 1, 2]));

// Add SubMesh to define rendering range
mesh.addSubMesh(0, 3); // Start at vertex 0, render 3 vertices

// Upload to GPU
mesh.uploadData(false); // false = keep CPU data accessible for modifications
```

### Dynamic Vertex Modification

ModelMesh supports runtime vertex data modification for animation and effects:

```ts
// Get existing vertex data
const positions = mesh.getPositions();
const normals = mesh.getNormals();

// Modify vertex positions (e.g., wave animation)
if (positions) {
  const time = engine.time.elapsedTime;
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    pos.y += Math.sin(time + pos.x * 2) * 0.1;
  }
  
  // Update mesh with modified data
  mesh.setPositions(positions);
  mesh.uploadData(false); // false = keep data accessible for future modifications
}

// Recalculate normals after position changes
if (normals) {
  // Custom normal calculation or use utility functions
  mesh.setNormals(normals);
}
```

### Low-Level Buffer Management

For advanced mesh manipulation, use low-level buffer operations:

```ts
import { Buffer, BufferBindFlag, VertexElement, VertexElementFormat, VertexAttribute } from "@galacean/engine";

// Create custom vertex buffer
const positions = new Float32Array([0, 1, 0, -1, -1, 0, 1, -1, 0]);
const posBuffer = new Buffer(
  engine,
  BufferBindFlag.VertexBuffer,
  positions,
  BufferUsage.Static,
  true // readable = true for data access
);

// Set vertex buffer binding
mesh.setVertexBufferBinding(posBuffer, 12, 0); // stride=12 bytes, offset=0

// Define vertex elements
const vertexElements = [
  new VertexElement(
    VertexAttribute.Position,
    0, // offset
    VertexElementFormat.Vector3,
    0  // stream index
  )
];
mesh.setVertexElements(vertexElements);

// Upload data to GPU
mesh.uploadData(false);
```

### Blend Shapes (Morph Targets)

ModelMesh supports blend shapes for facial animation and mesh deformation:

```ts
import { BlendShape } from "@galacean/engine";

// Create base mesh
const mesh = new ModelMesh(engine);
const positions = [
  new Vector3(-1.0, -1.0, 1.0),
  new Vector3(1.0, -1.0, 1.0),
  new Vector3(1.0, 1.0, 1.0),
  new Vector3(-1.0, 1.0, 1.0)
];
mesh.setPositions(positions);
mesh.addSubMesh(0, 4);

// Create blend shape with delta positions
const deltaPositions = [
  new Vector3(0.0, 0.0, 0.0),   // No change
  new Vector3(0.0, 0.0, 0.0),   // No change
  new Vector3(-1.0, 0.0, 0.0),  // Move left
  new Vector3(1.0, 0.0, 0.0)    // Move right
];

const blendShape = new BlendShape("Smile");
blendShape.addFrame(1.0, deltaPositions); // Weight 1.0 = full effect
mesh.addBlendShape(blendShape);

mesh.uploadData(false);

// Apply blend shape in SkinnedMeshRenderer
const skinnedRenderer = entity.addComponent(SkinnedMeshRenderer);
skinnedRenderer.mesh = mesh;
skinnedRenderer.blendShapeWeights = new Float32Array([0.5]); // 50% blend
```

## Primitive Mesh Generation

### Sphere Generation

Create spheres with customizable subdivision and UV mapping:

```ts
// Basic sphere
const sphere = PrimitiveMesh.createSphere(engine, 1.0, 18);

// High-resolution sphere for smooth surfaces
const smoothSphere = PrimitiveMesh.createSphere(engine, 2.0, 32);

// Low-poly sphere for performance
const lowPolySphere = PrimitiveMesh.createSphere(engine, 1.0, 8);

// Sphere with accessible vertex data (for modification)
const editableSphere = PrimitiveMesh.createSphere(engine, 1.0, 18, false);
```

### Box/Cube Generation

Generate box geometries with customizable dimensions:

```ts
// Unit cube
const cube = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

// Rectangular box
const box = PrimitiveMesh.createCuboid(engine, 2, 1, 0.5);

// Segmented cube for subdivision
const segmentedCube = PrimitiveMesh.createCuboid(engine, 1, 1, 1, true);
```

### Plane Generation

Create flat surfaces for ground, walls, and UI backgrounds:

```ts
// Basic plane (1x1 units)
const plane = PrimitiveMesh.createPlane(engine, 1, 1);

// Large ground plane
const ground = PrimitiveMesh.createPlane(engine, 100, 100);

// Subdivided plane for displacement mapping
const detailedPlane = PrimitiveMesh.createPlane(engine, 10, 10, 50, 50);
```

### Cylinder Generation

Create cylindrical geometries for columns, tubes, and barrels:

```ts
// Basic cylinder
const cylinder = PrimitiveMesh.createCylinder(
  engine,
  0.5,    // radiusTop
  0.5,    // radiusBottom  
  2.0,    // height
  20,     // radialSegments
  1       // heightSegments
);

// Cone (radius bottom = 0)
const cone = PrimitiveMesh.createCylinder(engine, 0, 1, 2, 16, 1);

// Tapered cylinder
const taperedCylinder = PrimitiveMesh.createCylinder(engine, 0.3, 0.8, 3, 24, 1);
```

### Torus Generation

Create donut-shaped geometries for rings and wheels:

```ts
// Basic torus
const torus = PrimitiveMesh.createTorus(
  engine,
  0.4,    // radius (main radius)
  0.1,    // tubeRadius (thickness)
  30,     // radialSegments
  20      // tubularSegments
);

// Thick ring
const ring = PrimitiveMesh.createTorus(engine, 2.0, 0.3, 32, 16);
```

### Capsule Generation

Create pill-shaped geometries for characters and collision:

```ts
// Character capsule
const capsule = PrimitiveMesh.createCapsule(
  engine,
  0.5,    // radius
  2.0,    // height
  10,     // radialSegments
  20      // heightSegments
);

// Collision capsule
const collisionCapsule = PrimitiveMesh.createCapsule(engine, 0.3, 1.8, 8, 12);
```

## Blend Shape System

### Blend Shape Setup

Blend shapes enable morph target animation for facial expressions and deformation:

```ts
import { BlendShape } from "@galacean/engine";

// Create base mesh
const baseMesh = new ModelMesh(engine);
const basePositions = [
  new Vector3(0, 0, 0),
  new Vector3(1, 0, 0),
  new Vector3(0.5, 1, 0)
];
baseMesh.setPositions(basePositions);

// Create blend shape with target positions
const blendShape = new BlendShape("smile");

// Define target vertex deltas (difference from base positions)
const deltaPositions = [
  new Vector3(0, 0, 0),      // No change for vertex 0
  new Vector3(0.2, 0.1, 0),  // Move vertex 1 right and up
  new Vector3(0, 0.2, 0)     // Move vertex 2 up
];
blendShape.addFrame(1.0, deltaPositions); // Frame at weight 1.0

// Add blend shape to mesh
baseMesh.addBlendShape(blendShape);
```

### Blend Shape Animation

Animate blend shapes for dynamic deformation:

```ts
// Get blend shape by index
const smileBlendShape = baseMesh.getBlendShape(0);

// Animate blend shape weight
class BlendShapeAnimator extends Script {
  private time: number = 0;
  private meshRenderer: MeshRenderer;

  onAwake(): void {
    this.meshRenderer = this.entity.getComponent(MeshRenderer);
  }

  onUpdate(deltaTime: number): void {
    this.time += deltaTime;
    
    // Oscillate blend shape weight between 0 and 1
    const weight = Math.sin(this.time) * 0.5 + 0.5;
    
    // Apply blend shape weight
    if (this.meshRenderer.mesh instanceof ModelMesh) {
      const mesh = this.meshRenderer.mesh;
      mesh.setBlendShapeWeight(0, weight); // Set weight for blend shape index 0
    }
  }
}
```

### Multiple Blend Shapes

Combine multiple blend shapes for complex animations:

```ts
// Add multiple blend shapes to mesh
const smileBlendShape = new BlendShape("smile");
const frownBlendShape = new BlendShape("frown");
const eyeBlinkBlendShape = new BlendShape("eyeBlink");

// Add each blend shape with different target deltas
baseMesh.addBlendShape(smileBlendShape);
baseMesh.addBlendShape(frownBlendShape);
baseMesh.addBlendShape(eyeBlinkBlendShape);

// Control multiple blend shapes
mesh.setBlendShapeWeight(0, 0.7);  // 70% smile
mesh.setBlendShapeWeight(1, 0.0);  // 0% frown
mesh.setBlendShapeWeight(2, 0.3);  // 30% eye blink
```

## Vertex Buffer Management

### Custom Vertex Layouts

Create custom vertex layouts for specialized rendering:

```ts
import { VertexElement, VertexElementFormat } from "@galacean/engine";

const mesh = new ModelMesh(engine);

// Define custom vertex layout
const vertexElements = [
  new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
  new VertexElement(VertexAttribute.Normal, 12, VertexElementFormat.Vector3, 0),
  new VertexElement(VertexAttribute.UV_0, 24, VertexElementFormat.Vector2, 0),
  new VertexElement(VertexAttribute.Color, 32, VertexElementFormat.Vector4, 0)
];

// Set vertex layout
mesh.setVertexElements(vertexElements);

// Create interleaved vertex data
const vertexData = new Float32Array([
  // Position (3), Normal (3), UV (2), Color (4)
  0, 1, 0,     0, 0, 1,     0.5, 1,     1, 0, 0, 1,  // Vertex 0
  -1, -1, 0,   0, 0, 1,     0, 0,       0, 1, 0, 1,  // Vertex 1
  1, -1, 0,    0, 0, 1,     1, 0,       0, 0, 1, 1   // Vertex 2
]);

// Upload vertex data
mesh.setVertexBufferBinding(0, new VertexBufferBinding(
  new Buffer(engine, BufferBindFlag.VertexBuffer, vertexData),
  48 // stride in bytes
));
```

### Multi-Stream Vertex Data

Use multiple vertex streams for flexible data layouts:

```ts
// Stream 0: Position and Normal
const positionNormalData = new Float32Array([
  0, 1, 0,   0, 0, 1,    // Vertex 0
  -1, -1, 0, 0, 0, 1,    // Vertex 1
  1, -1, 0,  0, 0, 1     // Vertex 2
]);

// Stream 1: UV and Color
const uvColorData = new Float32Array([
  0.5, 1,  1, 0, 0, 1,   // Vertex 0
  0, 0,    0, 1, 0, 1,   // Vertex 1
  1, 0,    0, 0, 1, 1    // Vertex 2
]);

// Define vertex elements for multiple streams
const vertexElements = [
  new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
  new VertexElement(VertexAttribute.Normal, 12, VertexElementFormat.Vector3, 0),
  new VertexElement(VertexAttribute.UV_0, 0, VertexElementFormat.Vector2, 1),
  new VertexElement(VertexAttribute.Color, 8, VertexElementFormat.Vector4, 1)
];

mesh.setVertexElements(vertexElements);

// Set multiple vertex buffer bindings
mesh.setVertexBufferBinding(0, new VertexBufferBinding(
  new Buffer(engine, BufferBindFlag.VertexBuffer, positionNormalData),
  24 // stride for stream 0
));

mesh.setVertexBufferBinding(1, new VertexBufferBinding(
  new Buffer(engine, BufferBindFlag.VertexBuffer, uvColorData),
  24 // stride for stream 1
));
```

## Mesh Utilities and Optimization

### Bounds Calculation

Mesh bounds are automatically calculated but can be manually updated:

```ts
// Get mesh bounds
const bounds = mesh.bounds;
console.log("Center:", bounds.center);
console.log("Size:", bounds.size);
console.log("Min:", bounds.min);
console.log("Max:", bounds.max);

// Force bounds recalculation after vertex modification
mesh.uploadData(true);
const updatedBounds = mesh.bounds;
```

### Memory Management

Optimize memory usage for large meshes:

```ts
// Create mesh with memory-conscious settings
const optimizedMesh = PrimitiveMesh.createSphere(engine, 1.0, 32, true);
// true = make vertex data no longer accessible (saves memory)

// For meshes that need runtime modification
const dynamicMesh = PrimitiveMesh.createSphere(engine, 1.0, 32, false);
// false = keep vertex data accessible for modifications

// Release mesh resources when done
mesh.destroy();
```

### Vertex Data Validation

Validate mesh data for debugging and quality assurance:

```ts
// Check mesh integrity
const positions = mesh.getPositions();
const indices = mesh.getIndices();

if (positions && indices) {
  console.log(`Mesh has ${positions.length} vertices and ${indices.length / 3} triangles`);
  
  // Validate index range
  const maxIndex = Math.max(...Array.from(indices));
  if (maxIndex >= positions.length) {
    console.error("Index out of range detected");
  }
  
  // Check for degenerate triangles
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];
    
    if (i0 === i1 || i1 === i2 || i0 === i2) {
      console.warn(`Degenerate triangle at indices ${i0}, ${i1}, ${i2}`);
    }
  }
}
```

## Advanced Mesh Operations

### Mesh Subdivision

Create smooth surfaces through subdivision:

```ts
// Subdivision utility for smooth surfaces
class MeshSubdivision {
  static subdivideTriangles(mesh: ModelMesh, iterations: number = 1): ModelMesh {
    let positions = mesh.getPositions();
    let indices = mesh.getIndices();
    
    if (!positions || !indices) return mesh;
    
    for (let iter = 0; iter < iterations; iter++) {
      const newPositions: Vector3[] = [...positions];
      const newIndices: number[] = [];
      const edgeMap = new Map<string, number>();
      
      // Subdivide each triangle
      for (let i = 0; i < indices.length; i += 3) {
        const i0 = indices[i];
        const i1 = indices[i + 1];
        const i2 = indices[i + 2];
        
        // Get or create midpoint vertices
        const mid01 = this.getMidpointVertex(i0, i1, positions, newPositions, edgeMap);
        const mid12 = this.getMidpointVertex(i1, i2, positions, newPositions, edgeMap);
        const mid20 = this.getMidpointVertex(i2, i0, positions, newPositions, edgeMap);
        
        // Create 4 new triangles
        newIndices.push(i0, mid01, mid20);
        newIndices.push(mid01, i1, mid12);
        newIndices.push(mid20, mid12, i2);
        newIndices.push(mid01, mid12, mid20);
      }
      
      positions = newPositions;
      indices = new Uint16Array(newIndices);
    }
    
    // Create subdivided mesh
    const subdividedMesh = new ModelMesh(mesh.engine);
    subdividedMesh.setPositions(positions);
    subdividedMesh.setIndices(indices);
    subdividedMesh.uploadData(false);
    
    return subdividedMesh;
  }
  
  private static getMidpointVertex(
    i0: number, 
    i1: number, 
    positions: Vector3[], 
    newPositions: Vector3[], 
    edgeMap: Map<string, number>
  ): number {
    const key = i0 < i1 ? `${i0}-${i1}` : `${i1}-${i0}`;
    
    if (edgeMap.has(key)) {
      return edgeMap.get(key)!;
    }
    
    // Create midpoint
    const p0 = positions[i0];
    const p1 = positions[i1];
    const midpoint = Vector3.add(p0, p1, new Vector3()).scale(0.5);
    
    const newIndex = newPositions.length;
    newPositions.push(midpoint);
    edgeMap.set(key, newIndex);
    
    return newIndex;
  }
}
```

### Procedural Mesh Generation

Create custom procedural geometries:

```ts
// Procedural terrain generation
class TerrainGenerator {
  static createHeightfieldTerrain(
    engine: Engine,
    width: number,
    height: number,
    segments: number,
    heightFunction: (x: number, z: number) => number
  ): ModelMesh {
    const mesh = new ModelMesh(engine);
    const positions: Vector3[] = [];
    const normals: Vector3[] = [];
    const uvs: Vector2[] = [];
    const indices: number[] = [];
    
    // Generate vertices
    for (let z = 0; z <= segments; z++) {
      for (let x = 0; x <= segments; x++) {
        const px = (x / segments - 0.5) * width;
        const pz = (z / segments - 0.5) * height;
        const py = heightFunction(px, pz);
        
        positions.push(new Vector3(px, py, pz));
        uvs.push(new Vector2(x / segments, z / segments));
        
        // Calculate normal (simplified)
        normals.push(new Vector3(0, 1, 0));
      }
    }
    
    // Generate indices for triangles
    for (let z = 0; z < segments; z++) {
      for (let x = 0; x < segments; x++) {
        const topLeft = z * (segments + 1) + x;
        const topRight = topLeft + 1;
        const bottomLeft = (z + 1) * (segments + 1) + x;
        const bottomRight = bottomLeft + 1;
        
        // Two triangles per quad
        indices.push(topLeft, bottomLeft, topRight);
        indices.push(topRight, bottomLeft, bottomRight);
      }
    }
    
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setUVs(uvs);
    mesh.setIndices(new Uint16Array(indices));
    mesh.uploadData(false);
    
    return mesh;
  }
}

// Usage
const terrain = TerrainGenerator.createHeightfieldTerrain(
  engine,
  50,  // width
  50,  // height
  64,  // segments
  (x, z) => Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2 // height function
);
```

## API Reference

```apidoc
ModelMesh:
  Properties:
    vertexCount: number
      - Number of vertices in the mesh. Calculated from position data.
    bounds: BoundingBox
      - Axis-aligned bounding box containing all mesh vertices.
    vertexElements: VertexElement[]
      - Array of vertex element descriptors defining vertex layout.
    vertexBufferBindings: VertexBufferBinding[]
      - GPU buffer bindings for vertex data streams.
    indexBufferBinding: IndexBufferBinding
      - GPU buffer binding for index data.

  Methods:
    setPositions(positions: Vector3[] | null): void
      - Set vertex position data. Triggers bounds recalculation.
    getPositions(): Vector3[] | null
      - Get vertex position data. Returns null if not accessible.
    setNormals(normals: Vector3[] | null): void
      - Set vertex normal vectors for lighting calculations.
    getNormals(): Vector3[] | null
      - Get vertex normal data.
    setUVs(uvs: Vector2[] | null, index?: number): void
      - Set texture coordinate data. index specifies UV channel (0-7).
    getUVs(index?: number): Vector2[] | null
      - Get texture coordinate data for specified UV channel.
    setColors(colors: Color[] | null): void
      - Set per-vertex color data.
    getColors(): Color[] | null
      - Get vertex color data.
    setIndices(indices: Uint8Array | Uint16Array | Uint32Array | null): void
      - Set triangle index data defining mesh topology.
    getIndices(): Uint8Array | Uint16Array | Uint32Array | null
      - Get triangle index data.
    setTangents(tangents: Vector4[] | null): void
      - Set vertex tangent vectors for normal mapping.
    getTangents(): Vector4[] | null
      - Get vertex tangent data.
    uploadData(noLongerAccessible: boolean): void
      - Upload mesh data to GPU. noLongerAccessible = true releases CPU memory.
    addBlendShape(blendShape: BlendShape): void
      - Add blend shape (morph target) to mesh.
    getBlendShape(index: number): BlendShape | null
      - Get blend shape by index.
    setBlendShapeWeight(index: number, weight: number): void
      - Set blend shape weight (0-1 range) for animation.
    getBlendShapeWeight(index: number): number
      - Get current blend shape weight.

PrimitiveMesh:
  Static Methods:
    createSphere(engine: Engine, radius?: number, segments?: number, noLongerAccessible?: boolean): ModelMesh
      - Create sphere mesh. radius defaults to 0.5, segments to 18.
    createCuboid(engine: Engine, width?: number, height?: number, depth?: number, noLongerAccessible?: boolean): ModelMesh
      - Create box mesh. Dimensions default to 1.0.
    createPlane(engine: Engine, width?: number, height?: number, widthSegments?: number, heightSegments?: number, noLongerAccessible?: boolean): ModelMesh
      - Create plane mesh. Dimensions default to 1.0, segments to 1.
    createCylinder(engine: Engine, radiusTop?: number, radiusBottom?: number, height?: number, radialSegments?: number, heightSegments?: number, noLongerAccessible?: boolean): ModelMesh
      - Create cylinder mesh. Radii default to 0.5, height to 2.0, segments to 20 and 1.
    createTorus(engine: Engine, radius?: number, tubeRadius?: number, radialSegments?: number, tubularSegments?: number, noLongerAccessible?: boolean): ModelMesh
      - Create torus mesh. Radius defaults to 0.5, tubeRadius to 0.2, segments to 30 and 20.
    createCapsule(engine: Engine, radius?: number, height?: number, radialSegments?: number, heightSegments?: number, noLongerAccessible?: boolean): ModelMesh
      - Create capsule mesh. Radius defaults to 0.5, height to 2.0, segments to 20.

BlendShape:
  Properties:
    name: string
      - Human-readable name for the blend shape.
    frameCount: number
      - Number of animation frames in this blend shape.

  Methods:
    addFrame(weight: number, deltaPositions: Vector3[], deltaNormals?: Vector3[], deltaTangents?: Vector3[]): void
      - Add animation frame with vertex deltas at specified weight.
    getFrameWeight(index: number): number
      - Get weight value for animation frame.
    getFramePositions(index: number): Vector3[]
      - Get position deltas for animation frame.

VertexElement:
  Properties:
    attribute: VertexAttribute
      - Semantic meaning of vertex data (Position, Normal, UV, etc.).
    offset: number
      - Byte offset within vertex buffer stride.
    format: VertexElementFormat
      - Data format (Vector3, Vector2, Vector4, etc.).
    bindingIndex: number
      - Index of vertex buffer binding containing this data.
```

## Best Practices

- **Memory Management**: Use `noLongerAccessible = true` for static meshes to save memory
- **Vertex Layout**: Use interleaved vertex data for better cache performance
- **Index Buffers**: Always use index buffers for non-trivial meshes to reduce vertex duplication
- **Blend Shapes**: Limit blend shape count and complexity for performance
- **Bounds Updates**: Mesh bounds update automatically, but consider manual updates for dynamic meshes
- **Vertex Attributes**: Only include necessary vertex attributes to minimize bandwidth
- **Buffer Streaming**: Use multiple vertex buffer bindings for data that updates at different frequencies
- **Topology**: Prefer triangle strips or fans for geometric primitives when possible

## Common Patterns

### Dynamic Mesh Modifier

```ts
class WaveModifier extends Script {
  private originalPositions: Vector3[];
  private mesh: ModelMesh;
  
  onAwake(): void {
    const meshRenderer = this.entity.getComponent(MeshRenderer);
    this.mesh = meshRenderer.mesh as ModelMesh;
    this.originalPositions = this.mesh.getPositions()?.slice() || [];
  }
  
  onUpdate(deltaTime: number): void {
    const positions = this.mesh.getPositions();
    if (!positions) return;
    
    const time = this.engine.time.elapsedTime;
    
    for (let i = 0; i < positions.length; i++) {
      const original = this.originalPositions[i];
      const wave = Math.sin(time * 2 + original.x * 5) * 0.2;
      positions[i].set(original.x, original.y + wave, original.z);
    }
    
    this.mesh.setPositions(positions);
    this.mesh.uploadData(true);
  }
}
```

### Mesh LOD System

```ts
class MeshLOD extends Script {
  public meshes: ModelMesh[] = [];
  public distances: number[] = [];
  private meshRenderer: MeshRenderer;
  private camera: Camera;
  
  onAwake(): void {
    this.meshRenderer = this.entity.getComponent(MeshRenderer);
    this.camera = Camera.main;
  }
  
  onUpdate(): void {
    if (!this.camera) return;
    
    const distance = Vector3.distance(
      this.entity.transform.worldPosition,
      this.camera.entity.transform.worldPosition
    );
    
    // Select appropriate LOD level
    let lodIndex = this.meshes.length - 1;
    for (let i = 0; i < this.distances.length; i++) {
      if (distance < this.distances[i]) {
        lodIndex = i;
        break;
      }
    }
    
    this.meshRenderer.mesh = this.meshes[lodIndex];
  }
}
```

### Procedural City Building

```ts
class BuildingGenerator {
  static createBuilding(
    engine: Engine,
    width: number,
    height: number,
    depth: number,
    floors: number
  ): ModelMesh {
    const mesh = new ModelMesh(engine);
    const positions: Vector3[] = [];
    const uvs: Vector2[] = [];
    const indices: number[] = [];
    
    const floorHeight = height / floors;
    
    // Generate floor-by-floor geometry
    for (let floor = 0; floor <= floors; floor++) {
      const y = floor * floorHeight;
      
      // Add vertices for this floor level
      positions.push(
        new Vector3(-width/2, y, -depth/2),  // 0: back-left
        new Vector3(width/2, y, -depth/2),   // 1: back-right
        new Vector3(width/2, y, depth/2),    // 2: front-right
        new Vector3(-width/2, y, depth/2)    // 3: front-left
      );
      
      uvs.push(
        new Vector2(0, floor / floors),
        new Vector2(1, floor / floors),
        new Vector2(1, floor / floors),
        new Vector2(0, floor / floors)
      );
      
      if (floor > 0) {
        const baseIndex = (floor - 1) * 4;
        
        // Generate wall faces
        this.addQuadIndices(indices, baseIndex, baseIndex + 4, 0, 1); // Back wall
        this.addQuadIndices(indices, baseIndex, baseIndex + 4, 1, 2); // Right wall  
        this.addQuadIndices(indices, baseIndex, baseIndex + 4, 2, 3); // Front wall
        this.addQuadIndices(indices, baseIndex, baseIndex + 4, 3, 0); // Left wall
      }
    }
    
    mesh.setPositions(positions);
    mesh.setUVs(uvs);
    mesh.setIndices(new Uint16Array(indices));
    mesh.uploadData(false);
    
    return mesh;
  }
  
  private static addQuadIndices(
    indices: number[],
    baseBottom: number,
    baseTop: number,
    i0: number,
    i1: number
  ): void {
    const bl = baseBottom + i0;
    const br = baseBottom + i1;
    const tl = baseTop + i0;
    const tr = baseTop + i1;
    
    // Two triangles forming a quad
    indices.push(bl, tl, br);
    indices.push(br, tl, tr);
  }
}
```
