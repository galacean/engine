# Material

Galacean's `Material` class is the foundation for all material systems in the engine, defining how surfaces appear when rendered. Materials combine shaders with properties, textures, and render states to control every aspect of an object's visual appearance including colors, lighting, transparency, and surface details. The material system supports both simple artistic workflows and advanced technical rendering techniques.

## Overview

The Material system provides comprehensive surface definition capabilities:

- **Shader Integration**: Seamless binding of shaders with material properties and textures
- **Property Management**: Type-safe shader property binding with automatic validation
- **Render State Control**: Fine-grained control over blending, depth testing, culling, and render queues
- **Texture Mapping**: Support for diffuse, normal, specular, emissive, and custom texture maps
- **Material Variants**: Multiple material types for different rendering approaches (PBR, Blinn-Phong, Unlit)
- **Instance Management**: Efficient material instancing for per-object customization
- **Resource Management**: Automatic reference counting and memory management

Materials work closely with Renderers to define the final appearance of 3D objects in the scene.

## Quick Start

```ts
import { WebGLEngine, BlinnPhongMaterial, PBRMaterial, UnlitMaterial } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });

// Create different material types
const blinnPhongMaterial = new BlinnPhongMaterial(engine);
const pbrMaterial = new PBRMaterial(engine);
const unlitMaterial = new UnlitMaterial(engine);

// Configure basic properties
blinnPhongMaterial.baseColor.set(1, 0, 0, 1); // Red color
blinnPhongMaterial.specularColor.set(0.5, 0.5, 0.5, 1); // Gray specular
blinnPhongMaterial.shininess = 32;

// Load and assign textures
const diffuseTexture = await engine.resourceManager.load({
  url: "textures/brick-diffuse.jpg",
  type: AssetType.Texture2D
});
blinnPhongMaterial.baseTexture = diffuseTexture;

// Apply to renderer
const meshRenderer = entity.getComponent(MeshRenderer);
meshRenderer.setMaterial(blinnPhongMaterial);
```

## Material Types

### Base Material Class

All materials inherit from the base `Material` class which provides fundamental functionality:

```ts
// Create custom material with specific shader
const customShader = Shader.create("CustomShader", vertexSource, fragmentSource);
const customMaterial = new Material(engine, customShader);

// Access core material properties
console.log("Material name:", customMaterial.name);
console.log("Shader:", customMaterial.shader.name);
console.log("Render states count:", customMaterial.renderStates.length);

// Access shader data for custom properties
customMaterial.shaderData.setFloat("customIntensity", 2.0);
customMaterial.shaderData.setColor("customTint", new Color(1, 0.5, 0, 1));
customMaterial.shaderData.setTexture("customTexture", myTexture);
```

### Material Render States

All materials provide render state control for transparency and culling:

```ts
// Transparency control through render states
material.renderState.renderQueueType = RenderQueueType.Transparent;
material.renderState.depthState.writeEnabled = false;
material.renderState.blendState.enabled = true;

// Configure alpha blending
const blendState = material.renderState.blendState;
const target = blendState.targetBlendState;
target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
target.colorBlendOperation = BlendOperation.Add;
```

### Blinn-Phong Material

Traditional lighting model suitable for stylized and artistic rendering:

```ts
const blinnPhongMaterial = new BlinnPhongMaterial(engine);

// Basic surface properties
blinnPhongMaterial.baseColor.set(0.8, 0.2, 0.2, 1.0); // Diffuse color
blinnPhongMaterial.specularColor.set(1.0, 1.0, 1.0, 1.0); // Specular color
blinnPhongMaterial.shininess = 64; // Specular power (higher = more focused)

// Texture maps
blinnPhongMaterial.baseTexture = diffuseTexture;
blinnPhongMaterial.specularTexture = specularTexture;
blinnPhongMaterial.normalTexture = normalTexture;
blinnPhongMaterial.emissiveTexture = emissiveTexture;

// Texture properties
blinnPhongMaterial.normalIntensity = 1.0; // Normal map strength
blinnPhongMaterial.emissiveColor.set(0.1, 0.1, 0.1, 1.0); // Emissive glow

// UV tiling and offset
blinnPhongMaterial.tilingOffset.set(2, 2, 0, 0); // Tile 2x2, no offset
```

### PBR Material

Physically-based rendering for realistic materials:

