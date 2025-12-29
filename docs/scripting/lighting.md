# Lighting

Galacean's lighting system provides comprehensive support for realistic 3D illumination including directional lights, point lights, spot lights, ambient lighting, and advanced features like shadows, ambient occlusion, and physically-based rendering. The system supports dynamic lighting with real-time shadows, image-based lighting with spherical harmonics, and performance optimization through light culling and batching.

## Overview

The lighting system consists of several core components:
- **Light Types**: DirectLight (sun/moon), PointLight (bulbs), SpotLight (flashlights), AmbientLight (environment)
- **Shadow System**: Real-time shadow mapping with configurable quality and bias settings
- **Ambient Occlusion**: Screen-space ambient occlusion (SSAO) for enhanced depth perception
- **Light Management**: Automatic light culling, batching, and performance optimization
- **Image-Based Lighting**: Environment maps and spherical harmonics for realistic ambient lighting

The system integrates seamlessly with materials and shaders to provide physically-accurate lighting calculations, supporting both forward and deferred rendering pipelines.

## Quick Start

```ts
import { WebGLEngine, DirectLight, PointLight, SpotLight, AmbientLight, DiffuseMode, ShadowType } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;

// Create sun light (directional light)
const sunEntity = scene.createRootEntity("Sun");
const sunLight = sunEntity.addComponent(DirectLight);
sunLight.color.set(1, 0.95, 0.8, 1); // Warm sunlight
sunLight.shadowType = ShadowType.SoftLow;
sunEntity.transform.setRotation(-30, 30, 0);

// Create point light for indoor lighting
const lampEntity = scene.createRootEntity("Lamp");
const pointLight = lampEntity.addComponent(PointLight);
pointLight.color.set(1, 0.8, 0.6, 1); // Warm indoor light
pointLight.distance = 10;
lampEntity.transform.setPosition(5, 3, 0);

// Create spot light for focused illumination
const flashlightEntity = scene.createRootEntity("Flashlight");
const spotLight = flashlightEntity.addComponent(SpotLight);
spotLight.color.set(1, 1, 1, 1);
spotLight.angle = Math.PI / 6; // Cone angle in radians (30 degrees)
spotLight.penumbra = Math.PI / 12; // Soft edge falloff in radians
spotLight.distance = 15;
flashlightEntity.transform.setPosition(0, 2, 5);
flashlightEntity.transform.lookAt(new Vector3(0, 0, 0));

// Setup ambient lighting
const ambientLight = scene.ambientLight;
ambientLight.diffuseMode = DiffuseMode.SolidColor;
ambientLight.diffuseSolidColor.set(0.2, 0.2, 0.3, 1);
ambientLight.diffuseIntensity = 0.4;
```

## Light Types

### DirectLight (Directional Light)

Directional lights simulate distant light sources like the sun or moon, providing parallel rays across the entire scene:

```ts
// Create directional light
const sunEntity = scene.createRootEntity("Sun");
const directLight = sunEntity.addComponent(DirectLight);

// Configure light properties
directLight.color.set(1, 0.9, 0.7, 1); // Sunset color
directLight.shadowType = ShadowType.SoftHigh; // High quality shadows

// Control light direction through entity rotation
sunEntity.transform.setRotation(-45, 45, 0); // Angled sunlight

// Shadow configuration
directLight.shadowBias = 0.005;        // Prevent shadow acne
directLight.shadowNormalBias = 0.02;   // Reduce self-shadowing
directLight.shadowNearPlane = 1;       // Near plane for shadow camera

// Access computed direction
const lightDirection = directLight.direction;
const reverseDirection = directLight.reverseDirection; // Opposite direction
```

### PointLight

Point lights emit light uniformly in all directions from a single point, like light bulbs:

```ts
// Create point light
const bulbEntity = scene.createRootEntity("Bulb");
const pointLight = bulbEntity.addComponent(PointLight);

// Configure light properties
pointLight.color.set(1, 0.8, 0.6, 1); // Warm white
pointLight.distance = 8; // Light attenuation distance

// Position the light
bulbEntity.transform.setPosition(2, 3, 1);

// Access computed position
const lightPosition = pointLight.position;

// Shadow configuration (if supported)
pointLight.shadowType = ShadowType.SoftLow;
pointLight.shadowBias = 0.01;
pointLight.shadowNormalBias = 0.05;
```

### SpotLight

