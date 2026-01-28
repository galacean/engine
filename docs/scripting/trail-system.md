# Trail System

> **Note**: The TrailRenderer is currently marked as deprecated in Galacean Engine. This documentation covers the existing implementation for reference purposes. For new projects, consider using particle systems or custom solutions for trail effects.

Galacean's trail system provides dynamic trail rendering capabilities for creating motion-based visual effects like weapon trails, magic spells, or movement paths. The system generates geometry dynamically based on object movement and renders it with customizable materials and textures.

The trail system consists of:
- **TrailRenderer**: Core component that generates and renders trail geometry
- **TrailMaterial**: Specialized material for trail rendering with alpha blending
- **Dynamic Geometry**: Real-time vertex generation based on movement tracking

## Quick Start

```ts
import { WebGLEngine, TrailRenderer, TrailMaterial, Texture2D } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;

// Create entity with trail
const trailEntity = scene.createRootEntity("TrailObject");
const trailTexture = await engine.resourceManager.load<Texture2D>({
  url: "textures/trail.png",
  type: AssetType.Texture2D
});

// Configure trail properties
const trailProps = {
  stroke: 0.5,        // Trail width
  minSeg: 0.02,       // Minimum segment distance
  lifetime: 2000,     // Trail lifetime in milliseconds
  texture: trailTexture,
  material: new TrailMaterial(engine)
};

// Add trail renderer (deprecated API)
const trailRenderer = new TrailRenderer(trailEntity, trailProps);

// Move the entity to generate trail
let time = 0;
engine.on("update", () => {
  time += engine.time.deltaTime;
  trailEntity.transform.setPosition(
    Math.sin(time) * 3,
    Math.cos(time * 0.5) * 2,
    Math.cos(time) * 3
  );
});

engine.run();
```

## TrailRenderer Configuration

The `TrailRenderer` accepts configuration properties during construction:

```ts
interface TrailProps {
  stroke?: number;      // Trail width (default: 0.2)
  minSeg?: number;      // Minimum segment distance (default: 0.02)
  lifetime?: number;    // Trail lifetime in milliseconds (default: 1000)
  texture?: Texture2D;  // Trail texture
  material?: Material;  // Custom material (defaults to TrailMaterial)
}

// Example configurations
const narrowTrail = new TrailRenderer(entity, {
  stroke: 0.1,
  minSeg: 0.01,
  lifetime: 1500
});

const wideTrail = new TrailRenderer(entity, {
  stroke: 1.0,
  minSeg: 0.05,
  lifetime: 3000
});
```

### Trail Parameters

```ts
// Stroke width controls trail thickness
const thinTrail = { stroke: 0.1 };    // Thin trail
const thickTrail = { stroke: 2.0 };   // Thick trail

// Minimum segment distance affects trail smoothness
const smoothTrail = { minSeg: 0.01 }; // More segments, smoother
const roughTrail = { minSeg: 0.1 };   // Fewer segments, more angular

// Lifetime controls how long trail segments persist
const shortTrail = { lifetime: 500 };  // 0.5 seconds
const longTrail = { lifetime: 5000 };  // 5 seconds
```

## TrailMaterial

The `TrailMaterial` provides specialized rendering for trail effects:

```ts
import { TrailMaterial, BlendFactor } from "@galacean/engine";

// Create trail material
const trailMaterial = new TrailMaterial(engine);

// Material automatically configures:
// - Alpha blending enabled
// - Additive blending (SourceAlpha + One)
// - Depth writing disabled
// - Custom trail shader

// Set trail texture
trailMaterial.shaderData.setTexture("u_texture", trailTexture);

// Use with trail renderer
const trailRenderer = new TrailRenderer(entity, {
  material: trailMaterial,
  texture: trailTexture
});
```

### Custom Trail Materials

```ts
// Create custom trail shader
const customTrailShader = Shader.create(
  "CustomTrail",
  customVertexShader,
  customFragmentShader
);

// Create material with custom shader
const customTrailMaterial = new Material(engine, customTrailShader);

// Configure blending for trails
const blendState = customTrailMaterial.renderState.blendState.targetBlendState;
blendState.enabled = true;
blendState.sourceColorBlendFactor = BlendFactor.SourceAlpha;
blendState.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;

// Disable depth writing for proper transparency
customTrailMaterial.renderState.depthState.writeEnabled = false;
```

## Trail Geometry Generation

The trail system generates geometry dynamically based on entity movement:

```ts
// Trail geometry is generated automatically based on:
// 1. Entity world position changes
// 2. Minimum segment distance threshold
// 3. Camera orientation for billboard alignment
// 4. Trail width (stroke) parameter

// The system creates a triangle strip mesh with:
// - Position vertices following the trail path
// - UV coordinates for texture mapping
// - Billboard orientation facing the camera
```