```ts
const pbrMaterial = new PBRMaterial(engine);

// PBR workflow properties
pbrMaterial.baseColor.set(0.7, 0.7, 0.7, 1.0);
pbrMaterial.metallic = 0.0; // 0 = dielectric, 1 = metallic
pbrMaterial.roughness = 0.5; // 0 = mirror-like, 1 = completely rough

// PBR texture maps
pbrMaterial.baseTexture = albedoTexture;
pbrMaterial.roughnessMetallicTexture = metallicRoughnessTexture;
pbrMaterial.normalTexture = normalTexture;
pbrMaterial.occlusionTexture = occlusionTexture;
pbrMaterial.emissiveTexture = emissiveTexture;

// Advanced PBR properties
pbrMaterial.clearCoat = 0.0; // Clear coat layer intensity
pbrMaterial.clearCoatRoughness = 0.1; // Clear coat roughness
pbrMaterial.clearCoatTexture = clearCoatTexture;
pbrMaterial.clearCoatRoughnessTexture = clearCoatRoughnessTexture;
pbrMaterial.clearCoatNormalTexture = clearCoatNormalTexture;

// Sheen properties (for fabric-like materials)
pbrMaterial.sheenColor.set(0.1, 0.1, 0.1, 1.0);
pbrMaterial.sheenColorTexture = sheenColorTexture;
pbrMaterial.sheenRoughness = 0.5;
pbrMaterial.sheenRoughnessTexture = sheenRoughnessTexture;

// Anisotropy properties (for brushed metal, hair)
pbrMaterial.anisotropy = 0.0; // 0 = disabled
pbrMaterial.anisotropyRotation = 0.0;
pbrMaterial.anisotropyTexture = anisotropyTexture;

// Transmission properties (for glass, liquids)
pbrMaterial.transmission = 0.0; // 0 = opaque, 1 = fully transparent
pbrMaterial.transmissionTexture = transmissionTexture;

// Refraction properties (requires transmission > 0)
pbrMaterial.attenuationColor.set(1, 1, 1, 1); // Absorption color
pbrMaterial.attenuationDistance = 0.0; // Attenuation distance
pbrMaterial.thickness = 0.0; // Refraction thickness
pbrMaterial.thicknessTexture = thicknessTexture;
pbrMaterial.refractionMode = RefractionMode.Sphere; // or RefractionMode.Planar
```

### Unlit Material

For objects that don't require lighting calculations:

```ts
const unlitMaterial = new UnlitMaterial(engine);

// Simple color and texture
unlitMaterial.baseColor.set(1, 1, 1, 1);
unlitMaterial.baseTexture = uiTexture;

// Perfect for UI elements, effects, and stylized objects
unlitMaterial.tilingOffset.set(1, 1, 0, 0);
```

## Shader Properties and Data

### Setting Shader Properties

Materials provide type-safe access to shader properties:

```ts
const material = new BlinnPhongMaterial(engine);
const shaderData = material.shaderData;

// Scalar values
shaderData.setFloat("customIntensity", 2.5);
shaderData.setInt("tileCount", 4);
shaderData.setBool("enableEffect", true);

// Vector values
shaderData.setVector2("uvScale", new Vector2(2, 2));
shaderData.setVector3("worldOffset", new Vector3(0, 1, 0));
shaderData.setVector4("tintColor", new Vector4(1, 0.5, 0.2, 1));

// Color values (Vector4 with automatic conversion)
shaderData.setColor("glowColor", new Color(1, 0, 0, 1));

// Matrix values
const transformMatrix = new Matrix();
Matrix.translation(new Vector3(1, 0, 0), transformMatrix);
shaderData.setMatrix("customTransform", transformMatrix);

// Texture values
shaderData.setTexture("diffuseMap", diffuseTexture);
shaderData.setTexture("normalMap", normalTexture);

// Texture arrays
shaderData.setTextureArray("textureMaps", [tex1, tex2, tex3]);
```

### Shader Macros

Enable or disable shader features using macros:

```ts
const shaderData = material.shaderData;

// Enable features
shaderData.enableMacro("USE_NORMAL_MAP");
shaderData.enableMacro("USE_SPECULAR_MAP");
shaderData.enableMacro("USE_VERTEX_COLOR");

// Disable features
shaderData.disableMacro("USE_SHADOW_MAP");

// Check macro state
if (shaderData.hasMacro("USE_NORMAL_MAP")) {
  console.log("Normal mapping is enabled");
}

// Macros with values
shaderData.enableMacro(ShaderMacro.getByName("POINT_LIGHT_COUNT", "4"));
```

