# Sky System

Galacean's sky system provides comprehensive background rendering capabilities for 3D scenes, including traditional skyboxes using cube textures and procedural atmospheric scattering. The sky system integrates with the scene's background rendering pipeline and supports environment lighting for realistic scene illumination.

The sky system consists of several key components:
- **Sky**: Core sky renderer that manages material and mesh for background rendering
- **SkyBoxMaterial**: Material for cube texture-based skyboxes with HDR support
- **SkyProceduralMaterial**: Procedural atmospheric scattering material for realistic sky simulation
- **Background Integration**: Seamless integration with scene background rendering

## Quick Start

```ts
import { WebGLEngine, SkyBoxMaterial, SkyProceduralMaterial, BackgroundMode, PrimitiveMesh } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;
const background = scene.background;

// Set up skybox with cube texture
const skyboxMaterial = new SkyBoxMaterial(engine);
const cubeTexture = await engine.resourceManager.load({
  urls: [
    "textures/skybox/px.jpg", // positive X (right)
    "textures/skybox/nx.jpg", // negative X (left)
    "textures/skybox/py.jpg", // positive Y (top)
    "textures/skybox/ny.jpg", // negative Y (bottom)
    "textures/skybox/pz.jpg", // positive Z (front)
    "textures/skybox/nz.jpg"  // negative Z (back)
  ],
  type: AssetType.TextureCube
});

skyboxMaterial.texture = cubeTexture;
background.mode = BackgroundMode.Sky;
background.sky.material = skyboxMaterial;
background.sky.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);

engine.run();
```

## SkyBoxMaterial

The `SkyBoxMaterial` renders traditional skyboxes using cube textures, supporting both LDR and HDR formats:

```ts
import { SkyBoxMaterial, TextureCube } from "@galacean/engine";

// Create skybox material
const skyboxMaterial = new SkyBoxMaterial(engine);

// Load HDR cube texture
const hdrCubeTexture = await engine.resourceManager.load({
  url: "textures/environment.hdr",
  type: AssetType.TextureCube
});

// Configure skybox
skyboxMaterial.texture = hdrCubeTexture;
skyboxMaterial.rotation = 45; // Rotate skybox around Y-axis (degrees)
skyboxMaterial.textureDecodeRGBM = true; // Enable RGBM decoding for HDR

// Apply to scene
background.sky.material = skyboxMaterial;
background.sky.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
```

### HDR and RGBM Support

```ts
// For HDR textures with RGBM encoding
skyboxMaterial.textureDecodeRGBM = true;

// For standard LDR textures
skyboxMaterial.textureDecodeRGBM = false;

// Rotation for environment alignment
skyboxMaterial.rotation = 90; // Rotate to align with scene lighting
```

## SkyProceduralMaterial

The `SkyProceduralMaterial` generates realistic atmospheric scattering effects procedurally:

```ts
import { SkyProceduralMaterial, SunMode, Color } from "@galacean/engine";

// Create procedural sky material
const proceduralSky = new SkyProceduralMaterial(engine);

// Configure atmospheric parameters
proceduralSky.sunMode = SunMode.HighQuality;
proceduralSky.sunSize = 0.04;
proceduralSky.sunSizeConvergence = 5;
proceduralSky.atmosphereThickness = 1.0;
proceduralSky.exposure = 1.3;

// Set sky and ground tints
proceduralSky.skyTint = new Color(0.5, 0.7, 1.0, 1.0);    // Blue sky tint
proceduralSky.groundTint = new Color(0.4, 0.3, 0.2, 1.0); // Brown ground tint

// Apply to scene with sphere mesh
background.sky.material = proceduralSky;
background.sky.mesh = PrimitiveMesh.createSphere(engine, 1, 32);
```

### Sun Configuration

```ts
// High quality sun with realistic appearance
proceduralSky.sunMode = SunMode.HighQuality;
proceduralSky.sunSize = 0.04;           // Sun disk size
proceduralSky.sunSizeConvergence = 5;   // Sun edge sharpness

// Simple sun for better performance
proceduralSky.sunMode = SunMode.Simple;

// No sun disk
proceduralSky.sunMode = SunMode.None;
```

### Atmospheric Parameters

```ts
// Atmosphere density and scattering
proceduralSky.atmosphereThickness = 1.5;  // Thicker atmosphere
proceduralSky.exposure = 1.8;             // Brighter overall exposure

// Color tinting
proceduralSky.skyTint = new Color(0.3, 0.5, 0.8, 1.0);    // Cooler sky
proceduralSky.groundTint = new Color(0.6, 0.4, 0.2, 1.0); // Warmer ground

// Time of day simulation
function setTimeOfDay(hour: number): void {
  const t = (hour - 6) / 12; // Normalize 6AM-6PM to 0-1
  const sunHeight = Math.sin(t * Math.PI) * 0.5 + 0.5;
  
  proceduralSky.exposure = 0.8 + sunHeight * 1.0;
  proceduralSky.atmosphereThickness = 1.0 + (1 - sunHeight) * 0.5;
}
```