### Movement Tracking

```ts
// Trail points are added when:
// 1. Entity moves more than minSeg distance
// 2. Maximum point limit not reached
// 3. Update is called each frame

// Example movement patterns for different trail effects:

// Circular motion
function createCircularTrail(entity: Entity, radius: number, speed: number): void {
  let angle = 0;
  engine.on("update", () => {
    angle += speed * engine.time.deltaTime;
    entity.transform.setPosition(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius
    );
  });
}

// Sine wave motion
function createWaveTrail(entity: Entity, amplitude: number, frequency: number): void {
  let time = 0;
  engine.on("update", () => {
    time += engine.time.deltaTime;
    entity.transform.setPosition(
      time * 2,
      Math.sin(time * frequency) * amplitude,
      0
    );
  });
}

// Random motion
function createRandomTrail(entity: Entity, speed: number): void {
  let direction = new Vector3(1, 0, 0);
  let changeTimer = 0;
  
  engine.on("update", () => {
    changeTimer += engine.time.deltaTime;
    
    // Change direction every 2 seconds
    if (changeTimer > 2) {
      direction.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      );
      direction.normalize();
      changeTimer = 0;
    }
    
    const movement = Vector3.scale(direction, speed * engine.time.deltaTime, new Vector3());
    entity.transform.translate(movement);
  });
}
```

## Performance Considerations

### Trail Optimization

```ts
// Optimize trail performance:

// 1. Limit maximum points based on target framerate
const maxPoints = Math.floor((lifetime / 1000) * targetFrameRate);

// 2. Use appropriate minimum segment distance
const minSeg = 0.02; // Balance between smoothness and performance

// 3. Shorter lifetimes for better performance
const shortLifetime = 1000; // 1 second trails

// 4. Reduce trail width for distant objects
function adaptiveTrailWidth(distance: number): number {
  return Math.max(0.1, 1.0 - distance * 0.1);
}
```

### Memory Management

```ts
// Trail renderer manages its own vertex buffers
// Memory usage scales with:
// - Maximum point count
// - Vertex stride (position + UV = 20 bytes per vertex)
// - Double buffering for triangle strip

// Estimated memory per trail:
// maxPoints * 2 vertices * 20 bytes = memory usage
// Example: 100 points * 2 * 20 = 4KB per trail
```

## Alternative Implementations

Since TrailRenderer is deprecated, consider these alternatives:

### Particle-Based Trails

```ts
// Use particle system for trail effects
const particleEntity = scene.createRootEntity("ParticleTrail");
const particleRenderer = particleEntity.addComponent(ParticleRenderer);

// Configure particle system for trail-like behavior
const generator = particleRenderer.generator;
generator.emission.rateOverTime = 50;
generator.main.startLifetime = 2.0;
generator.main.startSpeed = 0;
generator.main.startSize = 0.1;

// Add velocity over lifetime for trail effect
const velocityModule = generator.velocityOverLifetime;
velocityModule.enabled = true;
velocityModule.space = ParticleSimulationSpace.World;
```

### Custom Trail Implementation

```ts
// Create custom trail system using BufferMesh
class CustomTrailRenderer extends MeshRenderer {
  private _points: Vector3[] = [];
  private _lifetimes: number[] = [];
  private _mesh: BufferMesh;
  
  constructor(entity: Entity, maxPoints: number = 100) {
    super(entity);
    this.initMesh(maxPoints);
  }

  addPoint(position: Vector3, lifetime: number): void {
    this.points.push(position.clone());
    this.lifetimes.push(lifetime);

    // Remove old points
    while (this.points.length > this.maxPoints) {
      this.points.shift();
      this.lifetimes.shift();
    }

    this.updateMesh();
  }

  private initMesh(maxPoints: number): void {
    this.meshBuffer = new BufferMesh(this.engine);
    // Initialize vertex buffers and elements
    this.mesh = this.meshBuffer;
  }
  
  private _updateMesh(): void {
    // Update vertex data based on current points
    // Generate triangle strip geometry
    // Upload to GPU buffers
  }
}
```

## API Reference