Spot lights emit light in a cone shape, perfect for flashlights, car headlights, or stage lighting:

```ts
// Create spot light
const spotEntity = scene.createRootEntity("Spotlight");
const spotLight = spotEntity.addComponent(SpotLight);

// Configure cone properties
spotLight.color.set(1, 1, 0.9, 1);
spotLight.angle = Math.PI / 4;      // Cone angle in radians (45 degrees)
spotLight.penumbra = Math.PI / 12;  // Soft edge falloff in radians
spotLight.distance = 20;            // Maximum range

// Position and orient the light
spotEntity.transform.setPosition(0, 5, 5);
spotEntity.transform.lookAt(new Vector3(0, 0, 0));

// Access computed properties
const lightPosition = spotLight.position;
const lightDirection = spotLight.direction;
const reverseDirection = spotLight.reverseDirection;

// Shadow configuration
spotLight.shadowType = ShadowType.SoftMedium;
spotLight.shadowBias = 0.003;
spotLight.shadowNormalBias = 0.02;

// Advanced cone control
console.log(`Inner cone: ${spotLight.angle} radians (${spotLight.angle * 180 / Math.PI} degrees)`);
console.log(`Penumbra falloff: ${spotLight.penumbra} radians (${spotLight.penumbra * 180 / Math.PI} degrees)`);
```

### Light Properties and Shadow Configuration

All light types share common properties for shadows and culling:

```ts
// Common light properties
light.cullingMask = Layer.Everything; // Which layers to illuminate
light.shadowType = ShadowType.SoftHigh; // Shadow quality

// Shadow bias settings (prevent shadow artifacts)
light.shadowBias = 0.005;        // Depth bias
light.shadowNormalBias = 0.02;   // Normal-based bias
light.shadowNearPlane = 0.1;     // Shadow camera near plane

// Shadow strength (how dark shadows appear)
light.shadowStrength = 0.8; // 0 = no shadows, 1 = full shadows

// Access light's view matrix (for advanced shadow techniques)
const viewMatrix = light.viewMatrix;
const inverseViewMatrix = light.inverseViewMatrix;
```

## Ambient Lighting

Ambient lighting provides global illumination that affects all surfaces, creating realistic environmental lighting:

### Solid Color Ambient Light

```ts
// Access scene's ambient light
const ambientLight = scene.ambientLight;

// Set to solid color mode
ambientLight.diffuseMode = DiffuseMode.SolidColor;
ambientLight.diffuseSolidColor.set(0.3, 0.3, 0.4, 1); // Cool ambient
ambientLight.diffuseIntensity = 0.5;

// Specular reflection control
ambientLight.specularTexture = environmentCubeMap;
ambientLight.specularIntensity = 1.0;
ambientLight.specularTextureDecodeRGBM = false; // Set to true for RGBM encoded textures
```

### Image-Based Lighting with Spherical Harmonics

```ts
// Set to spherical harmonics mode for realistic ambient lighting
ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;

// Create spherical harmonics from environment map
const sphericalHarmonics = new SphericalHarmonics3();
// ... populate spherical harmonics coefficients ...

ambientLight.diffuseSphericalHarmonics = sphericalHarmonics;
ambientLight.diffuseIntensity = 1.2;

// Use environment cube map for specular reflections
ambientLight.specularTexture = environmentCubeMap;
ambientLight.specularIntensity = 0.8;

// Enable RGBM decoding for HDR environment maps
ambientLight.specularTextureDecodeRGBM = true;
```

### Environment Map Setup

```ts
// Create environment cube map for reflections
const envTexture = new TextureCube(engine, 512, TextureFormat.R8G8B8);

// Load environment faces
const faceImages = [
  'env_right.jpg', 'env_left.jpg',   // +X, -X
  'env_top.jpg', 'env_bottom.jpg',   // +Y, -Y  
  'env_front.jpg', 'env_back.jpg'    // +Z, -Z
];

Promise.all(faceImages.map(loadImage)).then(images => {
  images.forEach((image, index) => {
    envTexture.setImageSource(image, index as TextureCubeFace);
  });
  envTexture.generateMipmaps();
  
  // Apply to ambient lighting
  ambientLight.specularTexture = envTexture;
});

// Precompute spherical harmonics for diffuse lighting
const sphericalHarmonics = SphericalHarmonics3.preComputeFromCubeMap(envTexture);
ambientLight.diffuseSphericalHarmonics = sphericalHarmonics;
```