## Render States and Blending

### Transparency and Blending

```ts
const material = new BlinnPhongMaterial(engine);

// Enable transparency
material.isTransparent = true;

// Set blend mode
material.blendMode = BlendMode.Normal;    // Standard alpha blending
material.blendMode = BlendMode.Additive;  // Additive blending for effects

// Advanced per-pass transparency control
material.setIsTransparent(0, true);  // Enable transparency for pass 0
material.setBlendMode(0, BlendMode.Additive);

// Alpha testing (for cutout materials)
material.alphaCutoff = 0.5; // Discard pixels with alpha < 0.5
material.isTransparent = false; // Use alpha test instead of blending
```

### Face Culling

```ts
// Control which faces are rendered
material.renderFace = RenderFace.Front;  // Default: only front faces
material.renderFace = RenderFace.Back;   // Only back faces
material.renderFace = RenderFace.Double; // Both front and back faces

// Useful for:
// - Front: Solid objects (most common)
// - Back: Inside of spheres, rooms
// - Double: Vegetation, cloth, transparent objects
```

### Custom Render States

```ts
// Access individual render states for each shader pass
const renderState = material.renderStates[0]; // First pass

// Depth state
renderState.depthState.enabled = true;
renderState.depthState.writeEnabled = true;
renderState.depthState.compareFunction = CompareFunction.Less;

// Stencil state
renderState.stencilState.enabled = true;
renderState.stencilState.referenceValue = 1;
renderState.stencilState.compareFunctionFront = CompareFunction.Equal;

// Raster state
renderState.rasterState.cullMode = CullMode.Back;
renderState.rasterState.fillMode = FillMode.Solid;

// Render queue
renderState.renderQueueType = RenderQueueType.Transparent;
```

## Texture Management

### Loading and Assigning Textures

```ts
// Load textures
const diffuseTexture = await engine.resourceManager.load({
  url: "textures/brick_diffuse.jpg",
  type: AssetType.Texture2D
});

const normalTexture = await engine.resourceManager.load({
  url: "textures/brick_normal.jpg", 
  type: AssetType.Texture2D
});

// Assign to material
const material = new BlinnPhongMaterial(engine);
material.baseTexture = diffuseTexture;
material.normalTexture = normalTexture;

// Configure texture properties
material.tilingOffset.set(2, 2, 0.1, 0.1); // Scale 2x2, offset by 0.1
material.normalIntensity = 1.5; // Increase normal map effect
```

### Texture Coordinates and Tiling

```ts
const material = new PBRMaterial(engine);

// UV tiling and offset (Vector4: tilingX, tilingY, offsetX, offsetY)
material.tilingOffset.set(
  3.0, 3.0,  // Tile texture 3 times in both directions
  0.5, 0.5   // Offset by half a tile
);

// For animated textures
class AnimatedTexture extends Script {
  private material: PBRMaterial;
  private scrollSpeed = 1.0;

  onUpdate(deltaTime: number): void {
    const offset = this.engine.time.totalTime * this.scrollSpeed;
    this.material.tilingOffset.set(1, 1, offset % 1, 0);
  }
}
```

### Multiple Texture Maps

```ts
const pbrMaterial = new PBRMaterial(engine);

// Standard PBR texture set
pbrMaterial.baseTexture = albedoTexture;           // Diffuse color
pbrMaterial.metallicRoughnessTexture = mrTexture;  // Metallic(B) + Roughness(G)
pbrMaterial.normalTexture = normalTexture;         // Normal map (tangent space)
pbrMaterial.occlusionTexture = aoTexture;          // Ambient occlusion
pbrMaterial.emissiveTexture = emissiveTexture;     // Emissive glow

// Configure texture properties
pbrMaterial.normalIntensity = 1.0;      // Normal map strength
pbrMaterial.occlusionIntensity = 1.0;   // AO intensity
pbrMaterial.emissiveColor.set(1, 1, 1, 1); // Emissive color multiplier
```

## Material Instancing and Cloning

### Creating Material Instances