## Sky Rendering

The `Sky` class manages the actual rendering of sky materials:

```ts
import { Sky } from "@galacean/engine";

// Access sky through scene background
const sky = scene.background.sky;

// Set material and mesh
sky.material = skyboxMaterial;  // or proceduralSky
sky.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);

// Sky renders automatically when background mode is Sky
background.mode = BackgroundMode.Sky;
```

### Custom Sky Materials

```ts
// Create custom sky shader
const customSkyShader = Shader.create("CustomSky", vertexSource, fragmentSource);
const customSkyMaterial = new Material(engine, customSkyShader);

// Configure render state for sky rendering
customSkyMaterial.renderState.rasterState.cullMode = CullMode.Off;
customSkyMaterial.renderState.depthState.compareFunction = CompareFunction.LessEqual;

// Apply custom material
sky.material = customSkyMaterial;
sky.mesh = PrimitiveMesh.createSphere(engine, 1, 16);
```

## Environment Lighting

Sky materials can contribute to scene lighting through environment maps:

```ts
// Use skybox texture for environment lighting
const ambientLight = scene.ambientLight;
ambientLight.diffuseMode = DiffuseMode.Texture;
ambientLight.diffuseTexture = cubeTexture; // Same texture as skybox

// Configure environment lighting intensity
ambientLight.diffuseIntensity = 0.6;
ambientLight.specularTexture = cubeTexture;
ambientLight.specularIntensity = 1.0;

// For procedural sky, you might want to use a separate environment map
// or generate one from the procedural sky
```

## Performance Optimization

### LOD and Quality Settings

```ts
// Use lower resolution meshes for distant views
const lowDetailSphere = PrimitiveMesh.createSphere(engine, 1, 16); // 16 segments
const highDetailSphere = PrimitiveMesh.createSphere(engine, 1, 32); // 32 segments

// Switch based on camera distance or quality settings
function updateSkyQuality(qualityLevel: number): void {
  if (qualityLevel < 2) {
    sky.mesh = lowDetailSphere;
    if (proceduralSky) {
      proceduralSky.sunMode = SunMode.Simple;
    }
  } else {
    sky.mesh = highDetailSphere;
    if (proceduralSky) {
      proceduralSky.sunMode = SunMode.HighQuality;
    }
  }
}
```

### Texture Optimization

```ts
// Use appropriate texture sizes
// For mobile: 512x512 or 1024x1024
// For desktop: 2048x2048 or 4096x4096

// Enable texture compression when available
const compressedCubeTexture = await engine.resourceManager.load({
  url: "textures/skybox_compressed.ktx2",
  type: AssetType.TextureCube
});

// Use mipmaps for better quality at distance
cubeTexture.generateMipmaps();
```

## Dynamic Sky Effects

### Day-Night Cycle

```ts
class DayNightCycle {
  private _proceduralSky: SkyProceduralMaterial;
  private _ambientLight: AmbientLight;
  private _directionalLight: DirectLight;

  constructor(
    proceduralSky: SkyProceduralMaterial,
    ambientLight: AmbientLight,
    directionalLight: DirectLight
  ) {
    this.proceduralSky = proceduralSky;
    this.ambientLight = ambientLight;
    this.directionalLight = directionalLight;
  }

  updateTime(timeOfDay: number): void {
    // timeOfDay: 0 = midnight, 0.5 = noon, 1 = midnight
    const sunAngle = (timeOfDay - 0.25) * Math.PI * 2; // -90° at sunrise
    const sunHeight = Math.sin(sunAngle);
    const isDay = sunHeight > 0;

    // Update sky parameters
    if (isDay) {
      const dayIntensity = Math.max(0.1, sunHeight);
      this.proceduralSky.exposure = 1.0 + dayIntensity * 0.8;
      this.proceduralSky.atmosphereThickness = 1.0;
      this.proceduralSky.skyTint = new Color(0.5, 0.7, 1.0, 1.0);
    } else {
      // Night time
      this.proceduralSky.exposure = 0.3;
      this.proceduralSky.atmosphereThickness = 2.0;
      this.proceduralSky.skyTint = new Color(0.1, 0.1, 0.3, 1.0);
    }

    // Update lighting
    this.directionalLight.intensity = Math.max(0, sunHeight) * 3.0;
    this.ambientLight.diffuseIntensity = 0.2 + Math.max(0, sunHeight) * 0.8;

    // Update sun direction
    const sunDirection = new Vector3(
      Math.cos(sunAngle) * 0.3,
      sunHeight,
      Math.sin(sunAngle) * 0.3
    );
    this.directionalLight.entity.transform.setRotationByLookAt(
      Vector3.ZERO,
      sunDirection,
      Vector3.UP
    );
  }
}

// Usage
const dayNight = new DayNightCycle(proceduralSky, ambientLight, directionalLight);

// Animate time
let currentTime = 0;
engine.on("update", () => {
  currentTime += engine.time.deltaTime * 0.1; // 10x speed
  dayNight.updateTime(currentTime % 1);
});
```