## Shadow System

The shadow system provides real-time shadow mapping with configurable quality levels:

### Shadow Types and Quality

```ts
import { ShadowType } from "@galacean/engine";

// Available shadow types
light.shadowType = ShadowType.None;       // No shadows
light.shadowType = ShadowType.Hard;       // Hard shadows (fastest)
light.shadowType = ShadowType.SoftLow;    // Soft shadows (low quality)
light.shadowType = ShadowType.SoftMedium; // Soft shadows (medium quality)
light.shadowType = ShadowType.SoftHigh;   // Soft shadows (high quality)

// Configure shadow resolution (engine-wide setting)
engine.shadowManager.shadowMapSize = 2048; // Higher = better quality, worse performance

// Shadow distance for directional lights
engine.shadowManager.maxDistance = 100; // Maximum shadow distance
```

### Shadow Bias Configuration

```ts
// Prevent shadow acne and light leaking
light.shadowBias = 0.005;        // Depth offset to prevent shadow acne
light.shadowNormalBias = 0.02;   // Normal-based offset for curved surfaces
light.shadowNearPlane = 0.1;     // Near plane for shadow camera

// Shadow strength controls darkness
light.shadowStrength = 0.8; // 0.0 = no shadow, 1.0 = full black

// Directional light specific settings
if (light instanceof DirectLight) {
  light.shadowNearPlaneOffset = 1; // Additional near plane offset
}
```

### Shadow Casting and Receiving

```ts
// Control which objects cast shadows
const meshRenderer = entity.getComponent(MeshRenderer);
meshRenderer.castShadows = true;     // This object casts shadows
meshRenderer.receiveShadows = true;  // This object receives shadows

// Layer-based shadow culling
light.cullingMask = Layer.Default | Layer.Environment; // Only affect these layers

// Material shadow configuration
const material = new PBRMaterial(engine);
material.receiveShadows = true; // Material-level shadow receiving
```

## Ambient Occlusion

Screen-space ambient occlusion (SSAO) enhances depth perception and realism:

### Basic SSAO Setup

```ts
// Access ambient occlusion from scene
const ambientOcclusion = scene.ambientOcclusion;

// Enable ambient occlusion
ambientOcclusion.enabled = true;
ambientOcclusion.quality = AmbientOcclusionQuality.Medium;

// Configure SSAO parameters
ambientOcclusion.radius = 0.5;        // Sampling radius in world units
ambientOcclusion.intensity = 1.0;     // AO effect strength
ambientOcclusion.power = 2.0;         // Contrast enhancement
ambientOcclusion.bias = 0.025;        // Depth bias to prevent artifacts
ambientOcclusion.minHorizonAngle = 15; // Minimum angle for occlusion (degrees)

// Bilateral blur settings for noise reduction
ambientOcclusion.bilateralThreshold = 0.1; // Edge preservation threshold
```

### SSAO Quality Levels

```ts
import { AmbientOcclusionQuality } from "@galacean/engine";

// Available quality levels
ambientOcclusion.quality = AmbientOcclusionQuality.Low;    // 4 samples
ambientOcclusion.quality = AmbientOcclusionQuality.Medium; // 8 samples
ambientOcclusion.quality = AmbientOcclusionQuality.High;   // 16 samples
ambientOcclusion.quality = AmbientOcclusionQuality.Ultra;  // 32 samples

// Custom SSAO configuration per quality level
class SSAOManager extends Script {
  setupSSAO(quality: 'mobile' | 'desktop' | 'high-end'): void {
    const ao = this.scene.ambientOcclusion;
    
    switch (quality) {
      case 'mobile':
        ao.quality = AmbientOcclusionQuality.Low;
        ao.radius = 0.3;
        ao.intensity = 0.8;
        break;
        
      case 'desktop':
        ao.quality = AmbientOcclusionQuality.Medium;
        ao.radius = 0.5;
        ao.intensity = 1.0;
        break;
        
      case 'high-end':
        ao.quality = AmbientOcclusionQuality.High;
        ao.radius = 0.8;
        ao.intensity = 1.2;
        break;
    }
  }
}
```

## Light Management

The light manager handles automatic culling, batching, and optimization:

### Light Inventory Helpers

