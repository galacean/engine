# Shadow

Galacean's Shadow system provides high-quality real-time shadow rendering featuring cascaded shadow maps, multiple shadow types, and adaptive quality settings. The system is optimized for directional lights and delivers stable shadow effects in large-scale scenes with comprehensive shadow management and performance optimization.

## Overview

The Shadow system encompasses advanced real-time shadow capabilities:

- **Cascaded Shadow Maps**: Multi-resolution shadow mapping for optimal quality across viewing distances
- **Light Integration**: Seamless integration with directional, point, and spot lights
- **Shadow Types**: Support for hard shadows, soft shadows, and contact shadows
- **Quality Control**: Adaptive shadow resolution and bias settings for different platforms
- **Performance Optimization**: Automatic culling, distance fading, and cascade management
- **Shadow Receivers**: Comprehensive shadow casting and receiving system

The system automatically manages shadow map generation, cascade splitting, and shadow filtering for optimal visual quality.

## Quick Start

### Basic Shadow Setup

```ts
import { WebGLEngine, DirectLight, ShadowType, ShadowResolution } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;

// Create directional light with shadows
const lightEntity = scene.createRootEntity("DirectionalLight");
const directLight = lightEntity.addComponent(DirectLight);

// Configure basic shadow settings
directLight.shadowType = ShadowType.SoftLow; // Setting shadowType enables shadows
directLight.shadowStrength = 1.0;
directLight.shadowBias = 0.005;
directLight.shadowNormalBias = 0.05;

// Configure global shadow settings
scene.castShadows = true;
scene.shadowResolution = ShadowResolution.Medium;
scene.shadowDistance = 50;
scene.shadowCascades = 4;

// Position and orient the light
lightEntity.transform.setRotation(-45, -45, 0);

engine.run();
```

### Shadow Casting and Receiving

```ts
import { MeshRenderer } from "@galacean/engine";

// Create objects that cast and receive shadows
const cubeEntity = scene.createRootEntity("Cube");
const cubeRenderer = cubeEntity.addComponent(MeshRenderer);
cubeRenderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
cubeRenderer.castShadows = true;
cubeRenderer.receiveShadows = true;

// Create ground plane to receive shadows
const groundEntity = scene.createRootEntity("Ground");
const groundRenderer = groundEntity.addComponent(MeshRenderer);
groundRenderer.mesh = PrimitiveMesh.createPlane(engine, 20, 20);
groundRenderer.castShadows = false;
groundRenderer.receiveShadows = true;

// Position objects
cubeEntity.transform.setPosition(0, 1, 0);
groundEntity.transform.setPosition(0, -1, 0);
```

## Light Shadow Configuration

### DirectLight Shadow Properties

```ts
class DirectLight extends Light {
  // Shadow type and quality (setting this enables shadows)
  shadowType: ShadowType = ShadowType.Hard;

  // Shadow strength (0.0 to 1.0)
  shadowStrength: number = 1.0;

  // Shadow bias to prevent shadow acne
  shadowBias: number = 0.005;

  // Normal-based bias for curved surfaces
  shadowNormalBias: number = 0.05;

  // Near plane for shadow cameras
  shadowNearPlane: number = 0.1;
}

enum ShadowType {
  Hard = "Hard",           // Hard shadows (no filtering)
  SoftLow = "SoftLow",     // Soft shadows (2x2 PCF)
  SoftMedium = "SoftMedium", // Soft shadows (3x3 PCF)
  SoftHigh = "SoftHigh"    // Soft shadows (4x4 PCF)
}
```

### Shadow Configuration Examples

```ts
// High quality shadow setup
directLight.shadowType = ShadowType.SoftHigh; // Enables shadows with high quality
directLight.shadowStrength = 0.8;
directLight.shadowBias = 0.001;      // Reduce for high precision
directLight.shadowNormalBias = 0.02; // Fine-tune for surface quality

// Performance-oriented setup
directLight.shadowType = ShadowType.Hard; // Enables shadows with hard edges
directLight.shadowStrength = 1.0;
directLight.shadowBias = 0.01;       // Higher bias for stability
directLight.shadowNormalBias = 0.1;  // Higher for performance

// Mobile-optimized setup
directLight.shadowType = ShadowType.SoftLow; // Enables shadows with low quality
directLight.shadowStrength = 0.6;
directLight.shadowBias = 0.02;
directLight.shadowNormalBias = 0.15;
```

## ShadowManager Configuration

### Global Shadow Settings

