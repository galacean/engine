# MeshRenderer

Galacean's `MeshRenderer` class is the primary component for rendering 3D mesh geometry in the engine. It extends the `Renderer` base class to provide mesh-specific functionality including automatic vertex attribute detection, mesh data management, and optimized rendering of complex 3D models. MeshRenderer handles everything from simple primitive shapes to complex imported 3D models with multiple materials and advanced vertex attributes.

## Overview

MeshRenderer provides comprehensive mesh rendering capabilities:

- **Mesh Management**: Automatic mesh assignment with reference counting and change detection
- **Vertex Attributes**: Automatic detection and shader macro management for UV coordinates, normals, tangents, and vertex colors
- **Material Support**: Multi-material rendering with submesh support for complex models
- **Bounds Calculation**: Automatic world-space bounding box calculation based on mesh geometry
- **Performance Optimization**: Efficient vertex attribute checking and mesh data caching
- **Primitive Support**: Compatible with both built-in primitive meshes and imported 3D models

Every MeshRenderer automatically registers with the rendering pipeline and participates in culling, sorting, and batching operations based on its mesh geometry and materials.

## Quick Start

```ts
import { WebGLEngine, MeshRenderer, PrimitiveMesh, BlinnPhongMaterial } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;
const cubeEntity = scene.createRootEntity("Cube");

// Add MeshRenderer component
const meshRenderer = cubeEntity.addComponent(MeshRenderer);

// Create or load a mesh
const cubeMesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
meshRenderer.mesh = cubeMesh;

// Set material
const material = new BlinnPhongMaterial(engine);
material.baseColor.set(1, 0, 0, 1); // Red color
meshRenderer.setMaterial(material);

// Enable vertex colors if the mesh has them
meshRenderer.enableVertexColor = true;
```

## Mesh Assignment

### Basic Mesh Operations

```ts
const meshRenderer = entity.getComponent(MeshRenderer);

// Assign a mesh
meshRenderer.mesh = myMesh;

// Check current mesh
if (meshRenderer.mesh) {
  console.log("Mesh assigned:", meshRenderer.mesh.name);
} else {
  console.log("No mesh assigned");
}

// Access mesh properties
const mesh = meshRenderer.mesh;
if (mesh) {
  console.log("Vertex count:", mesh.vertexCount);
  console.log("SubMesh count:", mesh.subMeshes.length);
  console.log("Bounds:", mesh.bounds);
}
```

### Primitive Mesh Creation

```ts
// Create built-in primitive meshes
const sphereMesh = PrimitiveMesh.createSphere(engine, 1);
const cubeMesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
const planeMesh = PrimitiveMesh.createPlane(engine, 10, 10);
const cylinderMesh = PrimitiveMesh.createCylinder(engine, 1, 2, 32);

// Assign to renderer
meshRenderer.mesh = sphereMesh;

// Create custom primitive with specific parameters
const torusMesh = PrimitiveMesh.createTorus(engine, 2, 0.5, 32, 16);
meshRenderer.mesh = torusMesh;
```

### Loading External Meshes

```ts
// Load GLTF/GLB models
const gltfResource = await engine.resourceManager.load({
  url: "models/character.glb",
  type: AssetType.GLTF
});

// Extract mesh from GLTF
const gltfEntity = gltfResource.defaultSceneRoot;
const loadedMeshRenderer = gltfEntity.getComponent(MeshRenderer);
if (loadedMeshRenderer && loadedMeshRenderer.mesh) {
  // Use the loaded mesh
  meshRenderer.mesh = loadedMeshRenderer.mesh;
  meshRenderer.setMaterials(loadedMeshRenderer.getMaterials());
}

// Or load mesh directly if available as separate asset
const meshResource = await engine.resourceManager.load({
  url: "models/sword.mesh",
  type: AssetType.Mesh
});
meshRenderer.mesh = meshResource;
```

## Vertex Attributes and Features

### Automatic Vertex Attribute Detection

MeshRenderer automatically detects vertex attributes and enables corresponding shader macros:

```ts
// MeshRenderer automatically enables these macros based on mesh content:
// - RENDERER_HAS_UV: When mesh has TEXCOORD_0 (UV coordinates)
// - RENDERER_HAS_UV1: When mesh has TEXCOORD_1 (second UV set)
// - RENDERER_HAS_NORMAL: When mesh has vertex normals
// - RENDERER_HAS_TANGENT: When mesh has tangent vectors
// - RENDERER_ENABLE_VERTEXCOLOR: When vertex colors are enabled

// Check what attributes are available
const mesh = meshRenderer.mesh;
if (mesh) {
  // Note: Direct access to vertex elements is not available through public API
  // Use mesh properties and methods instead:
  console.log("Mesh bounds:", mesh.bounds);
  console.log("Sub-meshes:", mesh.subMeshes.length);
  console.log("First sub-mesh:", mesh.subMesh);
  
  // Check capabilities through material and renderer settings
  console.log("Vertex colors enabled:", meshRenderer.enableVertexColor);
}
```

