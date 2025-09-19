# Particle System - LLM Documentation

## Overview

The Galacean Particle System is a sophisticated modular particle effect engine designed for high-performance 3D particle rendering. It implements a comprehensive lifecycle management system with circular buffer architecture, supporting complex particle behaviors through a modular design pattern.

## Core Architecture

### ParticleGenerator - Core Engine
```typescript
// Central particle lifecycle management through circular buffer
class ParticleGenerator {
  _currentParticleCount = 0;
  _firstNewElement = 0;      // Start of new particles
  _firstActiveElement = 0;   // Start of active particles
  _firstFreeElement = 0;     // Start of free slots
  _firstRetiredElement = 0;  // Start of retired particles
  
  // Core lifecycle control
  get isAlive(): boolean;
  play(withChildren?: boolean): void;
  stop(withChildren?: boolean, stopMode?: ParticleStopMode): void;
  emit(count: number): void;
}
```

**Key Features:**
- Circular buffer particle management for optimal memory usage
- Deterministic particle lifecycle with four distinct states
- Hierarchical control for nested particle systems
- Built-in emission control and timing management

### ParticleRenderer - Visual Output
```typescript
// Particle rendering with multiple display modes
class ParticleRenderer extends Renderer {
  readonly generator: ParticleGenerator;
  renderMode: ParticleRenderMode;  // Billboard, StretchBillboard, Mesh, etc.
  velocityScale = 0;               // Velocity-based scaling
  lengthScale = 2;                 // Length scaling for stretch modes
  pivot = new Vector3();           // Rotation pivot point
}
```

**Render Modes:**
- `Billboard`: Always faces camera
- `StretchBillboard`: Stretches based on velocity
- `Mesh`: Uses custom geometry
- `HorizontalBillboard`: Rotates around Y-axis only
- `VerticalBillboard`: Rotates around X-axis only

## Module System

### MainModule - Core Configuration
```typescript
// Primary particle system parameters
class MainModule {
  // Timing and control
  duration = 5.0;                    // System duration in seconds
  isLoop = true;                     // Loop playback
  startDelay: ParticleCompositeCurve; // Initial delay
  simulationSpeed = 1.0;             // Playback speed multiplier
  
  // Initial particle properties
  startRotation3D = false;           // Enable 3D rotation
  startRotationX/Y/Z: ParticleCompositeCurve;
  startColor: ParticleCompositeGradient;
  startLifetime: ParticleCompositeCurve;
  startSpeed: ParticleCompositeCurve;
  startSize3D = false;               // Enable per-axis sizing
  startSizeX/Y/Z: ParticleCompositeCurve;
  
  // Physics and space
  gravityModifier: ParticleCompositeCurve;
  simulationSpace: ParticleSimulationSpace; // Local/World
  scalingMode: ParticleScaleMode;    // Hierarchy/Local/World
}
```

### EmissionModule - Particle Spawning
```typescript
// Controls when and how particles are created
class EmissionModule {
  // Continuous emission
  rateOverTime: ParticleCompositeCurve = 10;      // Particles per second
  rateOverDistance: ParticleCompositeCurve = 0;   // Particles per unit moved
  
  // Burst emission
  bursts: Burst[] = [];              // Timed burst events
  
  // Core emission logic
  addBurst(burst: Burst): void;
  _emit(lastPlayTime: number, playTime: number): void;
}
```

**Burst Configuration:**
```typescript
interface Burst {
  time: number;           // When to emit (in seconds)
  count: number;          // Number of particles
  cycles: number;         // Repeat count (-1 = infinite)
  interval: number;       // Time between cycles
  probability: number;    // Chance to emit (0-1)
}
```

## Animation System

### ParticleCompositeCurve - Value Animation
```typescript
// Core animation curve supporting multiple modes
class ParticleCompositeCurve {
  mode: ParticleCurveMode;    // Constant, TwoConstants, Curve, TwoCurves
  
  // Constant values
  constantMin: number;
  constantMax: number;
  
  // Curve animation
  curveMin: ParticleCurve;
  curveMax: ParticleCurve;
  
  // Evaluation
  evaluate(time: number, lerpFactor: number): number;
}
```

**Curve Modes:**
- `Constant`: Single fixed value
- `TwoConstants`: Random between min/max
- `Curve`: Animated curve over time
- `TwoCurves`: Random between two curves

### Over-Lifetime Modules