```apidoc
TrailRenderer (Deprecated):
  Constructor:
    constructor(entity: Entity, props: TrailProps)
      - Creates a trail renderer with specified properties.

  Properties:
    entity: Entity
      - The entity this trail renderer is attached to.
    mesh: BufferMesh
      - The dynamically generated trail mesh.

  Methods:
    setTexture(texture: Texture2D): void
      - Sets the trail texture.
    update(deltaTime: number): void
      - Updates trail geometry based on entity movement.

TrailProps:
  Properties:
    stroke?: number
      - Trail width (default: 0.2).
    minSeg?: number
      - Minimum distance between trail segments (default: 0.02).
    lifetime?: number
      - Trail segment lifetime in milliseconds (default: 1000).
    texture?: Texture2D
      - Texture applied to the trail.
    material?: Material
      - Custom material for trail rendering.

TrailMaterial:
  Constructor:
    constructor(engine: Engine)
      - Creates a trail material with appropriate blend settings.

  Features:
    - Alpha blending enabled
    - Additive blending (SourceAlpha + One)
    - Depth writing disabled
    - Custom trail shader with texture support
```

## Shader Implementation

The trail system uses custom vertex and fragment shaders:

### Vertex Shader (trail.vs.glsl)

```glsl
attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;

varying vec2 v_uv;

uniform mat4 camera_ProjMat;
uniform mat4 camera_ViewMat;

void main() {
  gl_Position = camera_ProjMat * camera_ViewMat * vec4(POSITION, 1.0);
  v_uv = TEXCOORD_0;
}
```

### Fragment Shader (trail.fs.glsl)

```glsl
varying vec2 v_uv;
uniform sampler2D u_texture;

void main(void) {
  gl_FragColor = texture2D(u_texture, v_uv);
}
```

### Custom Shader Extensions

```ts
// Enhanced trail shader with fade-out effect
const enhancedTrailVertexShader = `
attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;
attribute float a_Alpha; // Per-vertex alpha for fade

varying vec2 v_uv;
varying float v_alpha;

uniform mat4 camera_ProjMat;
uniform mat4 camera_ViewMat;

void main() {
  gl_Position = camera_ProjMat * camera_ViewMat * vec4(POSITION, 1.0);
  v_uv = TEXCOORD_0;
  v_alpha = a_Alpha;
}
`;

const enhancedTrailFragmentShader = `
varying vec2 v_uv;
varying float v_alpha;

uniform sampler2D u_texture;
uniform vec3 u_color;

void main(void) {
  vec4 texColor = texture2D(u_texture, v_uv);
  gl_FragColor = vec4(texColor.rgb * u_color, texColor.a * v_alpha);
}
`;
```

## Migration Guide

For projects using the deprecated TrailRenderer, consider these migration strategies:

### 1. Particle System Migration

```ts
// Old TrailRenderer approach
const trailRenderer = new TrailRenderer(entity, {
  stroke: 0.5,
  lifetime: 2000,
  texture: trailTexture
});

// New particle system approach
const particleEntity = entity.createChild("TrailParticles");
const particleRenderer = particleEntity.addComponent(ParticleRenderer);
const generator = particleRenderer.generator;

// Configure for trail-like behavior
generator.emission.rateOverTime = 30;
generator.main.startLifetime = 2.0;
generator.main.startSpeed = 0;
generator.main.startSize = 0.5;
generator.main.simulationSpace = ParticleSimulationSpace.World;

// Add texture
const particleMaterial = new ParticleMaterial(engine);
particleMaterial.baseTexture = trailTexture;
particleRenderer.setMaterial(particleMaterial);
```

### 2. Custom Mesh Solution

```ts
// Create reusable trail system
class ModernTrailSystem {
  private _trails: Map<Entity, TrailData> = new Map();

  createTrail(entity: Entity, config: TrailConfig): TrailInstance {
    const trailData = new TrailData(config);
    this.trails.set(entity, trailData);
    return new TrailInstance(entity, trailData);
  }

  update(deltaTime: number): void {
    for (const [entity, trailData] of this.trails) {
      this.updateTrail(entity, trailData, deltaTime);
    }
  }

  private _updateTrail(entity: Entity, trailData: TrailData, deltaTime: number): void {
    // Update trail geometry based on entity position
    // Manage point lifetimes
    // Update mesh buffers
  }
}

// Usage
const trailSystem = new ModernTrailSystem();
const trail = trailSystem.createTrail(entity, {
  width: 0.5,
  lifetime: 2.0,
  texture: trailTexture
});
```

## Best Practices

- **Performance**: Use appropriate `minSeg` values to balance smoothness and performance
- **Lifetime**: Keep trail lifetimes reasonable to avoid excessive memory usage
- **Textures**: Use power-of-two textures with alpha channels for best results
- **Blending**: Ensure proper blend state configuration for transparent trails
- **Migration**: Consider particle systems or custom solutions for new projects
- **Testing**: Test trail performance with multiple simultaneous trails
- **Memory**: Monitor memory usage with long-lived or numerous trails
- **Alternatives**: Evaluate modern approaches like GPU-based trail generation for complex scenarios