### Vertex Color Support

```ts
// Enable vertex color rendering
meshRenderer.enableVertexColor = true;

// This enables the RENDERER_ENABLE_VERTEXCOLOR macro
// allowing shaders to use per-vertex colors

// Create a mesh with vertex colors
const coloredMesh = new ModelMesh(engine);
const positions = new Float32Array([/* vertex positions */]);
const colors = new Float32Array([/* vertex colors in RGBA format */]);

coloredMesh.setPositions(positions);
coloredMesh.setColors(colors);
coloredMesh.uploadData(false);

meshRenderer.mesh = coloredMesh;
meshRenderer.enableVertexColor = true;

// Use a material that supports vertex colors
const material = new UnlitMaterial(engine);
material.shaderData.enableMacro("VERTEX_COLOR");
meshRenderer.setMaterial(material);
```

### Normal and Tangent Vectors

```ts
// MeshRenderer automatically detects and enables normal/tangent support
const mesh = meshRenderer.mesh;

// Check if mesh has normals
if (mesh.vertexElements.some(el => el.attribute === "NORMAL")) {
  console.log("Mesh has normals - lighting will work correctly");
}

// Check if mesh has tangents (for normal mapping)
if (mesh.vertexElements.some(el => el.attribute === "TANGENT")) {
  console.log("Mesh has tangents - normal mapping supported");
}

// For meshes without tangents, calculate them automatically
if (mesh instanceof ModelMesh) {
  mesh.calculateTangents(); // Generates tangent vectors
  mesh.uploadData(false);
}
```

## Multi-Material and SubMesh Rendering

### Working with SubMeshes

```ts
// Complex models often have multiple materials for different parts
const characterMesh = loadedCharacterMesh; // From GLTF loader
meshRenderer.mesh = characterMesh;

// Check how many submeshes (material slots) the mesh has
console.log("SubMesh count:", characterMesh.subMeshes.length);

// Assign different materials to different parts
const skinMaterial = new BlinnPhongMaterial(engine);
const clothMaterial = new BlinnPhongMaterial(engine);
const metalMaterial = new BlinnPhongMaterial(engine);

skinMaterial.baseColor.set(0.9, 0.7, 0.6, 1); // Skin tone
clothMaterial.baseColor.set(0.2, 0.3, 0.8, 1); // Blue cloth
metalMaterial.baseColor.set(0.8, 0.8, 0.8, 1); // Silver metal

// Set materials by index (corresponds to submesh order)
meshRenderer.setMaterial(0, skinMaterial);  // First submesh
meshRenderer.setMaterial(1, clothMaterial); // Second submesh
meshRenderer.setMaterial(2, metalMaterial); // Third submesh

// Or set all at once
meshRenderer.setMaterials([skinMaterial, clothMaterial, metalMaterial]);
```

### Material Instance Management

```ts
// Create instance materials for per-object customization
const baseMaterial = new BlinnPhongMaterial(engine);

// Each renderer gets its own instance
const instanceMaterial = meshRenderer.getInstanceMaterial();
instanceMaterial.baseColor.set(Math.random(), Math.random(), Math.random(), 1);

// For multiple submeshes
const instanceMaterials = meshRenderer.getInstanceMaterials();
instanceMaterials.forEach((material, index) => {
  material.baseColor.set(
    Math.random(),
    Math.random(), 
    Math.random(),
    1
  );
});
```

## Mesh Data Management

### Custom Mesh Creation

```ts
// Create a custom mesh with specific vertex data
const customMesh = new ModelMesh(engine);

// Define vertices for a triangle
const positions = new Float32Array([
  -0.5, -0.5, 0,  // Bottom left
   0.5, -0.5, 0,  // Bottom right
   0.0,  0.5, 0   // Top center
]);

const normals = new Float32Array([
  0, 0, 1,  // Normal pointing out of screen
  0, 0, 1,
  0, 0, 1
]);

const uvs = new Float32Array([
  0, 0,  // Bottom left UV
  1, 0,  // Bottom right UV
  0.5, 1 // Top center UV
]);

const indices = new Uint16Array([
  0, 1, 2  // Triangle indices
]);

// Set mesh data
customMesh.setPositions(positions);
customMesh.setNormals(normals);
customMesh.setUVs(uvs);
customMesh.setIndices(indices);

// Upload to GPU
customMesh.uploadData(false);

// Create a submesh for the entire triangle
customMesh.addSubMesh(0, 3); // Start index 0, count 3

// Assign to renderer
meshRenderer.mesh = customMesh;
```