```ts
import { Scene, Entity, Component, DirectLight, PointLight, SpotLight } from "@galacean/engine";

// Collect lights using public component APIs
const collectLights = <T extends Component>(entity: Entity, type: new (...args: any[]) => T, out: T[]): void => {
  entity.getComponents(type, out);
  for (const child of entity.children) {
    collectLights(child, type, out);
  }
};

const gatherLights = <T extends Component>(scene: Scene, type: new (...args: any[]) => T): T[] => {
  const result: T[] = [];
  for (const root of scene.rootEntities) {
    collectLights(root, type, result);
  }
  return result;
};

const directionalLights = gatherLights(scene, DirectLight);
const pointLights = gatherLights(scene, PointLight);
const spotLights = gatherLights(scene, SpotLight);

console.log(`Directional lights: ${directionalLights.length}`);
console.log(`Point lights: ${pointLights.length}`);
console.log(`Spot lights: ${spotLights.length}`);

// Access the designated sun light (if any)
const sunlight = scene.sun ?? directionalLights[0] ?? null;
```

### Dynamic Light Management

```ts
class DynamicLightManager extends Script {
  private lights: PointLight[] = [];
  private maxActiveLights = 8;
  
  onUpdate(): void {
    const cameraEntity = this.scene.findEntityByName("MainCamera");
    if (!cameraEntity) return;
    const camera = cameraEntity.getComponent(Camera);
    if (!camera) return;
    const cameraPos = camera.entity.transform.worldPosition;
    
    // Sort lights by distance to camera
    this.lights.sort((a, b) => {
      const distA = Vector3.distance(a.position, cameraPos);
      const distB = Vector3.distance(b.position, cameraPos);
      return distA - distB;
    });
    
    // Enable only closest lights
    this.lights.forEach((light, index) => {
      light.entity.isActive = index < this.maxActiveLights;
    });
  }
  
  addLight(light: PointLight): void {
    this.lights.push(light);
  }
  
  removeLight(light: PointLight): void {
    const index = this.lights.indexOf(light);
    if (index > -1) {
      this.lights.splice(index, 1);
    }
  }
}
```

### Light Culling by Layers

```ts
// Setup layer-based lighting
const playerLayer = Layer.Layer1;
const environmentLayer = Layer.Layer2;
const uiLayer = Layer.Layer3;

// Main scene lighting affects player and environment
const sunLight = sunEntity.getComponent(DirectLight);
sunLight.cullingMask = playerLayer | environmentLayer;

// UI lighting only affects UI elements
const uiLight = uiEntity.getComponent(DirectLight);
uiLight.cullingMask = uiLayer;

// Point light for indoor areas only
const indoorLight = lampEntity.getComponent(PointLight);
indoorLight.cullingMask = playerLayer; // Only affect player objects
```

## Advanced Lighting Techniques

### Day-Night Cycle

```ts
class DayNightCycle extends Script {
  private sunLight: DirectLight;
  private moonLight: DirectLight;
  private timeOfDay = 0; // 0-24 hours
  
  onAwake(): void {
    this.sunLight = this.scene.findEntityByName("Sun").getComponent(DirectLight);
    this.moonLight = this.scene.findEntityByName("Moon").getComponent(DirectLight);
  }
  
  onUpdate(deltaTime: number): void {
    this.timeOfDay += deltaTime * 0.1; // 10x speed
    if (this.timeOfDay >= 24) this.timeOfDay = 0;
    
    this.updateSunMoon();
    this.updateAmbientLight();
  }
  
  private updateSunMoon(): void {
    const sunAngle = (this.timeOfDay - 6) * 15; // Sun rises at 6 AM
    const moonAngle = sunAngle + 180;
    
    // Update sun
    this.sunLight.entity.transform.setRotation(sunAngle, 30, 0);
    this.sunLight.entity.isActive = sunAngle > -30 && sunAngle < 210;
    
    // Update moon
    this.moonLight.entity.transform.setRotation(moonAngle, 30, 0);
    this.moonLight.entity.isActive = !this.sunLight.entity.isActive;
    
    // Adjust colors based on time
    if (this.timeOfDay >= 5 && this.timeOfDay <= 7) {
      // Sunrise - warm orange
      this.sunLight.color.set(1, 0.6, 0.3, 1);
    } else if (this.timeOfDay >= 17 && this.timeOfDay <= 19) {
      // Sunset - warm red
      this.sunLight.color.set(1, 0.4, 0.2, 1);
    } else {
      // Midday - neutral white
      this.sunLight.color.set(1, 0.95, 0.8, 1);
    }
  }
  
  private updateAmbientLight(): void {
    const ambientLight = this.scene.ambientLight;
    
    if (this.timeOfDay >= 6 && this.timeOfDay <= 18) {
      // Daytime - blue sky ambient
      ambientLight.diffuseSolidColor.set(0.4, 0.6, 1.0, 1);
      ambientLight.diffuseIntensity = 0.8;
    } else {
      // Nighttime - dark blue ambient
      ambientLight.diffuseSolidColor.set(0.1, 0.15, 0.3, 1);
      ambientLight.diffuseIntensity = 0.3;
    }
  }
}
```