```ts
// Create base material
const baseMaterial = new BlinnPhongMaterial(engine);
baseMaterial.baseTexture = sharedTexture;
baseMaterial.normalTexture = sharedNormalMap;

// Clone for customization
const redMaterial = baseMaterial.clone();
redMaterial.baseColor.set(1, 0, 0, 1); // Red variant

const blueMaterial = baseMaterial.clone();
blueMaterial.baseColor.set(0, 0, 1, 1); // Blue variant

// Apply to different objects
redRenderer.setMaterial(redMaterial);
blueRenderer.setMaterial(blueMaterial);
```

### Efficient Material Sharing

```ts
// Share base material across multiple objects
const sharedMaterial = new PBRMaterial(engine);
sharedMaterial.baseTexture = commonTexture;

// Use renderer's instance materials for per-object properties
for (let i = 0; i < entities.length; i++) {
  const renderer = entities[i].getComponent(MeshRenderer);
  renderer.setMaterial(sharedMaterial);
  
  // Get instance material for customization
  const instanceMaterial = renderer.getInstanceMaterial();
  instanceMaterial.baseColor.set(
    Math.random(),
    Math.random(), 
    Math.random(),
    1
  );
}
```

### Material Variants

```ts
class MaterialVariantManager {
  private baseMaterial: PBRMaterial;
  private variants: Map<string, PBRMaterial> = new Map();

  constructor(engine: Engine, baseMaterial: PBRMaterial) {
    this.baseMaterial = baseMaterial;
  }

  createVariant(name: string, modifications: (material: PBRMaterial) => void): PBRMaterial {
    const variant = this.baseMaterial.clone();
    variant.name = `${this.baseMaterial.name}_${name}`;
    modifications(variant);
    this.variants.set(name, variant);
    return variant;
  }

  getVariant(name: string): PBRMaterial | null {
    return this.variants.get(name) || null;
  }
}

// Usage
const variantManager = new MaterialVariantManager(engine, basePBRMaterial);

const damagedVariant = variantManager.createVariant("damaged", (material) => {
  material.roughness = 0.8; // More rough when damaged
  material.baseColor.set(0.6, 0.4, 0.3, 1); // Darker, rustier color
});

const newVariant = variantManager.createVariant("new", (material) => {
  material.roughness = 0.2; // Shinier when new
  material.metallic = 0.8;   // More metallic
});
```

## Advanced Material Techniques

### Dynamic Material Properties

```ts
class DynamicMaterial extends Script {
  private material: BlinnPhongMaterial;
  private animationSpeed = 2.0;

  onAwake(): void {
    const renderer = this.entity.getComponent(MeshRenderer);
    this.material = renderer.getInstanceMaterial() as BlinnPhongMaterial;
  }

  onUpdate(deltaTime: number): void {
    const time = this.engine.time.totalTime;
    
    // Animate emissive color
    const intensity = (Math.sin(time * this.animationSpeed) + 1) * 0.5;
    this.material.emissiveColor.set(intensity, intensity * 0.5, 0, 1);

    // Animate UV offset
    const offset = time * 0.1;
    this.material.tilingOffset.set(1, 1, offset % 1, 0);

    // Animate shininess
    this.material.shininess = 16 + Math.sin(time) * 8;
  }
}
```

### LOD Material System

```ts
class LODMaterialSystem extends Script {
  private materials: Material[] = [];
  private lodDistances: number[] = [10, 50, 100];
  private renderer: MeshRenderer;

  onAwake(): void {
    this.renderer = this.entity.getComponent(MeshRenderer);
    this.setupLODMaterials();
  }

  private setupLODMaterials(): void {
    // High detail - PBR with all texture maps
    const highDetailMaterial = new PBRMaterial(this.engine);
    highDetailMaterial.baseTexture = highResAlbedo;
    highDetailMaterial.normalTexture = highResNormal;
    highDetailMaterial.metallicRoughnessTexture = highResMR;
    
    // Medium detail - PBR with fewer textures
    const mediumDetailMaterial = new PBRMaterial(this.engine);
    mediumDetailMaterial.baseTexture = mediumResAlbedo;
    mediumDetailMaterial.normalTexture = mediumResNormal;
    
    // Low detail - Unlit for distant objects
    const lowDetailMaterial = new UnlitMaterial(this.engine);
    lowDetailMaterial.baseTexture = lowResAlbedo;

    this.materials = [highDetailMaterial, mediumDetailMaterial, lowDetailMaterial];
  }

  onUpdate(): void {
    const camera = this.scene.findCamera();
    if (!camera) return;

    const distance = Vector3.distance(
      this.entity.transform.worldPosition,
      camera.entity.transform.worldPosition
    );

    const lodLevel = this.calculateLODLevel(distance);
    const currentMaterial = this.renderer.getMaterial();
    
    if (currentMaterial !== this.materials[lodLevel]) {
      this.renderer.setMaterial(this.materials[lodLevel]);
    }
  }

  private calculateLODLevel(distance: number): number {
    for (let i = 0; i < this.lodDistances.length; i++) {
      if (distance < this.lodDistances[i]) return i;
    }
    return this.lodDistances.length;
  }
}
```