```ts
class ShadowManager {
  // Enable/disable shadow system
  enabled: boolean = true;
  
  // Shadow map resolution
  shadowMapSize: ShadowResolution = ShadowResolution.Medium;
  
  // Maximum shadow distance
  shadowDistance: number = 50;
  
  // Number of shadow cascades (1-4)
  cascadeCount: number = 4;
  
  // Cascade split distribution
  cascadeSplitRatio: number[] = [0.1, 0.3, 0.6, 1.0];
  
  // Shadow fade distance
  shadowFadeDistance: number = 10;
}

enum ShadowResolution {
  Low = 512,
  Medium = 1024,
  High = 2048,
  Ultra = 4096
}
```

### Advanced Shadow Manager Setup

```ts
const shadowManager = engine.shadowManager;

// Configure for large outdoor scenes
shadowManager.enabled = true;
shadowManager.shadowMapSize = ShadowResolution.High;
shadowManager.shadowDistance = 100;
shadowManager.cascadeCount = 4;
shadowManager.cascadeSplitRatio = [0.05, 0.2, 0.5, 1.0]; // More detail near camera
shadowManager.shadowFadeDistance = 15;

// Configure for indoor scenes
shadowManager.enabled = true;
shadowManager.shadowMapSize = ShadowResolution.Medium;
shadowManager.shadowDistance = 30;
shadowManager.cascadeCount = 2; // Fewer cascades needed
shadowManager.cascadeSplitRatio = [0.3, 1.0];
shadowManager.shadowFadeDistance = 5;

// Performance monitoring
shadowManager.onShadowMapUpdate = (cascadeIndex: number) => {
  console.log(`Shadow cascade ${cascadeIndex} updated`);
};
```

## Cascaded Shadow Maps

### Understanding Cascade Distribution

```ts
class CascadedShadowManager {
  // Calculate cascade split distances
  calculateCascadeSplits(nearPlane: number, farPlane: number, cascadeCount: number): number[] {
    const splits: number[] = [];
    const range = farPlane - nearPlane;
    
    for (let i = 0; i < cascadeCount; i++) {
      const ratio = this.cascadeSplitRatio[i];
      splits[i] = nearPlane + range * ratio;
    }
    
    return splits;
  }
  
  // Get cascade bounds for debugging
  getCascadeBounds(cascadeIndex: number): BoundingBox {
    const cascade = this.shadowCascades[cascadeIndex];
    return cascade.bounds;
  }
  
  // Optimize cascade distribution
  optimizeCascades(camera: Camera): void {
    const splits = this.calculateCascadeSplits(
      camera.nearClipPlane,
      Math.min(camera.farClipPlane, this.shadowDistance),
      this.cascadeCount
    );
    
    this.updateCascadeMatrices(splits);
  }
}
```

### Cascade Debugging and Visualization

```ts
class ShadowDebugger {
  private cascadeColors = [
    new Color(1, 0, 0, 0.5), // Red for cascade 0
    new Color(0, 1, 0, 0.5), // Green for cascade 1  
    new Color(0, 0, 1, 0.5), // Blue for cascade 2
    new Color(1, 1, 0, 0.5)  // Yellow for cascade 3
  ];
  
  visualizeCascades(shadowManager: ShadowManager): void {
    for (let i = 0; i < shadowManager.cascadeCount; i++) {
      const cascade = shadowManager.shadowCascades[i];
      const color = this.cascadeColors[i];
      
      // Render cascade frustum visualization
      this.renderFrustum(cascade.viewMatrix, cascade.projectionMatrix, color);
    }
  }
  
  logCascadeInfo(shadowManager: ShadowManager): void {
    for (let i = 0; i < shadowManager.cascadeCount; i++) {
      const cascade = shadowManager.shadowCascades[i];
      console.log(`Cascade ${i}:`);
      console.log(`  Split distance: ${cascade.splitDistance}`);
      console.log(`  Bounds: ${cascade.bounds}`);
      console.log(`  Texel size: ${cascade.texelSize}`);
    }
  }
}
```

## Shadow Filtering and Quality

### Shadow Filtering Techniques