### Mesh Modification

```ts
// Modify existing mesh data
const mesh = meshRenderer.mesh;
if (mesh instanceof ModelMesh) {
  // Get existing vertex data
  const positions = new Float32Array(mesh.vertexCount * 3);
  mesh.getPositions(positions);
  
  // Modify positions (e.g., wave effect)
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 1] += Math.sin(positions[i] * 2 + engine.time.totalTime) * 0.1;
  }
  
  // Update mesh
  mesh.setPositions(positions);
  mesh.uploadData(false);
  
  // Bounds will be automatically recalculated
}
```

## Performance Optimization

### Mesh Bounds Optimization

```ts
// MeshRenderer automatically calculates world bounds from mesh bounds
const meshRenderer = entity.getComponent(MeshRenderer);

// Access current bounds
const bounds = meshRenderer.bounds;
console.log("World bounds center:", bounds.getCenter(new Vector3()));
console.log("World bounds size:", bounds.getExtent(new Vector3()));

// For custom meshes, ensure proper bounds are set
if (customMesh instanceof ModelMesh) {
  const localBounds = customMesh.bounds;
  localBounds.min.set(-1, -1, -1);
  localBounds.max.set(1, 1, 1);
  // Bounds will be transformed to world space automatically
}
```

### Efficient Mesh Sharing

```ts
// Share meshes between multiple renderers to save memory
const sharedMesh = PrimitiveMesh.createSphere(engine, 1);

// Create multiple entities with the same mesh
for (let i = 0; i < 100; i++) {
  const entity = scene.createRootEntity(`Sphere_${i}`);
  const renderer = entity.addComponent(MeshRenderer);
  
  // All renderers share the same mesh data
  renderer.mesh = sharedMesh;
  
  // But can have different materials
  const material = new BlinnPhongMaterial(engine);
  material.baseColor.set(Math.random(), Math.random(), Math.random(), 1);
  renderer.setMaterial(material);
  
  // Position entities differently
  entity.transform.setPosition(
    (i % 10) * 2,
    Math.floor(i / 10) * 2,
    0
  );
}
```

### Conditional Vertex Features

```ts
// Only enable expensive vertex features when needed
const meshRenderer = entity.getComponent(MeshRenderer);

// Check if the mesh supports vertex colors
const mesh = meshRenderer.mesh;
if (mesh) {
  // Note: Direct access to vertex elements is not available through public API
  // Use a simple test approach instead:
  
  // Enable vertex colors and check if it works
  meshRenderer.enableVertexColor = true;
  console.log("Vertex colors enabled for testing");
  
  // You can also check the material capabilities
  const material = meshRenderer.getMaterial();
  if (material) {
    console.log("Material type:", material.constructor.name);
  }
} else {
  meshRenderer.enableVertexColor = false;
  console.log("No mesh assigned");
}
```

## Advanced Usage Patterns

### Level of Detail (LOD) System

```ts
class LODMeshRenderer extends Script {
  private lodMeshes: Mesh[] = [];
  private lodDistances: number[] = [10, 50, 100];
  private meshRenderer: MeshRenderer;

  onAwake(): void {
    this.meshRenderer = this.entity.getComponent(MeshRenderer);
    
    // Setup LOD meshes (high to low detail)
    this.lodMeshes = [
      highDetailMesh,    // 0-10 units
      mediumDetailMesh,  // 10-50 units
      lowDetailMesh      // 50-100 units
    ];
  }

  onUpdate(): void {
    // Find main camera - there's no direct findCamera method
    // Use the engine's scene manager instead
    const scene = this.engine.sceneManager.activeScene;
    const rootEntities = scene.rootEntities;
    
    let camera: Camera | null = null;
    for (const entity of rootEntities) {
      camera = entity.getComponent(Camera);
      if (camera) break;
      
      // Check children recursively
      const stack = [entity];
      while (stack.length > 0 && !camera) {
        const current = stack.pop()!;
        camera = current.getComponent(Camera);
        if (camera) break;
        stack.push(...current.children);
      }
      if (camera) break;
    }
    
    if (!camera) return;

    const distance = Vector3.distance(
      this.entity.transform.worldPosition,
      camera.entity.transform.worldPosition
    );

    const lodLevel = this.calculateLODLevel(distance);
    if (this.meshRenderer.mesh !== this.lodMeshes[lodLevel]) {
      this.meshRenderer.mesh = this.lodMeshes[lodLevel];
    }
  }

  private calculateLODLevel(distance: number): number {
    for (let i = 0; i < this.lodDistances.length; i++) {
      if (distance < this.lodDistances[i]) {
        return i;
      }
    }
    return this.lodDistances.length;
  }
}
```