#### VelocityOverLifetimeModule
```typescript
// Particle velocity animation over lifetime
class VelocityOverLifetimeModule {
  velocityX/Y/Z: ParticleCompositeCurve;  // Per-axis velocity
  space: ParticleSimulationSpace;         // Local/World coordinates
  
  // Shader integration for GPU computation
  _updateShaderData(shaderData: ShaderData): void;
}
```

#### SizeOverLifetimeModule
```typescript
// Particle size animation over lifetime
class SizeOverLifetimeModule {
  separateAxes = false;           // Enable per-axis control
  sizeX/Y/Z: ParticleCompositeCurve;
  
  // Unified size control (uses sizeX)
  get size(): ParticleCompositeCurve;
  set size(value: ParticleCompositeCurve);
}
```

#### ColorOverLifetimeModule
```typescript
// Color and alpha animation over lifetime
class ColorOverLifetimeModule {
  color: ParticleCompositeGradient;  // Color gradient with alpha
  
  // Supports gradient modes: Gradient, TwoGradients
  // Automatically handles color/alpha key interpolation
}
```

#### RotationOverLifetimeModule
```typescript
// Particle rotation animation over lifetime
class RotationOverLifetimeModule {
  separateAxes = false;           // Enable 3D rotation
  rotationX/Y/Z: ParticleCompositeCurve;  // Per-axis rotation in degrees
  
  // Automatic degree-to-radian conversion for shaders
  // Supports both constant and curve-based rotation
}
```

### TextureSheetAnimationModule
```typescript
// Sprite atlas animation for texture-based effects
class TextureSheetAnimationModule {
  frameOverTime: ParticleCompositeCurve;  // Frame animation curve
  type: TextureSheetAnimationType;        // WholeSheet, SingleRow
  cycleCount = 1;                         // Animation cycles
  tiling: Vector2;                        // Atlas dimensions (columns, rows)
  
  // Animation Types:
  // WholeSheet: Animate across entire atlas
  // SingleRow: Animate single row only
}
```

## Shader Integration

### GPU Computation
The particle system leverages shader macros and properties for high-performance GPU computation:

```typescript
// Shader macro management
_enableMacro(shaderData: ShaderData, oldMacro: ShaderMacro, newMacro: ShaderMacro): ShaderMacro;

// Common shader properties
static readonly _positionScale = ShaderProperty.getByName("renderer_PositionScale");
static readonly _worldPosition = ShaderProperty.getByName("renderer_WorldPosition");
static readonly _gravity = ShaderProperty.getByName("renderer_Gravity");

// Module-specific properties
static readonly _frameMaxCurveProperty = ShaderProperty.getByName("renderer_TSAFrameMaxCurve");
static readonly _maxCurveXProperty = ShaderProperty.getByName("renderer_SOLMaxCurveX");
```

### Performance Optimization
- **Instance Rendering**: Efficient GPU instancing for thousands of particles
- **Culling**: Automatic bounds calculation for frustum culling
- **Memory Management**: Circular buffer prevents allocation/deallocation overhead
- **Shader Variants**: Dynamic macro compilation for optimal performance

## Random System

### Deterministic Randomization
```typescript
// Seeded random generators for reproducible effects
class MainModule {
  readonly _startSpeedRand = new Rand(0, ParticleRandomSubSeeds.StartSpeed);
  readonly _startLifeTimeRand = new Rand(0, ParticleRandomSubSeeds.StartLifetime);
  readonly _startColorRand = new Rand(0, ParticleRandomSubSeeds.StartColor);
  
  _resetRandomSeed(randomSeed: number): void;
}
```

**Random Sub-Seeds:**
- `StartSpeed`, `StartLifetime`, `StartColor`, `StartSize`, `StartRotation`
- `TextureSheetAnimation`, `ColorOverLifetime`, `RotationOverLifetime`
- `VelocityOverLifetime`, `GravityModifier`

## Simulation Spaces

### Coordinate System Control
```typescript
enum ParticleSimulationSpace {
  Local = 0,    // Particles move relative to emitter
  World = 1     // Particles move in world coordinates
}

enum ParticleScaleMode {
  Hierarchy = 0,  // Use full transform hierarchy scale
  Local = 1,      // Use local transform scale only
  World = 2       // Position scales with world, size stays constant
}
```

**Space Implications:**
- **Local**: Particles follow emitter transform, good for attached effects
- **World**: Particles independent of emitter, good for explosions/debris

## Usage Patterns