```ts
class ShadowFilter {
  // Percentage Closer Filtering (PCF)
  static setupPCF(material: Material, filterSize: number): void {
    material.shaderData.setFloat("shadowPCFKernel", filterSize);
    material.shaderData.setFloat("shadowMapTexelSize", 1.0 / 1024); // Adjust for shadow map size
  }
  
  // Variance Shadow Maps (VSM)
  static setupVSM(material: Material): void {
    material.shaderData.enableMacro("SHADOW_VSM");
    material.shaderData.setFloat("shadowMinVariance", 0.00002);
    material.shaderData.setFloat("shadowLightBleedingReduction", 0.8);
  }
  
  // Contact shadows for fine detail
  static setupContactShadows(material: Material, settings: ContactShadowSettings): void {
    material.shaderData.enableMacro("CONTACT_SHADOWS");
    material.shaderData.setFloat("contactShadowLength", settings.length);
    material.shaderData.setFloat("contactShadowDistanceScaleFactor", settings.distanceScale);
    material.shaderData.setInt("contactShadowSampleCount", settings.sampleCount);
  }
}

interface ContactShadowSettings {
  length: number;
  distanceScale: number;
  sampleCount: number;
}
```

### Adaptive Shadow Quality

```ts
class AdaptiveShadowQuality {
  private qualityLevels = {
    low: {
      shadowMapSize: ShadowResolution.Low,
      cascadeCount: 2,
      shadowType: ShadowType.Hard,
      shadowDistance: 25
    },
    medium: {
      shadowMapSize: ShadowResolution.Medium,
      cascadeCount: 3,
      shadowType: ShadowType.SoftLow,
      shadowDistance: 50
    },
    high: {
      shadowMapSize: ShadowResolution.High,
      cascadeCount: 4,
      shadowType: ShadowType.SoftMedium,
      shadowDistance: 75
    },
    ultra: {
      shadowMapSize: ShadowResolution.Ultra,
      cascadeCount: 4,
      shadowType: ShadowType.SoftHigh,
      shadowDistance: 100
    }
  };
  
  adaptQuality(performanceMetrics: PerformanceMetrics, shadowManager: ShadowManager): void {
    let targetQuality = 'medium';
    
    if (performanceMetrics.averageFrameTime > 20) {
      targetQuality = 'low';
    } else if (performanceMetrics.averageFrameTime < 10) {
      targetQuality = 'high';
    }
    
    const settings = this.qualityLevels[targetQuality];
    this.applyQualitySettings(settings, shadowManager);
  }
  
  private applyQualitySettings(settings: any, shadowManager: ShadowManager): void {
    shadowManager.shadowMapSize = settings.shadowMapSize;
    shadowManager.cascadeCount = settings.cascadeCount;
    shadowManager.shadowDistance = settings.shadowDistance;
    
    // Apply to all directional lights
    const lights = shadowManager.scene.findAllComponentsOfType(DirectLight);
    lights.forEach(light => {
      if (light.enableShadow) {
        light.shadowType = settings.shadowType;
      }
    });
  }
}
```

## Performance Optimization

### Shadow LOD System

```ts
class ShadowLOD {
  private lodLevels = [
    { distance: 10, shadowType: ShadowType.SoftHigh, bias: 0.001 },
    { distance: 25, shadowType: ShadowType.SoftMedium, bias: 0.003 },
    { distance: 50, shadowType: ShadowType.SoftLow, bias: 0.005 },
    { distance: 100, shadowType: ShadowType.Hard, bias: 0.01 }
  ];
  
  updateLOD(camera: Camera, lights: DirectLight[]): void {
    const cameraPosition = camera.entity.transform.worldPosition;
    
    lights.forEach(light => {
      if (!light.enableShadow) return;
      
      const lightDistance = Vector3.distance(
        cameraPosition,
        light.entity.transform.worldPosition
      );
      
      // Find appropriate LOD level
      for (const lod of this.lodLevels) {
        if (lightDistance <= lod.distance) {
          light.shadowType = lod.shadowType;
          light.shadowBias = lod.bias;
          break;
        }
      }
    });
  }
}
```

### Shadow Culling Optimization

```ts
class ShadowCuller {
  // Frustum culling for shadow casters
  cullShadowCasters(light: DirectLight, renderers: MeshRenderer[]): MeshRenderer[] {
    const shadowFrustum = this.calculateShadowFrustum(light);
    const visibleCasters: MeshRenderer[] = [];
    
    for (const renderer of renderers) {
      if (!renderer.castShadows) continue;
      
      const bounds = renderer.bounds;
      if (shadowFrustum.intersectsBox(bounds)) {
        visibleCasters.push(renderer);
      }
    }
    
    return visibleCasters;
  }
  
  // Distance-based culling
  cullByDistance(camera: Camera, renderers: MeshRenderer[], maxDistance: number): MeshRenderer[] {
    const cameraPosition = camera.entity.transform.worldPosition;
    
    return renderers.filter(renderer => {
      const distance = Vector3.distance(
        cameraPosition,
        renderer.entity.transform.worldPosition
      );
      return distance <= maxDistance;
    });
  }
  
  // Size-based culling (cull small objects)
  cullBySize(renderers: MeshRenderer[], minSize: number): MeshRenderer[] {
    return renderers.filter(renderer => {
      const bounds = renderer.bounds;
      const size = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
      return size >= minSize;
    });
  }
}
```