### Light Probes for Baked Lighting

```ts
class LightProbeSystem extends Script {
  private probePositions: Vector3[] = [];
  private sphericalHarmonics: SphericalHarmonics3[] = [];
  
  onAwake(): void {
    this.setupProbeGrid();
    this.bakeProbes();
  }
  
  private setupProbeGrid(): void {
    // Create 3D grid of light probe positions
    for (let x = -10; x <= 10; x += 5) {
      for (let y = 0; y <= 10; y += 5) {
        for (let z = -10; z <= 10; z += 5) {
          this.probePositions.push(new Vector3(x, y, z));
        }
      }
    }
  }
  
  private bakeProbes(): void {
    // Simulate baking process (in real implementation, use raytracing)
    this.probePositions.forEach(position => {
      const sh = new SphericalHarmonics3();
      
      // Sample environment in all directions from this position
      // This is simplified - real implementation would raytrace
      const environmentContribution = this.sampleEnvironment(position);
      sh.addAmbientLight(environmentContribution);
      
      this.sphericalHarmonics.push(sh);
    });
  }
  
  getProbeAtPosition(worldPos: Vector3): SphericalHarmonics3 {
    // Find closest probe and interpolate
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    this.probePositions.forEach((probePos, index) => {
      const distance = Vector3.distance(worldPos, probePos);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    
    return this.sphericalHarmonics[closestIndex];
  }
  
  private sampleEnvironment(position: Vector3): Color {
    // Simplified environment sampling
    const height = position.y / 10; // Normalize height
    return new Color(0.3 + height * 0.4, 0.4 + height * 0.3, 0.6 + height * 0.2, 1);
  }
}
```

### Volumetric Lighting

```ts
class VolumetricLighting extends Script {
  private volumetricMaterial: Material;
  private lightShaftQuad: Entity;
  
  onAwake(): void {
    this.createVolumetricQuad();
    this.setupVolumetricMaterial();
  }
  
  private createVolumetricQuad(): void {
    this.lightShaftQuad = this.scene.createRootEntity("VolumetricLighting");
    const meshRenderer = this.lightShaftQuad.addComponent(MeshRenderer);
    meshRenderer.mesh = PrimitiveMesh.createPlane(this.engine, 20, 20);
    meshRenderer.material = this.volumetricMaterial;
  }
  
  private setupVolumetricMaterial(): void {
    // Create custom volumetric lighting shader
    const volumetricShader = Shader.create("VolumetricLighting", 
      this.getVolumetricVertexShader(),
      this.getVolumetricFragmentShader()
    );
    
    this.volumetricMaterial = new Material(this.engine, volumetricShader);
    this.volumetricMaterial.isTransparent = true;
    this.volumetricMaterial.blendMode = BlendMode.Additive;
  }
  
  updateVolumetrics(lightPosition: Vector3, lightDirection: Vector3): void {
    this.volumetricMaterial.shaderData.setVector3("lightPosition", lightPosition);
    this.volumetricMaterial.shaderData.setVector3("lightDirection", lightDirection);
    this.volumetricMaterial.shaderData.setFloat("scatteringStrength", 0.8);
    this.volumetricMaterial.shaderData.setFloat("attenuationStrength", 0.5);
  }
  
  private getVolumetricVertexShader(): string {
    return `
      attribute vec3 POSITION;
      attribute vec2 TEXCOORD_0;
      
      uniform mat4 camera_VPMat;
      uniform mat4 renderer_ModelMat;
      
      varying vec2 v_uv;
      varying vec3 v_worldPos;
      
      void main() {
        vec4 worldPos = renderer_ModelMat * vec4(POSITION, 1.0);
        v_worldPos = worldPos.xyz;
        v_uv = TEXCOORD_0;
        gl_Position = camera_VPMat * worldPos;
      }
    `;
  }
  
  private getVolumetricFragmentShader(): string {
    return `
      precision mediump float;
      
      uniform vec3 lightPosition;
      uniform vec3 lightDirection;
      uniform float scatteringStrength;
      uniform float attenuationStrength;
      uniform vec3 camera_Position;
      
      varying vec2 v_uv;
      varying vec3 v_worldPos;
      
      void main() {
        vec3 viewDir = normalize(camera_Position - v_worldPos);
        vec3 lightDir = normalize(lightPosition - v_worldPos);
        
        float lightDistance = length(lightPosition - v_worldPos);
        float attenuation = 1.0 / (1.0 + attenuationStrength * lightDistance);
        
        float scattering = pow(max(dot(viewDir, lightDir), 0.0), 4.0);
        
        vec3 color = vec3(1.0, 0.9, 0.7) * scattering * scatteringStrength * attenuation;
        gl_FragColor = vec4(color, scattering * 0.1);
      }
    `;
  }
}
```

