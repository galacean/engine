# Environment Probe System

Galacean's environment probe system provides dynamic environment mapping capabilities for realistic reflections, refractions, and image-based lighting (IBL). The system captures the surrounding environment from specific positions and generates cube textures that can be reused by ambient lighting, skyboxes, or custom materials.

The environment probe system includes:
- **Probe**: Base class that configures render targets, resolution, and layer masks.
- **CubeProbe**: Captures a 360° cube texture from a world position.
- **IBL Integration**: Hooks for updating the scene's ambient light and sky.
- **Dynamic Updates**: Scripts can control when probes capture to balance quality and cost.

## Quick Start

```ts
import {
  BackgroundMode,
  CubeProbe,
  Layer,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  SkyBoxMaterial,
  TextureCube,
  WebGLEngine
} from '@galacean/engine';

const engine = await WebGLEngine.create({ canvas: 'canvas' });
const scene = engine.sceneManager.activeScene;

// Reflective test mesh
const reflectiveEntity = scene.createRootEntity('ReflectiveSphere');
const renderer = reflectiveEntity.addComponent(MeshRenderer);
renderer.mesh = PrimitiveMesh.createSphere(engine, 0.6);
const reflectiveMaterial = new PBRMaterial(engine);
reflectiveMaterial.metallic = 1.0;
reflectiveMaterial.roughness = 0.1;
renderer.setMaterial(reflectiveMaterial);

// Probe host entity
const probeEntity = scene.createRootEntity('EnvironmentProbe');
probeEntity.transform.setPosition(0, 1, 0);
const cubeProbe = probeEntity.addComponent(CubeProbe);
cubeProbe.width = 1024;
cubeProbe.height = 1024;
cubeProbe.probeLayer = Layer.Everything;

let lastCapture: TextureCube | null = null;
cubeProbe.onTextureChange = (cubeTexture) => {
  lastCapture = cubeTexture as TextureCube; // Cache for debugging or baking

  const ambientLight = scene.ambientLight;
  ambientLight.specularTexture = cubeTexture;
  ambientLight.specularIntensity = 1.0;

  if (scene.background.mode !== BackgroundMode.Sky) {
    scene.background.mode = BackgroundMode.Sky;
    scene.background.sky.material = new SkyBoxMaterial(engine);
  }
  const skyMaterial = scene.background.sky.material as SkyBoxMaterial | null;
  skyMaterial && (skyMaterial.texture = cubeTexture);
};

cubeProbe.enabled = true;
engine.run();
```

`CubeProbe.onTextureChange` fires once per render when the probe is enabled. Cache the latest `TextureCube` if you need it elsewhere (e.g., for baking or debugging).

## CubeProbe Configuration

```ts
import { CubeProbe, Layer, Vector3 } from '@galacean/engine';

const cubeProbe = probeEntity.addComponent(CubeProbe);

// Resolution (power-of-two sizes avoid mip artefacts)
cubeProbe.width = 2048;
cubeProbe.height = 2048;

// Capture masks (bitwise OR the layers you need)
cubeProbe.probeLayer = Layer.Layer0 | Layer.Layer1;

// Sample position is independent of the entity transform
cubeProbe.position = new Vector3(0, 2, 0);

// Hardware MSAA (WebGL2 only)
cubeProbe.antiAliasing = 4;

// Respond when the capture is ready
cubeProbe.onTextureChange = (cubeTexture) => {
  console.log('Environment captured', cubeTexture);
};
```

### Probe Positioning

```ts
// Absolute world position
cubeProbe.position = new Vector3(5, 3, -2);

// Match an entity transform snapshot
cubeProbe.position.copyFrom(probeEntity.transform.worldPosition);

// Spawn multiple probes
[
  { name: 'Center', pos: new Vector3(0, 1, 0) },
  { name: 'East', pos: new Vector3(10, 1, 0) },
  { name: 'West', pos: new Vector3(-10, 1, 0) }
].forEach(({ name, pos }) => {
  const entity = scene.createRootEntity(name);
  const probe = entity.addComponent(CubeProbe);
  probe.position = pos;
  probe.width = 1024;
  probe.height = 1024;
});
```

## Layer-Based Capture

Define application-specific layers and exclude masks you do not want in the reflection:

```ts
const LayerGameplay = Layer.Layer0;
const LayerUI = Layer.Layer4;
const LayerPostFX = Layer.Layer5;

cubeProbe.probeLayer = Layer.Everything & ~LayerUI & ~LayerPostFX;

const reflectiveObject = scene.createRootEntity('ReflectiveObject');
reflectiveObject.layer = LayerGameplay;

const uiElement = scene.createRootEntity('HudCanvas');
uiElement.layer = LayerUI;
```

UI- or post-process entities render normally, but the probe omits them because their bits are removed from the mask.

## IBL Integration

### Ambient Lighting