## Advanced Shadow Techniques

### Soft Shadow Implementation

```ts
class SoftShadowRenderer {
  // Poisson disk sampling for soft shadows
  private poissonDisk = [
    new Vector2(-0.613392, 0.617481),
    new Vector2(0.170019, -0.040254),
    new Vector2(-0.299417, 0.791925),
    new Vector2(0.645680, 0.493210),
    // ... more samples
  ];
  
  setupSoftShadows(material: Material, lightSize: number, sampleCount: number): void {
    material.shaderData.enableMacro("SOFT_SHADOWS");
    material.shaderData.setFloat("lightSize", lightSize);
    material.shaderData.setInt("shadowSampleCount", sampleCount);
    material.shaderData.setVector2Array("poissonDisk", this.poissonDisk);
  }
  
  // Percentage Closer Soft Shadows (PCSS)
  setupPCSS(material: Material): void {
    material.shaderData.enableMacro("PCSS_SHADOWS");
    material.shaderData.setFloat("lightWorldSize", 2.0);
    material.shaderData.setFloat("nearPlane", 0.1);
    material.shaderData.setInt("blockerSearchSamples", 16);
    material.shaderData.setInt("pcfSamples", 16);
  }
}
```

### Contact Shadows

```ts
class ContactShadowRenderer {
  setup(camera: Camera, settings: ContactShadowSettings): void {
    const material = this.getScreenSpaceMaterial();
    
    material.shaderData.enableMacro("CONTACT_SHADOWS");
    material.shaderData.setFloat("contactShadowLength", settings.length);
    material.shaderData.setFloat("contactShadowThickness", settings.thickness);
    material.shaderData.setInt("contactShadowSteps", settings.steps);
    material.shaderData.setFloat("contactShadowFadeStart", settings.fadeStart);
    material.shaderData.setFloat("contactShadowFadeEnd", settings.fadeEnd);
    
    // Set camera matrices for screen-space calculation
    material.shaderData.setMatrix("viewMatrix", camera.viewMatrix);
    material.shaderData.setMatrix("projectionMatrix", camera.projectionMatrix);
  }
  
  render(camera: Camera, depthTexture: Texture2D, normalTexture: Texture2D): Texture2D {
    const material = this.getScreenSpaceMaterial();
    material.shaderData.setTexture("depthTexture", depthTexture);
    material.shaderData.setTexture("normalTexture", normalTexture);
    
    return this.renderFullScreenQuad(material);
  }
}

interface ContactShadowSettings {
  length: number;
  thickness: number;
  steps: number;
  fadeStart: number;
  fadeEnd: number;
}
```

## Shadow Debugging and Profiling

### Shadow Performance Monitor

```ts
class ShadowProfiler {
  private shadowStats = {
    shadowMapUpdates: 0,
    totalShadowCasters: 0,
    culledCasters: 0,
    shadowMapMemory: 0,
    lastFrameTime: 0
  };
  
  profileFrame(shadowManager: ShadowManager): void {
    const startTime = performance.now();
    
    // Reset frame stats
    this.shadowStats.shadowMapUpdates = 0;
    this.shadowStats.totalShadowCasters = 0;
    this.shadowStats.culledCasters = 0;
    
    // Monitor shadow map updates
    shadowManager.onCascadeUpdate = (cascadeIndex: number) => {
      this.shadowStats.shadowMapUpdates++;
    };
    
    // Calculate shadow map memory usage
    const resolution = shadowManager.shadowMapSize;
    const cascadeCount = shadowManager.cascadeCount;
    this.shadowStats.shadowMapMemory = resolution * resolution * 4 * cascadeCount; // Bytes
    
    this.shadowStats.lastFrameTime = performance.now() - startTime;
  }
  
  generateReport(): string {
    return `Shadow Performance Report:
- Shadow map updates: ${this.shadowStats.shadowMapUpdates}
- Total shadow casters: ${this.shadowStats.totalShadowCasters}
- Culled casters: ${this.shadowStats.culledCasters}
- Shadow map memory: ${(this.shadowStats.shadowMapMemory / 1024 / 1024).toFixed(2)} MB
- Frame time: ${this.shadowStats.lastFrameTime.toFixed(2)} ms`;
  }
}
```

### Shadow Quality Validation