### Weather Effects

```ts
class WeatherSystem {
  private _proceduralSky: SkyProceduralMaterial;
  private _fogIntensity: number = 0;

  constructor(proceduralSky: SkyProceduralMaterial) {
    this.proceduralSky = proceduralSky;
  }

  setClearWeather(): void {
    this.proceduralSky.atmosphereThickness = 1.0;
    this.proceduralSky.exposure = 1.3;
    this.proceduralSky.skyTint = new Color(0.5, 0.7, 1.0, 1.0);
    this.fogIntensity = 0;
  }

  setCloudyWeather(): void {
    this.proceduralSky.atmosphereThickness = 1.8;
    this.proceduralSky.exposure = 0.8;
    this.proceduralSky.skyTint = new Color(0.6, 0.6, 0.7, 1.0);
    this.fogIntensity = 0.1;
  }

  setStormyWeather(): void {
    this.proceduralSky.atmosphereThickness = 2.5;
    this.proceduralSky.exposure = 0.4;
    this.proceduralSky.skyTint = new Color(0.3, 0.3, 0.4, 1.0);
    this.fogIntensity = 0.3;
  }

  applyFog(scene: Scene): void {
    scene.fogMode = FogMode.Linear;
    scene.fogStart = 10;
    scene.fogEnd = 100;
    scene.fogColor = new Color(0.7, 0.7, 0.8, 1.0);
    scene.fogDensity = this.fogIntensity;
  }
}
```

## Integration with Post-Processing

```ts
// Sky-aware tone mapping
class SkyToneMapping extends PostProcessEffect {
  private _skyExposure: number = 1.0;

  get skyExposure(): number {
    return this.skyExposureValue;
  }

  set skyExposure(value: number) {
    this.skyExposureValue = value;
    this.material.shaderData.setFloat("u_skyExposure", value);
  }

  onRender(context: RenderContext): void {
    // Sync with procedural sky exposure
    if (context.scene.background.sky.material instanceof SkyProceduralMaterial) {
      this.skyExposure = context.scene.background.sky.material.exposure;
    }

    super.onRender(context);
  }
}

// Add to post-processing pipeline
const skyToneMapping = new SkyToneMapping(engine);
camera.postProcessManager.addEffect(skyToneMapping);
```

## API Reference

```apidoc
Sky:
  Properties:
    material: Material
      - Material used for sky rendering (SkyBoxMaterial or SkyProceduralMaterial).
    mesh: Mesh
      - Mesh geometry for sky rendering (typically cube or sphere).

  Methods:
    destroy(): void
      - Releases sky resources.

SkyBoxMaterial:
  Properties:
    texture: TextureCube
      - Cube texture for the skybox.
    rotation: number
      - Rotation angle around Y-axis in degrees.
    textureDecodeRGBM: boolean
      - Whether to decode RGBM-encoded HDR textures.

SkyProceduralMaterial:
  Properties:
    sunMode: SunMode
      - Sun rendering quality (None, Simple, HighQuality).
    sunSize: number
      - Size of the sun disk (default: 0.04).
    sunSizeConvergence: number
      - Sharpness of sun edges (default: 5).
    atmosphereThickness: number
      - Density of atmospheric scattering (default: 1.0).
    skyTint: Color
      - Color tint for sky regions.
    groundTint: Color
      - Color tint for ground regions.
    exposure: number
      - Overall brightness exposure (default: 1.3).

Background:
  Properties:
    mode: BackgroundMode
      - Background rendering mode (SolidColor, Sky, Texture).
    sky: Sky
      - Sky configuration when mode is BackgroundMode.Sky.
    solidColor: Color
      - Solid color when mode is BackgroundMode.SolidColor.
    texture: Texture2D
      - Background texture when mode is BackgroundMode.Texture.
```

## Best Practices

- Use cube textures for traditional skyboxes and sphere meshes for procedural skies
- Enable RGBM decoding for HDR cube textures to preserve lighting information
- Match sky exposure with scene lighting for consistent appearance
- Use lower resolution meshes on mobile devices for better performance
- Consider using compressed texture formats (KTX2, ASTC) for skybox textures
- Implement LOD systems for sky quality based on device capabilities
- Sync sky parameters with directional lighting for realistic day-night cycles
- Use procedural skies for dynamic weather and time-of-day effects