### Dynamic Mesh Generation

```ts
class ProceduralMeshRenderer extends Script {
  private meshRenderer: MeshRenderer;
  private customMesh: ModelMesh;

  onAwake(): void {
    this.meshRenderer = this.entity.getComponent(MeshRenderer);
    this.generateProceduralMesh();
  }

  private generateProceduralMesh(): void {
    const segments = 32;
    const radius = 1;
    
    // Generate procedural geometry (e.g., parametric surface)
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    // Generate vertices
    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= segments; j++) {
        const u = i / segments;
        const v = j / segments;
        
        // Parametric surface equations
        const x = Math.cos(u * Math.PI * 2) * radius;
        const y = Math.sin(v * Math.PI) * 0.5;
        const z = Math.sin(u * Math.PI * 2) * radius;
        
        positions.push(x, y, z);
        normals.push(x, 0, z); // Simple normal calculation
        uvs.push(u, v);
      }
    }

    // Generate indices
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        const a = i * (segments + 1) + j;
        const b = a + segments + 1;
        const c = a + 1;
        const d = b + 1;
        
        indices.push(a, b, c, b, d, c);
      }
    }

    // Create mesh
    this.customMesh = new ModelMesh(this.engine);
    this.customMesh.setPositions(new Float32Array(positions));
    this.customMesh.setNormals(new Float32Array(normals));
    this.customMesh.setUVs(new Float32Array(uvs));
    this.customMesh.setIndices(new Uint16Array(indices));
    this.customMesh.addSubMesh(0, indices.length);
    this.customMesh.uploadData(false);

    this.meshRenderer.mesh = this.customMesh;
  }

  // Update mesh dynamically
  onUpdate(): void {
    if (this.needsUpdate()) {
      this.updateMeshGeometry();
    }
  }

  private updateMeshGeometry(): void {
    // Modify vertex positions based on time or input
    const time = this.engine.time.totalTime;
    const mesh = this.customMesh;
    
    // Update positions with animation
    const positions = new Float32Array(mesh.vertexCount * 3);
    mesh.getPositions(positions);
    
    for (let i = 0; i < positions.length; i += 3) {
      const originalY = positions[i + 1];
      positions[i + 1] = originalY + Math.sin(time + positions[i]) * 0.2;
    }
    
    mesh.setPositions(positions);
    mesh.uploadData(false);
  }
}
```

### Mesh Validation and Error Handling

```ts
class SafeMeshRenderer extends Script {
  private meshRenderer: MeshRenderer;

  onAwake(): void {
    this.meshRenderer = this.entity.getComponent(MeshRenderer);
  }

  setMeshSafely(mesh: Mesh): boolean {
    if (!this.validateMesh(mesh)) {
      console.error("Invalid mesh provided");
      return false;
    }

    try {
      this.meshRenderer.mesh = mesh;
      return true;
    } catch (error) {
      console.error("Failed to assign mesh:", error);
      return false;
    }
  }

  private validateMesh(mesh: Mesh): boolean {
    if (!mesh) {
      console.error("Mesh is null");
      return false;
    }

    if (mesh.destroyed) {
      console.error("Mesh is destroyed");
      return false;
    }

    if (mesh.subMeshes.length === 0) {
      console.error("Mesh has no submeshes");
      return false;
    }

    if (mesh.vertexCount === 0) {
      console.error("Mesh has no vertices");
      return false;
    }

    return true;
  }

  onUpdate(): void {
    // Check for mesh errors during runtime
    const mesh = this.meshRenderer.mesh;
    if (mesh && mesh.destroyed) {
      console.error("Mesh was destroyed unexpectedly");
      this.meshRenderer.mesh = null;
    }
  }
}
```

## API Reference