### Material Property Animation

```ts
class MaterialAnimator extends Script {
  private material: PBRMaterial;
  private animationCurves: Map<string, AnimationCurve> = new Map();

  addPropertyAnimation(propertyName: string, curve: AnimationCurve): void {
    this.animationCurves.set(propertyName, curve);
  }

  onUpdate(deltaTime: number): void {
    const time = this.engine.time.totalTime;

    for (const [propertyName, curve] of this.animationCurves) {
      const value = curve.evaluate(time);
      
      switch (propertyName) {
        case "metallic":
          this.material.metallic = value;
          break;
        case "roughness":
          this.material.roughness = value;
          break;
        case "emissiveIntensity":
          const emissive = this.material.emissiveColor;
          this.material.emissiveColor.set(value, value, value, emissive.w);
          break;
      }
    }
  }
}

// Usage
const animator = entity.addComponent(MaterialAnimator);
animator.addPropertyAnimation("metallic", metallicCurve);
animator.addPropertyAnimation("roughness", roughnessCurve);
```

## Performance Optimization

### Material Batching

```ts
class MaterialBatcher {
  private materialInstances: Map<string, Material> = new Map();
  
  getSharedMaterial(materialId: string, factory: () => Material): Material {
    if (!this.materialInstances.has(materialId)) {
      this.materialInstances.set(materialId, factory());
    }
    return this.materialInstances.get(materialId);
  }

  createVariantMaterial(baseMaterialId: string, variantId: string, 
                       modifier: (material: Material) => void): Material {
    const key = `${baseMaterialId}_${variantId}`;
    
    if (!this.materialInstances.has(key)) {
      const baseMaterial = this.materialInstances.get(baseMaterialId);
      if (baseMaterial) {
        const variant = baseMaterial.clone();
        modifier(variant);
        this.materialInstances.set(key, variant);
      }
    }
    
    return this.materialInstances.get(key);
  }
}
```

### Efficient Property Updates

```ts
class OptimizedMaterialController extends Script {
  private material: PBRMaterial;
  private lastUpdateTime = 0;
  private updateInterval = 1000 / 30; // Update at 30 FPS instead of every frame

  onUpdate(deltaTime: number): void {
    const now = performance.now();
    
    if (now - this.lastUpdateTime >= this.updateInterval) {
      this.updateMaterialProperties();
      this.lastUpdateTime = now;
    }
  }

  private updateMaterialProperties(): void {
    // Only update when values actually change
    const newRoughness = this.calculateRoughness();
    if (Math.abs(this.material.roughness - newRoughness) > 0.001) {
      this.material.roughness = newRoughness;
    }
  }
}
```

## API Reference