### Basic Particle System
```typescript
// Create particle system entity
const particleEntity = rootEntity.createChild("ParticleSystem");
const particleRenderer = particleEntity.addComponent(ParticleRenderer);
const generator = particleRenderer.generator;

// Configure main properties
const main = generator.main;
main.startLifetime.constant = 2.0;
main.startSpeed.constant = 5.0;
main.startColor.constant = new Color(1, 0.5, 0, 1);

// Setup emission
const emission = generator.emission;
emission.rateOverTime.constant = 50;

// Add size animation
const sizeOverLifetime = generator.sizeOverLifetime;
sizeOverLifetime.enabled = true;
sizeOverLifetime.size = new ParticleCompositeCurve(
  new ParticleCurve(
    new CurveKey(0, 0.1),  // Start small
    new CurveKey(1, 1.0)   // Grow over lifetime
  )
);

// Start playback
generator.play();
```

### Advanced Effect with Multiple Modules
```typescript
// Fire effect with complex animation
const fireGenerator = particleRenderer.generator;

// Main configuration
fireGenerator.main.startLifetime = new ParticleCompositeCurve(1.5, 3.0); // Random lifetime
fireGenerator.main.startSpeed = new ParticleCompositeCurve(2, 8);
fireGenerator.main.startSize = new ParticleCompositeCurve(0.5, 2.0);

// Upward velocity with random spread
const velocity = fireGenerator.velocityOverLifetime;
velocity.enabled = true;
velocity.velocityY = new ParticleCompositeCurve(3, 6);

// Size growth then shrink
const size = fireGenerator.sizeOverLifetime;
size.enabled = true;
size.size = new ParticleCompositeCurve(
  new ParticleCurve(
    new CurveKey(0, 0.2),
    new CurveKey(0.3, 1.0),
    new CurveKey(1, 0.1)
  )
);

// Color from orange to red to black
const color = fireGenerator.colorOverLifetime;
color.enabled = true;
color.color = new ParticleCompositeGradient(
  new ParticleGradient(
    [
      new GradientColorKey(0, new Color(1, 0.8, 0.2)),    // Orange
      new GradientColorKey(0.5, new Color(1, 0.2, 0)),    // Red
      new GradientColorKey(1, new Color(0.2, 0, 0))       // Dark red
    ],
    [
      new GradientAlphaKey(0, 0.8),
      new GradientAlphaKey(1, 0)    // Fade out
    ]
  )
);

// Rotation animation
const rotation = fireGenerator.rotationOverLifetime;
rotation.enabled = true;
rotation.rotationZ = new ParticleCompositeCurve(-90, 90); // Random spin
```

### Texture Atlas Animation
```typescript
// Animated sprite effect
const spriteGenerator = particleRenderer.generator;

// Setup texture sheet animation
const textureAnim = spriteGenerator.textureSheetAnimation;
textureAnim.enabled = true;
textureAnim.tiling = new Vector2(4, 4);  // 4x4 atlas
textureAnim.frameOverTime = new ParticleCompositeCurve(
  new ParticleCurve(
    new CurveKey(0, 0),    // Start at first frame
    new CurveKey(1, 15)    // End at last frame (16 frames total)
  )
);
textureAnim.cycleCount = 1;  // Play once
```

## Best Practices

### Performance Optimization
1. **Use GPU-optimized modules**: Prefer curve-based animation over per-frame CPU updates
2. **Limit particle count**: Balance visual quality with performance requirements
3. **Choose appropriate simulation space**: Local for attached effects, World for independent particles
4. **Optimize texture usage**: Use texture atlases for sprite-based effects
5. **Profile regularly**: Monitor particle count and frame rate impact

### Visual Quality
1. **Layer multiple systems**: Combine different particle systems for complex effects
2. **Use proper scaling modes**: Match scaling behavior to effect requirements
3. **Animate multiple properties**: Combine size, color, velocity, and rotation for rich effects
4. **Consider render order**: Use appropriate render modes for desired visual appearance
5. **Test across platforms**: Verify performance on target devices

### Code Organization
1. **Create reusable presets**: Build effect libraries for common particle patterns
2. **Use descriptive names**: Clear naming for particle system entities and configurations
3. **Document complex effects**: Comment unusual parameter combinations and their visual purpose
4. **Version control settings**: Track particle system configurations in project files
5. **Profile memory usage**: Monitor particle buffer sizes and cleanup procedures

This particle system provides a comprehensive foundation for creating sophisticated visual effects with optimal performance characteristics suitable for real-time 3D applications.