## Performance Optimization

### Light Batching and Culling

```ts
class LightOptimizer extends Script {
  private lightGroups: Map<string, PointLight[]> = new Map();
  private cullingDistance = 50;
  
  onUpdate(): void {
    const camera = this.scene.findEntityByName("MainCamera").getComponent(Camera);
    this.performFrustumCulling(camera);
    this.updateLightLOD(camera);
  }
  
  private performFrustumCulling(camera: Camera): void {
    const cameraPos = camera.entity.transform.worldPosition;
    
    // Get all point lights in scene
    const allLights = this.scene.findEntitiesWithTag("PointLight");
    
    allLights.forEach(lightEntity => {
      const pointLight = lightEntity.getComponent(PointLight);
      const lightPos = lightEntity.transform.worldPosition;
      const distance = Vector3.distance(cameraPos, lightPos);
      
      // Cull lights beyond maximum distance
      const shouldCull = distance > this.cullingDistance;
      lightEntity.isActive = !shouldCull;
      
      // Reduce light range for distant lights
      if (!shouldCull && distance > 20) {
        pointLight.distance = Math.max(1, pointLight.distance * 0.5);
      }
    });
  }
  
  private updateLightLOD(camera: Camera): void {
    const cameraPos = camera.entity.transform.worldPosition;
    
    this.lightGroups.forEach((lights, groupName) => {
      lights.forEach(light => {
        const distance = Vector3.distance(cameraPos, light.position);
        
        // Adjust shadow quality based on distance
        if (distance < 10) {
          light.shadowType = ShadowType.SoftHigh;
        } else if (distance < 25) {
          light.shadowType = ShadowType.SoftMedium;
        } else if (distance < 40) {
          light.shadowType = ShadowType.SoftLow;
        } else {
          light.shadowType = ShadowType.None;
        }
      });
    });
  }
  
  groupLights(lights: PointLight[], groupName: string): void {
    this.lightGroups.set(groupName, lights);
  }
}
```


## API Reference