```apidoc
MeshRenderer extends Renderer:
  Properties:
    mesh: Mesh
      - The mesh to render. Automatically manages reference counting and change detection.
    enableVertexColor: boolean
      - Whether to enable vertex color rendering. Affects RENDERER_ENABLE_VERTEXCOLOR macro.

  Inherited from Renderer:
    shaderData: ShaderData
      - Per-renderer shader properties and macros.
    bounds: BoundingBox
      - World-space bounding box calculated from mesh bounds and transform.
    receiveShadows: boolean
      - Whether this renderer receives shadows from shadow-casting objects.
    castShadows: boolean
      - Whether this renderer casts shadows on other objects.
    priority: number
      - Render priority for sorting. Lower values render first.
    materialCount: number
      - Number of material slots for multi-material meshes.

  Material Methods:
    getMaterial(): Material | null
    getMaterial(index: number): Material | null
      - Get material by index. Returns null if no material at index.
    setMaterial(material: Material): void
    setMaterial(index: number, material: Material): void
      - Set material at index. Creates material slots as needed.
    getMaterials(): Readonly<Material[]>
      - Get all materials array (read-only reference).
    setMaterials(materials: Material[]): void
      - Replace all materials with new array.
    getInstanceMaterial(): Material | null
    getInstanceMaterial(index: number): Material | null
      - Get instance material by index. Creates unique copy on first access.
    getInstanceMaterials(): Readonly<Material[]>
      - Get all instance materials. Creates instances for all materials.

  Automatic Shader Macros:
    RENDERER_HAS_UV: Enabled when mesh has TEXCOORD_0 attribute
    RENDERER_HAS_UV1: Enabled when mesh has TEXCOORD_1 attribute
    RENDERER_HAS_NORMAL: Enabled when mesh has NORMAL attribute
    RENDERER_HAS_TANGENT: Enabled when mesh has TANGENT attribute
    RENDERER_ENABLE_VERTEXCOLOR: Enabled when enableVertexColor is true and mesh has COLOR_0

  Internal Properties:
    _mesh: Mesh
      - Internal mesh reference with change detection.
    _enableVertexColor: boolean
      - Internal vertex color enable state.

MeshRendererUpdateFlags:
    VertexElementMacro = 0x2
      - Flag indicating vertex element macros need updating.
    All = 0x3
      - All update flags combined.
```

## Best Practices

- **Validate Meshes**: Always check if mesh exists and is not destroyed before use
- **Share Mesh Data**: Use the same mesh instance across multiple renderers to save memory
- **Optimize Vertex Attributes**: Only enable vertex colors when the mesh actually has them
- **Use LOD Systems**: Implement level-of-detail systems for complex scenes with many objects
- **Batch Similar Objects**: Group objects with the same mesh and material for better performance
- **Preload Meshes**: Load and cache frequently used meshes at application startup
- **Monitor Bounds**: Ensure mesh bounds are correctly set for proper culling
- **Material Instances**: Only create instance materials when you need per-object customization

## Common Issues

**Mesh Not Rendering**: Check that mesh is assigned and has valid submeshes:
```ts
if (!meshRenderer.mesh) {
  console.error("No mesh assigned");
} else if (meshRenderer.mesh.subMeshes.length === 0) {
  console.error("Mesh has no submeshes");
}
```

**Material Mismatch**: Ensure material count matches submesh count:
```ts
const mesh = meshRenderer.mesh;
const materialCount = meshRenderer.materialCount;
const submeshCount = mesh.subMeshes.length;

if (materialCount < submeshCount) {
  console.warn(`Need ${submeshCount} materials, only have ${materialCount}`);
  // Set missing materials to default
  for (let i = materialCount; i < submeshCount; i++) {
    meshRenderer.setMaterial(i, defaultMaterial);
  }
}
```

**Vertex Attribute Errors**: Check shader compatibility with mesh attributes:
```ts
const mesh = meshRenderer.mesh;
if (mesh) {
  // Note: Direct access to vertex elements is not available through public API
  // Check material compatibility through other means:
  const material = meshRenderer.getMaterial();
  
  // Test by enabling features and checking for errors
  console.log("Mesh bounds:", mesh.bounds);
  console.log("Material type:", material?.constructor.name);
  
  // Use material-specific checks instead
  if (material && 'needsNormals' in material) {
    console.log("Material requires normals");
    // Either use a different material or ensure mesh has normals
  }
}
```

**Performance Issues**: Monitor mesh complexity and optimize:
```ts
const mesh = meshRenderer.mesh;
if (mesh.vertexCount > 10000) {
  console.warn("High vertex count mesh:", mesh.vertexCount);
  // Consider using LOD system or mesh simplification
}
```