```ts
import { DiffuseMode } from '@galacean/engine';

cubeProbe.onTextureChange = (cubeTexture) => {
  const ambientLight = scene.ambientLight;

  ambientLight.specularTexture = cubeTexture;
  ambientLight.specularTextureDecodeRGBM = false;
  ambientLight.specularIntensity = 1.0;

  // Optionally drive diffuse lighting with spherical harmonics (see below).
  ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
};
```

The engine's PBR shaders automatically read `scene.ambientLight.specularTexture`, so every material that relies on IBL will pick up the reflection once it is assigned.

### Material Adjustments

Because reflections come from the scene ambient light, individual materials typically only need minor tweaks:

```ts
const reflectiveMaterial = renderer.getMaterial() as PBRMaterial;
reflectiveMaterial.specularIntensity = 0.8; // Per-material reflection intensity
reflectiveMaterial.metallic = 1.0;
reflectiveMaterial.roughness = 0.05;
```

If you require unique environment maps per object, clone or create a custom shader that samples your cached `TextureCube`.

## Dynamic Environment Updates

Capture frequency has a direct performance cost. This controller script re-enables the probe on a timer and turns it back off after a capture completes:

```ts
import { CubeProbe, Script, TextureCube } from '@galacean/engine';

class ProbeRefreshController extends Script {
  private probe!: CubeProbe;
  private interval = 1.0; // seconds
  private timer = 0;

  onAwake(): void {
    this.probe = this.entity.getComponent(CubeProbe)!;

    const previousHandler = this.probe.onTextureChange?.bind(this.probe);
    this.probe.onTextureChange = (texture: TextureCube) => {
      previousHandler?.(texture);
      this.probe.enabled = false; // freeze until the next scheduled capture
    };

    this.probe.enabled = true; // force initial capture
  }

  setFrequency(hz: number): void {
    this.interval = hz > 0 ? 1 / hz : Number.POSITIVE_INFINITY;
  }

  onUpdate(deltaTime: number): void {
    this.timer += deltaTime;
    if (this.timer >= this.interval) {
      this.timer = 0;
      if (!this.probe.enabled) {
        this.probe.enabled = true;
      }
    }
  }
}

// Usage
const controller = probeEntity.addComponent(ProbeRefreshController);
controller.setFrequency(0.5); // Capture twice per second
```

Attach the script to the same entity that owns the probe. The wrapper preserves any existing `onTextureChange` logic.

## Performance Optimization

### Resolution Management

```ts
function selectProbeResolution(distance: number): number {
  if (distance < 10) return 2048;
  if (distance < 50) return 1024;
  return 512;
}

const cameraPosition = camera.entity.transform.worldPosition;
const distance = Vector3.distance(cameraPosition, cubeProbe.position);
const value = selectProbeResolution(distance);
cubeProbe.width = cubeProbe.height = value;
```

### Update Strategies

Use dedicated lists so ultra-static probes only capture once:

```ts
class ProbeManager {
  private staticProbes: CubeProbe[] = [];
  private dynamicControllers: ProbeRefreshController[] = [];

  addStaticProbe(probe: CubeProbe): void {
    probe.onTextureChange = (texture) => {
      scene.ambientLight.specularTexture = texture;
      probe.enabled = false;
    };
    probe.enabled = true; // capture once
    this.staticProbes.push(probe);
  }

  addDynamicProbe(controller: ProbeRefreshController): void {
    this.dynamicControllers.push(controller);
  }

  onUpdate(deltaTime: number): void {
    this.dynamicControllers.forEach((controller) => controller.onUpdate(deltaTime));
  }
}
```

### Memory Management

```ts
import { CubeProbe, Entity } from '@galacean/engine';

const MAX_PROBE_MEMORY = 256 * 1024 * 1024; // 256 MB
let currentBudget = 0;

function estimateProbeMemory(width: number, height: number): number {
  return 6 * width * height * 4 * 1.33; // faces * pixels * RGBA * mip chain
}

function createProbeWithBudget(host: Entity, width: number, height: number): CubeProbe | null {
  const cost = estimateProbeMemory(width, height);
  if (currentBudget + cost > MAX_PROBE_MEMORY) {
    if (width <= 128) {
      console.warn('Probe budget exhausted.');
      return null;
    }
    return createProbeWithBudget(host, width >> 1, height >> 1);
  }

  currentBudget += cost;
  const probe = host.addComponent(CubeProbe);
  probe.width = width;
  probe.height = height;
  return probe;
}
```

## Spherical Harmonics Integration

Use spherical harmonics to derive diffuse light from a cube map. The following helper uses a deterministic Fibonacci sampling pattern:

```ts
import { Color, DiffuseMode, SphericalHarmonics3, TextureCube, Vector3 } from '@galacean/engine';

class SHGenerator {
  generateFromCubeTexture(cubeTexture: TextureCube, sampleCount = 64): SphericalHarmonics3 {
    const sh = new SphericalHarmonics3();
    const directions = this._generateDirections(sampleCount);
    const solidAngle = (4 * Math.PI) / sampleCount;

    directions.forEach((direction) => {
      const color = this._sampleCubeTexture(cubeTexture, direction);
      sh.addLight(direction, color, solidAngle);
    });

    return sh;
  }

  private _generateDirections(count: number): Vector3[] {
    const directions: Vector3[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      directions.push(new Vector3(x, y, z));
    }

    return directions;
  }

  private _sampleCubeTexture(_cubeTexture: TextureCube, _direction: Vector3): Color {
    // GPU read-back is engine specific. Replace this placeholder with platform utilities.
    return new Color(0.5, 0.5, 0.5, 1);
  }
}

cubeProbe.onTextureChange = (cubeTexture) => {
  const sh = new SHGenerator().generateFromCubeTexture(cubeTexture);
  scene.ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
  scene.ambientLight.diffuseSphericalHarmonics = sh;
};
```

## Multi-Probe Blending

Cache probe captures and choose the best texture per location. This example blends weights and applies the strongest match to the ambient light before each camera render:

```ts
import { Camera, CubeProbe, Script, TextureCube, Vector3 } from '@galacean/engine';

interface ProbeRecord {
  probe: CubeProbe;
  position: Vector3;
  radius: number;
  texture: TextureCube | null;
}

class ProbeBlendingSystem extends Script {
  private records: ProbeRecord[] = [];

  registerProbe(probe: CubeProbe, position: Vector3, radius: number): void {
    const record: ProbeRecord = { probe, position: position.clone(), radius, texture: null };

    const previousHandler = probe.onTextureChange?.bind(probe);
    probe.onTextureChange = (texture: TextureCube) => {
      record.texture = texture;
      previousHandler?.(texture);
    };

    this.records.push(record);
  }

  onBeginRender(camera: Camera): void {
    const strongest = this._getStrongest(camera.entity.transform.worldPosition);
    if (strongest && strongest.texture) {
      const ambient = this.scene.ambientLight;
      ambient.specularTexture = strongest.texture;
      ambient.specularIntensity = strongest.weight;
    }
  }

  private _getStrongest(worldPosition: Vector3):
    | { texture: TextureCube | null; weight: number }
    | null {
    let best: { texture: TextureCube | null; weight: number } | null = null;

    for (const record of this.records) {
      if (!record.texture) continue;
      const distance = Vector3.distance(worldPosition, record.position);
      if (distance >= record.radius) continue;

      const weight = 1 - distance / record.radius;
      if (!best || weight > best.weight) {
        best = { texture: record.texture, weight };
      }
    }

    return best;
  }
}
```

For finer blending you can mix the textures into a single cube map offline, or feed weights into a custom shader that samples multiple environment maps.

## API Reference

```apidoc
Probe (abstract)
  Properties:
    probeLayer: Layer - Bit mask that determines which entities are rendered.
    width: number - Render target width (default 1024).
    height: number - Render target height (default 1024).
    antiAliasing: number - MSAA level when supported (default 1).
    enabled: boolean - Component enable flag inherited from Script.

  Events:
    onTextureChange(texture: Texture): void
      Called after a capture. Assign one handler and forward to your own callbacks as needed.

  Methods:
    onBeginRender(camera: Camera): void
      Internal override; executed automatically when the probe is enabled.

CubeProbe extends Probe
  Properties:
    position: Vector3 - World-space capture origin (defaults to [0, 0, 0]).

  Behavior:
    - Captures the six faces of a cube map with a 90° field of view.
    - Uses RenderTarget auto-mipmap generation so reflections respect roughness.
    - Requires you to cache the latest TextureCube via onTextureChange; there is no direct `texture` getter.

TextureCube
  Properties:
    width/height: number - Face size in pixels.
    mipmapCount: number - Includes generated mip levels.

  Methods:
    generateMipmaps(): void
      Explicitly rebuilds the mip chain when you update pixel data manually.
```

## Best Practices

- **Resolution**: Start with 1024×1024 captures; push to 2048 for hero assets and drop to 512 or 256 for distant zones.
- **Capture Budget**: Disable probes once a static environment is captured; re-enable only when something changes.
- **Layer Hygiene**: Reserve dedicated Layer bits (e.g., Layer4 for UI) so probes can filter non-physical elements cleanly.
- **Memory Watch**: Track combined face memory (6 × width × height × 4 bytes × mip multiplier) before spawning probes.
- **Placement**: Position probes at locations representative of the surrounding geometry, not inside occluded spaces.
- **Spherical Harmonics**: Precompute SH coefficients when you need high-quality diffuse IBL; reuse the cached result across probes where possible.
- **Blending**: For large scenes, store probe volumes and select the best match per camera or per region before rendering.
- **Validation**: Toggle the probe's cached `TextureCube` onto the skybox or a debug material to verify what was captured.