```apidoc
Light (Base Class):
  Properties:
    cullingMask: Layer
      - Layer mask for selective lighting.
    shadowType: ShadowType
      - Shadow quality level (None, Hard, SoftLow, SoftMedium, SoftHigh).
    shadowBias: number
      - Depth bias to prevent shadow acne.
    shadowNormalBias: number
      - Normal-based bias for curved surfaces.
    shadowNearPlane: number
      - Near plane distance for shadow camera.
    shadowStrength: number
      - Shadow darkness (0-1, where 0 = no shadow, 1 = full black).
    color: Color
      - Light color and intensity.

  Methods:
    viewMatrix: Matrix4
      - Get light's view matrix for shadow calculations.
    inverseViewMatrix: Matrix4
      - Get inverse view matrix for light-space transformations.

DirectLight extends Light:
  Properties:
    shadowNearPlaneOffset: number
      - Additional near plane offset for shadow camera.
    direction: Vector3
      - Light direction in world space (read-only).
    reverseDirection: Vector3
      - Opposite of light direction (read-only).

PointLight extends Light:
  Properties:
    distance: number
      - Light attenuation distance.
    position: Vector3
      - Light position in world space (read-only).

SpotLight extends Light:
  Properties:
    distance: number
      - Light attenuation distance.
    angle: number
      - Cone angle in degrees (0-90).
    penumbra: number
      - Soft edge falloff ratio (0-1).
    position: Vector3
      - Light position in world space (read-only).
    direction: Vector3
      - Light direction in world space (read-only).
    reverseDirection: Vector3
      - Opposite of light direction (read-only).

AmbientLight:
  Properties:
    diffuseMode: DiffuseMode
      - Ambient light mode (SolidColor or SphericalHarmonics).
    diffuseSolidColor: Color
      - Solid color for ambient lighting.
    diffuseIntensity: number
      - Ambient light intensity multiplier.
    diffuseSphericalHarmonics: SphericalHarmonics3
      - Spherical harmonics coefficients for environment lighting.
    specularTexture: TextureCube
      - Environment cube map for specular reflections.
    specularIntensity: number
      - Specular reflection intensity.
    specularTextureDecodeRGBM: boolean
      - Whether to decode RGBM format for HDR textures.

AmbientOcclusion:
  Properties:
    enabled: boolean
      - Whether ambient occlusion is active.
    quality: AmbientOcclusionQuality
      - SSAO quality level (Low, Medium, High, Ultra).
    radius: number
      - Sampling radius in world units.
    intensity: number
      - AO effect strength.
    power: number
      - Contrast enhancement factor.
    bias: number
      - Depth bias to prevent artifacts.
    minHorizonAngle: number
      - Minimum angle for occlusion detection (degrees).
    bilateralThreshold: number
      - Edge preservation threshold for blur.

Enums:
  ShadowType:
    - None: No shadows
    - Hard: Sharp shadows (fastest)
    - SoftLow: Soft shadows (4 samples)
    - SoftMedium: Soft shadows (9 samples)
    - SoftHigh: Soft shadows (16 samples)

  DiffuseMode:
    - SolidColor: Uniform ambient color
    - SphericalHarmonics: Environment-based ambient lighting

  AmbientOcclusionQuality:
    - Low: 4 samples per pixel
    - Medium: 8 samples per pixel
    - High: 16 samples per pixel
    - Ultra: 32 samples per pixel
```

## Best Practices

- **Light Optimization**: Limit the number of dynamic lights per scene (8-16 for mobile, 32+ for desktop)
- **Shadow Configuration**: Use appropriate shadow types based on importance (SoftHigh for hero objects, SoftLow for background)
- **Ambient Lighting**: Use spherical harmonics for realistic environment lighting instead of flat ambient color
- **Layer Culling**: Use culling masks to prevent lights from affecting unnecessary objects
- **Distance Culling**: Disable distant lights or reduce their quality to improve performance
- **Shadow Bias**: Adjust shadow bias values to prevent both shadow acne and light leaking
- **SSAO Parameters**: Tune SSAO settings per platform - use lower quality on mobile devices
- **Light Probes**: Pre-bake lighting information for static environments to reduce runtime calculations
- **Dynamic Shadows**: Reserve real-time shadows for important objects, use baked shadows for static geometry
- **HDR Workflow**: Use HDR environment maps and proper tone mapping for realistic lighting

## Common Issues

**Shadow Acne**: Adjust shadow bias settings to prevent self-shadowing artifacts:
```ts
// Increase depth bias for surfaces prone to shadow acne
light.shadowBias = 0.01;
light.shadowNormalBias = 0.05;
```

**Light Leaking**: Reduce shadow bias if light appears to leak through surfaces:
```ts
// Reduce bias but increase normal bias
light.shadowBias = 0.001;
light.shadowNormalBias = 0.02;
```

**Performance Issues**: Monitor light count and shadow complexity:
```ts
// Implement light LOD system
class PerformanceMonitor extends Script {
  onUpdate(): void {
    const pointLights = gatherLights(this.scene, PointLight);
    const spotLights = gatherLights(this.scene, SpotLight);
    const directionalLights = gatherLights(this.scene, DirectLight);
    const lightCount = pointLights.length + spotLights.length + directionalLights.length;
    
    if (lightCount > 16) {
      console.warn(`Too many lights: ${lightCount}`);
    }
  }
}
```

**SSAO Artifacts**: Adjust SSAO parameters to reduce noise and banding:
```ts
// Reduce artifacts with proper parameter tuning
ambientOcclusion.radius = 0.3;        // Smaller radius for tighter contact shadows
ambientOcclusion.bias = 0.02;         // Prevent surface banding
ambientOcclusion.bilateralThreshold = 0.05; // Preserve fine details
```