```ts
class ShadowValidator {
  validateShadowSetup(light: DirectLight): boolean {
    const issues: string[] = [];
    
    if (!light.enableShadow) {
      issues.push("Shadows not enabled on light");
      return false;
    }
    
    if (light.shadowBias < 0.0001) {
      issues.push("Shadow bias too low, may cause shadow acne");
    }
    
    if (light.shadowBias > 0.1) {
      issues.push("Shadow bias too high, shadows may detach from objects");
    }
    
    if (light.shadowNormalBias < 0.01) {
      issues.push("Normal bias too low for curved surfaces");
    }
    
    if (light.shadowStrength <= 0) {
      issues.push("Shadow strength is zero or negative");
    }
    
    if (issues.length > 0) {
      console.warn("Shadow setup issues:", issues);
      return false;
    }
    
    return true;
  }
  
  validateShadowManager(shadowManager: ShadowManager): boolean {
    if (!shadowManager.enabled) {
      console.warn("Shadow manager is disabled");
      return false;
    }
    
    if (shadowManager.shadowDistance <= 0) {
      console.warn("Shadow distance is invalid");
      return false;
    }
    
    if (shadowManager.cascadeCount < 1 || shadowManager.cascadeCount > 4) {
      console.warn("Invalid cascade count");
      return false;
    }
    
    return true;
  }
}
```

## API Reference

```apidoc
DirectLight:
  Properties:
    enableShadow: boolean
      - Enable shadow casting for this light. @defaultValue `false`
    shadowType: ShadowType
      - Shadow filtering quality type. @defaultValue `ShadowType.Hard`
    shadowStrength: number
      - Shadow opacity (0.0 to 1.0). @defaultValue `1.0`
    shadowBias: number
      - Depth bias to prevent shadow acne. @defaultValue `0.005`
    shadowNormalBias: number
      - Normal-based bias for curved surfaces. @defaultValue `0.05`
    shadowNearPlaneOffset: number
      - Near plane offset for shadow camera. @defaultValue `0.1`

ShadowManager:
  Properties:
    enabled: boolean
      - Enable/disable entire shadow system. @defaultValue `true`
    shadowMapSize: ShadowResolution
      - Resolution of shadow maps. @defaultValue `ShadowResolution.Medium`
    shadowDistance: number
      - Maximum distance for shadow rendering. @defaultValue `50`
    cascadeCount: number
      - Number of shadow cascades (1-4). @defaultValue `4`
    cascadeSplitRatio: number[]
      - Distribution ratios for cascade splits. @defaultValue `[0.1, 0.3, 0.6, 1.0]`
    shadowFadeDistance: number
      - Distance over which shadows fade out. @defaultValue `10`

ShadowType:
  Values:
    Hard: "Hard"
      - Hard shadows with no filtering
    SoftLow: "SoftLow"
      - Soft shadows with 2x2 PCF filtering
    SoftMedium: "SoftMedium"
      - Soft shadows with 3x3 PCF filtering
    SoftHigh: "SoftHigh"
      - Soft shadows with 4x4 PCF filtering

ShadowResolution:
  Values:
    Low: 512
      - 512x512 shadow map resolution
    Medium: 1024
      - 1024x1024 shadow map resolution
    High: 2048
      - 2048x2048 shadow map resolution
    Ultra: 4096
      - 4096x4096 shadow map resolution

MeshRenderer:
  Properties:
    castShadows: boolean
      - Whether this renderer casts shadows. @defaultValue `true`
    receiveShadows: boolean
      - Whether this renderer receives shadows. @defaultValue `true`
```

## Best Practices

### Shadow Quality Configuration
- Use ShadowType.SoftMedium for balanced quality and performance
- Set shadow bias between 0.001-0.01 depending on scene scale
- Configure normal bias between 0.02-0.1 for curved surfaces
- Use 2-3 cascades for most scenes, 4 for large outdoor environments

### Performance Optimization
- Limit shadow distance to visible range for better cascade utilization
- Use shadow LOD systems to reduce quality at distance
- Implement shadow caster culling based on size and distance
- Monitor shadow map memory usage and adjust resolution accordingly

### Visual Quality
- Position directional lights at 30-60 degree angles for optimal shadow coverage
- Use cascade visualization during development to verify distribution
- Test shadow settings across different times of day and lighting conditions
- Balance shadow strength to maintain visual contrast without overshadowing

### Memory and Performance
- Choose shadow map resolution based on target platform capabilities
- Use contact shadows sparingly for hero objects only
- Implement adaptive quality systems for varying performance conditions
- Profile shadow rendering costs and optimize shadow caster counts