```apidoc
Material:
  Properties:
    name: string
      - Display name of the material.
    shader: Shader
      - Shader used by the material. Setting this updates render states automatically.
    shaderData: ShaderData
      - Container for shader properties, textures, and macros.
    renderState: RenderState
      - First render state (shortcut for renderStates[0]).
    renderStates: Readonly<RenderState[]>
      - All render states for multi-pass shaders.

  Methods:
    constructor(engine: Engine, shader: Shader)
      - Create material with specified shader.
    clone(): Material
      - Create a complete copy of the material.
    cloneTo(target: Material): void
      - Copy this material's properties to target material.

BaseMaterial extends Material:
  Properties:
    isTransparent: boolean
      - Whether material uses alpha blending. Affects render queue and depth writing.
    blendMode: BlendMode
      - Blending mode when transparent. Normal or Additive.
    alphaCutoff: number
      - Alpha threshold for alpha testing. 0 disables alpha testing.
    renderFace: RenderFace
      - Which faces to render. Front, Back, or Double.

  Methods:
    setIsTransparent(passIndex: number, isTransparent: boolean): void
      - Set transparency for specific shader pass.
    setBlendMode(passIndex: number, blendMode: BlendMode): void
      - Set blend mode for specific shader pass.
    setRenderFace(passIndex: number, renderFace: RenderFace): void
      - Set face culling for specific shader pass.

BlinnPhongMaterial extends BaseMaterial:
  Properties:
    baseColor: Color
      - Diffuse color of the material.
    baseTexture: Texture2D
      - Diffuse texture map.
    specularColor: Color
      - Specular reflection color.
    specularTexture: Texture2D
      - Specular intensity texture map.
    normalTexture: Texture2D
      - Normal map for surface detail.
    normalIntensity: number
      - Strength of normal map effect.
    emissiveColor: Color
      - Emissive glow color.
    emissiveTexture: Texture2D
      - Emissive texture map.
    shininess: number
      - Specular power (higher = more focused highlights).
    tilingOffset: Vector4
      - UV tiling (xy) and offset (zw) for texture coordinates.

PBRMaterial extends BaseMaterial:
  Properties:
    baseColor: Color
      - Albedo color of the material.
    baseTexture: Texture2D
      - Albedo texture map.
    metallic: number
      - Metallic factor (0 = dielectric, 1 = metallic).
    roughness: number  
      - Roughness factor (0 = mirror, 1 = completely rough).
    metallicRoughnessTexture: Texture2D
      - Combined metallic (B channel) and roughness (G channel) texture.
    normalTexture: Texture2D
      - Tangent-space normal map.
    normalIntensity: number
      - Normal map intensity.
    occlusionTexture: Texture2D
      - Ambient occlusion texture (R channel).
    occlusionIntensity: number
      - AO effect intensity.
    emissiveColor: Color
      - Emissive color.
    emissiveTexture: Texture2D
      - Emissive texture map.
    clearCoat: number
      - Clear coat layer intensity.
    clearCoatRoughness: number
      - Clear coat roughness.
    tilingOffset: Vector4
      - UV tiling and offset.

UnlitMaterial extends BaseMaterial:
  Properties:
    baseColor: Color
      - Base color (unaffected by lighting).
    baseTexture: Texture2D
      - Base texture map.
    tilingOffset: Vector4
      - UV tiling and offset.

Enums:
  BlendMode:
    Normal: Standard alpha blending
    Additive: Additive blending for effects

  RenderFace:
    Front: Render only front faces
    Back: Render only back faces  
    Double: Render both faces

  RenderQueueType:
    Opaque: Solid objects (2000)
    AlphaTest: Alpha-tested objects (2450)
    Transparent: Transparent objects (3000)
```

## Best Practices

- **Use Appropriate Material Types**: Choose PBR for realistic rendering, Blinn-Phong for stylized art, Unlit for UI and effects
- **Share Materials When Possible**: Use the same material instance across multiple objects with similar appearance
- **Optimize Texture Usage**: Use appropriate texture resolutions and formats for target platforms
- **Minimize Render State Changes**: Group objects with similar materials to reduce state switching
- **Use LOD Materials**: Switch to simpler materials at distance to improve performance
- **Cache Material Instances**: Avoid creating new materials every frame
- **Batch Property Updates**: Update material properties at lower frequencies when possible
- **Use Shader Macros**: Enable/disable features through macros rather than multiple shaders

## Common Issues

**Material Not Appearing**: Check that shader is valid and material is assigned:
```ts
if (!material.shader) {
  console.error("Material has no shader assigned");
}
if (renderer.getMaterial() !== material) {
  console.error("Material not assigned to renderer");
}
```

**Transparency Issues**: Ensure correct render state setup:
```ts
// For alpha blending
material.renderState.renderQueueType = RenderQueueType.Transparent;
material.renderState.depthState.writeEnabled = false;
material.renderState.blendState.enabled = true;

// Configure blend factors
const target = material.renderState.blendState.targetBlendState;
target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
material.alphaCutoff = 0.5; // Enable alpha testing
```

**Texture Not Loading**: Verify texture assignment and loading:
```ts
if (!material.baseTexture) {
  console.error("Base texture not assigned");
} else if (material.baseTexture.destroyed) {
  console.error("Base texture was destroyed");
}
```

**Performance Problems**: Monitor material complexity:
```ts
// Check for expensive operations
if (material.renderStates.length > 1) {
  console.warn("Multi-pass material may impact performance");
}
if (material.isTransparent) {
  console.warn("Transparent material requires sorting");
}
```
