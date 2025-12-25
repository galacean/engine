# PostProcess

Galacean's PostProcess system provides powerful image post-processing capabilities including global and local post-processing modes. The system uses a component-based design supporting multiple built-in effects and custom effect extensions for enhanced visual rendering.

## Overview

The PostProcess system encompasses comprehensive image enhancement capabilities:

- **Component Architecture**: Modular effect system with parameter management and blending
- **Processing Modes**: Global scene-wide effects and local region-based processing
- **Built-in Effects**: Bloom, tone mapping, and extensible effect library
- **Custom Effects**: Framework for developing custom post-processing shaders
- **Performance Optimization**: Effect validity checking and conditional rendering
- **Blend Distance**: Smooth transitions between local post-processing regions

The system integrates seamlessly with the rendering pipeline to provide high-quality visual enhancements.

## Quick Start

### Global Post-Processing Setup

```ts
import { BloomEffect, TonemappingEffect, TonemappingMode } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;

// Create entity with PostProcess component
const postProcessEntity = scene.createRootEntity("PostProcess");
const postProcess = postProcessEntity.addComponent(PostProcess);
postProcess.isGlobal = true;

// Add bloom effect
const bloom = postProcess.addEffect(BloomEffect);
bloom.intensity.value = 1.0;
bloom.threshold.value = 0.8;
bloom.scatter.value = 0.7;
bloom.tint.value.set(1, 1, 1, 1);

// Add tone mapping
const tonemapping = postProcess.addEffect(TonemappingEffect);
tonemapping.mode.value = TonemappingMode.ACES;

engine.run();
```

### Local Post-Processing Regions

```ts
import { BoxColliderShape, PostProcess, StaticCollider, Layer } from "@galacean/engine";

// Create local post-processing entity
const localPostEntity = scene.createRootEntity("LocalPostProcess");
const localPost = localPostEntity.addComponent(PostProcess);

// Configure local mode
localPost.isGlobal = false;
localPost.blendDistance = 5.0; // Blend distance
localPost.layer = Layer.Layer1; // Layer assignment

// Add collider to define affected region
const collider = localPostEntity.addComponent(StaticCollider);
const boxShape = new BoxColliderShape();
boxShape.size.set(10, 10, 10);
collider.addShape(boxShape);

// Add effects to local region
const localBloom = localPost.addEffect(BloomEffect);
localBloom.intensity.value = 2.0;

// Position the local post-processing region
localPostEntity.transform.setPosition(0, 0, 0);
```

### Camera Post-Processing Masks

```ts
// Configure camera to process only specific layers
camera.postProcessMask = Layer.Layer0 | Layer.Layer1;
```

## PostProcess Component

### Core Properties and Methods

```ts
class PostProcess extends Component {
  // Layer identification
  layer: Layer = Layer.Layer0;
  
  // Global/local mode toggle
  get isGlobal(): boolean;
  set isGlobal(value: boolean);
  
  // Local post-processing blend distance
  blendDistance: number = 0;
  
  // Priority (affects execution order)
  priority: number = 0;

  // Effect management
  addEffect<T extends typeof PostProcessEffect>(type: T): InstanceType<T>;
  removeEffect<T extends typeof PostProcessEffect>(type: T): InstanceType<T>;
  getEffect<T extends typeof PostProcessEffect>(type: T): InstanceType<T>;
  clearEffects(): void;
}
```

### Effect Management Examples

```ts
// Dynamic effect management
const bloom = postProcess.addEffect(BloomEffect);
bloom.enabled = true;

// Runtime parameter adjustment
bloom.intensity.value = 1.5;
bloom.threshold.value = 0.9;

// Conditional effect removal
if (lowQualityMode) {
  postProcess.removeEffect(BloomEffect);
}

// Get existing effect for adjustment
const existingBloom = postProcess.getEffect(BloomEffect);
if (existingBloom) {
  existingBloom.scatter.value *= 0.5;
}

// Clear all effects
postProcess.clearEffects();
```

## PostProcessEffect Base Class

### Core Design and Parameters

```ts
class PostProcessEffect {
  // Enable state
  get enabled(): boolean;
  set enabled(value: boolean);
  
  // Validity check (can be overridden)
  isValid(): boolean;
  
  // Effect blending (internal use)
  _lerp(to: PostProcessEffect, factor: number): void;
}

// Parameter system
class PostProcessEffectBoolParameter {
  constructor(defaultValue: boolean);
  value: boolean;
}

class PostProcessEffectFloatParameter {
  constructor(defaultValue: number, min?: number, max?: number);
  value: number;
  min: number;
  max: number;
}

class PostProcessEffectEnumParameter {
  constructor(enumType: any, defaultValue: any);
  value: any;
}

class PostProcessEffectColorParameter {
  constructor(defaultValue: Color);
  value: Color;
}

class PostProcessEffectTextureParameter {
  constructor(defaultValue: Texture2D);
  value: Texture2D;
}
```

## Built-in Effects

### BloomEffect

```ts
class BloomEffect extends PostProcessEffect {
  // High quality filtering
  highQualityFiltering = new PostProcessEffectBoolParameter(false);
  
  // Downscale mode
  downScale = new PostProcessEffectEnumParameter(BloomDownScaleMode, BloomDownScaleMode.Half);
  
  // Dirt texture overlay
  dirtTexture = new PostProcessEffectTextureParameter(null);
  
  // Brightness threshold
  threshold = new PostProcessEffectFloatParameter(0.8, 0);
  
  // Scatter radius
  scatter = new PostProcessEffectFloatParameter(0.7, 0, 1);
  
  // Effect intensity
  intensity = new PostProcessEffectFloatParameter(0, 0);
  
  // Dirt intensity
  dirtIntensity = new PostProcessEffectFloatParameter(0, 0);
  
  // Color tint
  tint = new PostProcessEffectColorParameter(new Color(1, 1, 1, 1));
  
  // Validity check
  override isValid(): boolean {
    return this.enabled && this.intensity.value > 0;
  }
}

enum BloomDownScaleMode {
  Half = "Half",
  Quarter = "Quarter"
}
```

#### Bloom Configuration Examples

```ts
const bloom = postProcess.addEffect(BloomEffect);

// Basic settings
bloom.threshold.value = 1.0;    // Brightness threshold
bloom.intensity.value = 0.8;    // Bloom intensity
bloom.scatter.value = 0.6;      // Scatter range

// Advanced settings
bloom.highQualityFiltering.value = true; // High quality filtering
bloom.downScale.value = BloomDownScaleMode.Quarter; // Quarter sampling

// Dirt effect
bloom.dirtTexture.value = dirtTexture;
bloom.dirtIntensity.value = 0.3;

// Color adjustment
bloom.tint.value.set(1.0, 0.9, 0.8, 1.0); // Warm tone
```

### TonemappingEffect

```ts
class TonemappingEffect extends PostProcessEffect {
  // Tone mapping mode
  mode = new PostProcessEffectEnumParameter(TonemappingMode, TonemappingMode.Neutral);
}

enum TonemappingMode {
  Neutral = "Neutral", // Neutral tone mapping
  ACES = "ACES"       // ACES filmic tone mapping
}
```

#### Tone Mapping Usage

```ts
const tonemapping = postProcess.addEffect(TonemappingEffect);

// Select tone mapping algorithm
tonemapping.mode.value = TonemappingMode.ACES; // Cinematic tone mapping
// or
tonemapping.mode.value = TonemappingMode.Neutral; // Neutral tone mapping
```

## Detailed Effect Configuration

### BloomEffect Advanced Configuration

The BloomEffect provides comprehensive control over bloom rendering with multiple quality and performance options:

```ts
const bloom = postProcess.addEffect(BloomEffect);

// Core bloom parameters
bloom.threshold.value = 1.0;        // Brightness threshold (linear space)
bloom.intensity.value = 0.8;        // Overall bloom strength
bloom.scatter.value = 0.6;          // Bloom spread radius (0.0-1.0)
bloom.tint.value.set(1, 0.9, 0.8, 1); // Warm color tint

// Quality settings
bloom.highQualityFiltering.value = true; // Bicubic vs bilinear upsampling
bloom.downScale.value = BloomDownScaleMode.Half; // Half or Quarter resolution

// Dirt lens effect
bloom.dirtTexture.value = dirtTexture;   // Lens dirt texture
bloom.dirtIntensity.value = 0.3;         // Dirt effect strength

// Performance optimization examples
function configureBloomForPlatform(bloom: BloomEffect, platform: Platform) {
  switch (platform) {
    case Platform.Mobile:
      bloom.downScale.value = BloomDownScaleMode.Quarter;
      bloom.highQualityFiltering.value = false;
      break;
    case Platform.Desktop:
      bloom.downScale.value = BloomDownScaleMode.Half;
      bloom.highQualityFiltering.value = true;
      break;
  }
}
```

#### Bloom Shader Implementation Details

The bloom effect uses a multi-pass approach with prefilter, blur, and upsample stages:

```ts
// Bloom shader passes (internal implementation)
enum BloomPasses {
  Prefilter = 0,  // Brightness thresholding and knee softening
  BlurH = 1,      // Horizontal Gaussian blur
  BlurV = 2,      // Vertical Gaussian blur
  Upsample = 3    // Bicubic/bilinear upsampling with additive blending
}

// Threshold calculation with soft knee
const thresholdLinear = bloom.threshold.value;
const thresholdKnee = thresholdLinear * 0.5; // Hardcoded soft knee
const scatterLerp = MathUtil.lerp(0.05, 0.95, bloom.scatter.value);

// Shader parameters passed to GPU
bloomParams.x = thresholdLinear;  // Brightness threshold
bloomParams.y = thresholdKnee;    // Soft knee value
bloomParams.z = scatterLerp;      // Scatter interpolation
```

### FXAA Anti-Aliasing Implementation

FXAA (Fast Approximate Anti-Aliasing) is a post-processing technique that smooths all pixel edges:

```ts
// Enable FXAA on camera
camera.antiAliasing = AntiAliasing.FXAA;

// FXAA shader parameters (internal constants)
const FXAA_PARAMS = {
  SUBPIXEL_BLEND_AMOUNT: 0.75,        // Subpixel aliasing removal
  RELATIVE_CONTRAST_THRESHOLD: 0.166,  // Edge detection sensitivity
  ABSOLUTE_CONTRAST_THRESHOLD: 0.0833  // Minimum contrast for processing
};
```

#### FXAA Quality Presets

FXAA uses predefined quality presets that balance performance and visual quality:

```ts
// FXAA quality presets (compile-time constants)
enum FXAAQualityPreset {
  Performance = 10,  // Fastest, basic edge smoothing
  Default = 12,      // Balanced quality and performance
  Quality = 15,      // Higher quality, slightly slower
  HighQuality = 23,  // Best quality, more expensive
  Extreme = 39       // Maximum quality, very expensive
}

// FXAA processing pipeline
class FXAAProcessor {
  // 1. Luminance calculation (if not pre-computed)
  computeLuminance(color: Color): number {
    return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
  }

  // 2. Edge detection using local contrast
  detectEdges(center: number, neighbors: number[]): boolean {
    const maxLuma = Math.max(center, ...neighbors);
    const minLuma = Math.min(center, ...neighbors);
    const range = maxLuma - minLuma;

    return range > Math.max(
      FXAA_PARAMS.ABSOLUTE_CONTRAST_THRESHOLD,
      maxLuma * FXAA_PARAMS.RELATIVE_CONTRAST_THRESHOLD
    );
  }

  // 3. Subpixel and edge blending
  blendPixel(originalColor: Color, edgeDirection: Vector2): Color {
    // Implementation details handled by FXAA shader
    return originalColor; // Simplified
  }
}
```

#### FXAA vs MSAA Comparison

```ts
// Performance and quality comparison
class AntiAliasingComparison {
  static compare() {
    return {
      FXAA: {
        performance: "High",
        coverage: "All edges (geometry + shader-generated)",
        quality: "Good for most cases",
        memoryUsage: "Low",
        hardwareRequirement: "Any GPU"
      },
      MSAA: {
        performance: "Medium to Low",
        coverage: "Geometry edges only",
        quality: "Excellent for geometry",
        memoryUsage: "High (2x-8x)",
        hardwareRequirement: "Hardware MSAA support"
      }
    };
  }

  // Hybrid approach for best results
  static configureHybridAA(camera: Camera, quality: QualityLevel) {
    switch (quality) {
      case QualityLevel.Low:
        camera.msaaSamples = MSAASamples.None;
        camera.antiAliasing = AntiAliasing.FXAA;
        break;
      case QualityLevel.Medium:
        camera.msaaSamples = MSAASamples.TwoX;
        camera.antiAliasing = AntiAliasing.FXAA;
        break;
      case QualityLevel.High:
        camera.msaaSamples = MSAASamples.FourX;
        camera.antiAliasing = AntiAliasing.None; // MSAA sufficient
        break;
    }
  }
}
```

## Custom Effect Development

### Creating Custom Effect Classes

```ts
import { PostProcessEffect, PostProcessEffectFloatParameter } from "@galacean/engine";

class VignetteEffect extends PostProcessEffect {
  // Define parameters with constraints
  intensity = new PostProcessEffectFloatParameter(0.5, 0, 1);
  smoothness = new PostProcessEffectFloatParameter(0.8, 0, 1);
  center = new PostProcessEffectVector2Parameter(new Vector2(0.5, 0.5));

  // Override validity check
  override isValid(): boolean {
    return this.enabled && this.intensity.value > 0;
  }
}
```

### Advanced Parameter Types

```ts
import {
  PostProcessEffectBoolParameter,
  PostProcessEffectColorParameter,
  PostProcessEffectEnumParameter,
  PostProcessEffectTextureParameter,
  PostProcessEffectVector2Parameter,
  PostProcessEffectVector3Parameter,
  PostProcessEffectVector4Parameter
} from "@galacean/engine";

class AdvancedEffect extends PostProcessEffect {
  // Boolean parameter
  enabled = new PostProcessEffectBoolParameter(true);

  // Float parameter with min/max constraints
  intensity = new PostProcessEffectFloatParameter(1.0, 0.0, 2.0, true); // needLerp = true

  // Color parameter with alpha
  tint = new PostProcessEffectColorParameter(new Color(1, 1, 1, 1));

  // Vector parameters
  offset = new PostProcessEffectVector2Parameter(new Vector2(0, 0));
  direction = new PostProcessEffectVector3Parameter(new Vector3(0, 1, 0));
  transform = new PostProcessEffectVector4Parameter(new Vector4(1, 1, 0, 0));

  // Texture parameter
  maskTexture = new PostProcessEffectTextureParameter(null);

  // Enum parameter
  blendMode = new PostProcessEffectEnumParameter(BlendMode, BlendMode.Normal);

  // Parameter interpolation control
  constructor() {
    super();
    // Disable interpolation for specific parameters
    this.blendMode.enabled = false; // Won't interpolate in local post-processing
  }
}
```

### Creating Custom Pass Classes

```ts
import {
  PostProcessPass,
  PostProcessPassEvent,
  Blitter,
  Material,
  Shader
} from "@galacean/engine";

class CustomGrayScalePass extends PostProcessPass {
  private _material: Material;

  constructor(engine: Engine) {
    super(engine);
    this.event = PostProcessPassEvent.AfterUber; // Execute after Uber pass
    this._material = this.createGrayScaleMaterial();
  }

  private createGrayScaleMaterial(): Material {
    const shader = Shader.create(
      "GrayScale",
      // Vertex shader
      `
      attribute vec4 POSITION_UV;
      varying vec2 v_uv;

      void main() {
        gl_Position = vec4(POSITION_UV.xy, 0.0, 1.0);
        v_uv = POSITION_UV.zw;
      }
      `,
      // Fragment shader
      `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D renderer_BlitTexture;
      uniform float u_intensity;

      void main() {
        vec4 color = texture2D(renderer_BlitTexture, v_uv);
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(mix(color.rgb, vec3(gray), u_intensity), color.a);
      }
      `
    );

    const material = new Material(this.engine, shader);

    // Configure render state
    const depthState = material.renderState.depthState;
    depthState.enabled = false;
    depthState.writeEnabled = false;

    return material;
  }

  // Render implementation
  override onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {
    // Get blended effect data from post-process manager
    const postProcessManager = camera.scene.postProcessManager;
    const customEffect = postProcessManager.getBlendEffect(CustomGrayScaleEffect);

    if (customEffect && customEffect.isValid()) {
      // Set shader parameters
      this._material.shaderData.setFloat("u_intensity", customEffect.intensity.value);

      // Render using Blitter utility
      Blitter.blitTexture(
        this.engine,
        srcTexture,
        destTarget,
        undefined,      // source region (null = full texture)
        undefined,      // destination viewport (null = full target)
        this._material,
        0              // pass index
      );
    } else {
      // Pass-through if effect is disabled
      Blitter.blitTexture(this.engine, srcTexture, destTarget);
    }
  }

  // Cleanup resources
  override destroy(): void {
    this._material?.destroy();
    super.destroy();
  }
}

// Corresponding effect class
class CustomGrayScaleEffect extends PostProcessEffect {
  intensity = new PostProcessEffectFloatParameter(0.5, 0, 1);

  override isValid(): boolean {
    return this.enabled && this.intensity.value > 0;
  }
}
```

### Shader Implementation

```glsl
// Vignette.glsl
#ifdef ENABLE_EFFECT_VIGNETTE
  vec2 vignetteUV = v_uv - 0.5;
  float vignette = 1.0 - dot(vignetteUV, vignetteUV) * material_VignetteIntensity;
  vignette = smoothstep(0.0, material_VignetteSmoothness, vignette);
  color.rgb *= vignette;
#endif
```

### Shader Property Registration

```ts
class VignetteEffect extends PostProcessEffect {
  static readonly SHADER_NAME = "PostProcessEffect Vignette";
  
  // Shader properties
  static _enableMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_EFFECT_VIGNETTE");
  static _intensityProp = ShaderProperty.getByName("material_VignetteIntensity");
  static _smoothnessProp = ShaderProperty.getByName("material_VignetteSmoothness");
  
  // Parameter definitions
  intensity = new PostProcessEffectFloatParameter(0.5, 0, 1);
  smoothness = new PostProcessEffectFloatParameter(0.8, 0, 1);
}
```

## PostProcessManager

### Core Functionality

```ts
class PostProcessManager {
  // Get blended effect result
  getBlendEffect<T extends typeof PostProcessEffect>(type: T): InstanceType<T>;
  
  // Internal methods
  _update(camera: Camera): void;          // Update effect blending
  _render(camera: Camera, src: RenderTarget, dest: RenderTarget): void; // Render
  _isValid(): boolean;                    // Check for valid passes
}
```

### Blending Mechanism

```ts
// Get blended result of all effects of the same type in scene
const blendedBloom = postProcessManager.getBlendEffect(BloomEffect);

// Blended result contains averaged values from all active BloomEffects
console.log(blendedBloom.intensity.value); // Blended intensity value
```

## PostProcessPass Rendering Pipeline

### Creating Custom Passes

```ts
import { PostProcessPass, PostProcessPassEvent } from "@galacean/engine";

class CustomPass extends PostProcessPass {
  constructor(engine: Engine) {
    super(engine);
    this.event = PostProcessPassEvent.AfterUber; // Set execution timing
  }
  
  // Validity check
  override isValid(postProcessManager: PostProcessManager): boolean {
    return this.isActive && postProcessManager.getBlendEffect(CustomEffect)?.isValid();
  }
  
  // Render implementation
  override onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {
    const material = this.createMaterial();
    const effect = postProcessManager.getBlendEffect(CustomEffect);
    
    // Set shader parameters
    material.shaderData.setFloat("intensity", effect.intensity.value);
    material.shaderData.setTexture("inputTexture", srcTexture);
    
    // Render to target
    this.renderToTarget(camera, material, destTarget);
  }
}
```

### Pass Event Timing

```ts
enum PostProcessPassEvent {
  BeforeUber = 0,   // Before Uber pass
  AfterUber = 100   // After Uber pass
}

// Custom event timing
pass.event = PostProcessPassEvent.BeforeUber + 10; // Execute 10 units after BeforeUber
```

## Performance Optimization

### Effect Validity Optimization

```ts
class OptimizedEffect extends PostProcessEffect {
  override isValid(): boolean {
    // Only activate when parameters reach visible threshold
    return this.enabled && this.intensity.value > 0.01;
  }
}
```

### Quality Level Adaptation

```ts
enum QualityLevel {
  Low,
  Medium,
  High
}

function adjustPostProcessQuality(quality: QualityLevel, postProcess: PostProcess) {
  const bloom = postProcess.getEffect(BloomEffect);
  
  switch (quality) {
    case QualityLevel.Low:
      bloom.enabled = false;
      break;
    case QualityLevel.Medium:
      bloom.enabled = true;
      bloom.highQualityFiltering.value = false;
      bloom.downScale.value = BloomDownScaleMode.Quarter;
      break;
    case QualityLevel.High:
      bloom.enabled = true;
      bloom.highQualityFiltering.value = true;
      bloom.downScale.value = BloomDownScaleMode.Half;
      break;
  }
}
```

### Local Post-Processing Optimization

```ts
// Use reasonable blend distance to avoid frequent calculations
localPost.blendDistance = 3.0; // Don't set too large

// Use simple collider shapes
const sphereShape = new SphereColliderShape();
sphereShape.radius = 5.0;
collider.addShape(sphereShape); // Sphere calculations are faster than box
```

## Advanced Usage Patterns

### Dynamic Effect Management

```ts
class PostProcessController {
  private postProcess: PostProcess;
  private effectStates = new Map<typeof PostProcessEffect, boolean>();
  
  toggleEffect<T extends typeof PostProcessEffect>(effectType: T) {
    const effect = this.postProcess.getEffect(effectType);
    if (effect) {
      effect.enabled = !effect.enabled;
      this.effectStates.set(effectType, effect.enabled);
    }
  }
  
  saveState() {
    // Save current effect states - using public API
    const effects = this.postProcess.effects;
    effects.forEach(effect => {
      this.effectStates.set(effect.constructor as any, effect.enabled);
    });
  }
  
  restoreState() {
    // Restore effect states
    this.effectStates.forEach((enabled, effectType) => {
      const effect = this.postProcess.getEffect(effectType);
      if (effect) {
        effect.enabled = enabled;
      }
    });
  }
}
```

### Smooth Parameter Transitions

```ts
class EffectAnimator {
  private tweens = new Map<string, any>();
  
  animateParameter(effect: PostProcessEffect, paramName: string, targetValue: number, duration: number) {
    const parameter = effect[paramName] as PostProcessEffectFloatParameter;
    const startValue = parameter.value;
    
    // Use tween library or custom interpolation
    const tween = this.createTween(startValue, targetValue, duration, (value) => {
      parameter.value = value;
    });
    
    this.tweens.set(`${effect.constructor.name}.${paramName}`, tween);
  }
  
  // Smooth effect enable
  fadeInEffect(effect: PostProcessEffect, duration: number = 1.0) {
    effect.enabled = true;
    if ('intensity' in effect) {
      this.animateParameter(effect, 'intensity', 1.0, duration);
    }
  }
  
  // Smooth effect disable
  fadeOutEffect(effect: PostProcessEffect, duration: number = 1.0) {
    if ('intensity' in effect) {
      this.animateParameter(effect, 'intensity', 0.0, duration);
      setTimeout(() => {
        effect.enabled = false;
      }, duration * 1000);
    }
  }
}
```

### Scene Transition Effects

```ts
class SceneTransitionEffects {
  static async fadeTransition(scene: Scene, duration: number = 2.0) {
    const postProcess = scene.postProcessManager.getPostProcess();
    const fade = postProcess.addEffect(FadeEffect);
    
    // Fade in
    fade.alpha.value = 1.0;
    await this.animateValue(fade.alpha, 0.0, duration / 2);
    
    // Scene transition logic
    // ...
    
    // Fade out
    await this.animateValue(fade.alpha, 1.0, duration / 2);
    postProcess.removeEffect(FadeEffect);
  }
}
```

## Debugging and Troubleshooting

### Effect Debugging

```ts
function debugPostProcess(postProcess: PostProcess) {
  console.log("PostProcess Debug Info:");
  console.log("- Component enabled:", postProcess.enabled);
  console.log("- Effects count:", postProcess.effects.length);
  
  postProcess.effects.forEach((effect, index) => {
    console.log(`Effect ${index}:`);
    console.log("  - Type:", effect.constructor.name);
    console.log("  - Enabled:", effect.enabled);
    console.log("  - Valid:", effect.isValid());
    
    // Check key parameters
    if ('intensity' in effect) {
      console.log("  - Intensity:", (effect as any).intensity.value);
    }
  });
  
  // Check render passes
  const engine = postProcess.engine;
  // Note: This would be implemented through a public monitoring API
  // const activePasses = engine.getPostProcessInfo();
  console.log("- Active passes:", activePasses.length);
  
  // Check camera masks
  const cameras = postProcess.scene.findAllComponentsOfType(Camera);
  cameras.forEach(camera => {
    console.log(`Camera "${camera.entity.name}" mask:`, camera.postProcessMask);
  });
}
```

### Performance Monitoring

```ts
class PostProcessProfiler {
  private frameTime = 0;
  private effectTimes = new Map<string, number>();
  
  startFrame() {
    this.frameTime = performance.now();
  }
  
  endFrame() {
    const totalTime = performance.now() - this.frameTime;
    console.log(`PostProcess frame time: ${totalTime.toFixed(2)}ms`);
  }
  
  profileEffect(effectName: string, fn: () => void) {
    const start = performance.now();
    fn();
    const time = performance.now() - start;
    
    this.effectTimes.set(effectName, time);
    if (time > 16.67) { // Exceeds frame time
      console.warn(`Effect "${effectName}" is slow: ${time.toFixed(2)}ms`);
    }
  }
}
```

## API Reference

```apidoc
PostProcess:
  Properties:
    layer: Layer
      - Layer identification for the post-process component.
    isGlobal: boolean
      - Toggle between global and local post-processing modes.
    blendDistance: number
      - Blend distance for local post-processing transitions.
    priority: number
      - Execution priority affecting processing order.

  Methods:
    addEffect<T>(type: T): InstanceType<T>
      - Adds and returns new effect instance of specified type.
    removeEffect<T>(type: T): InstanceType<T>
      - Removes effect of specified type and returns the instance.
    getEffect<T>(type: T): InstanceType<T>
      - Gets existing effect instance of specified type.
    clearEffects(): void
      - Removes all effects from the post-process component.

PostProcessEffect:
  Properties:
    enabled: boolean
      - Controls whether the effect is active and processed.

  Methods:
    isValid(): boolean
      - Returns whether effect should be processed based on current state.
    _lerp(to: PostProcessEffect, factor: number): void
      - Internal method for blending between effect states.

BloomEffect:
  Properties:
    threshold: PostProcessEffectFloatParameter
      - Brightness threshold for bloom activation. @defaultValue `0.8`
    intensity: PostProcessEffectFloatParameter
      - Overall bloom effect intensity. @defaultValue `0`
    scatter: PostProcessEffectFloatParameter
      - Bloom scatter radius (0.0 to 1.0). @defaultValue `0.7`
    tint: PostProcessEffectColorParameter
      - Color tint applied to bloom. @defaultValue `new Color(1, 1, 1, 1)`
    highQualityFiltering: PostProcessEffectBoolParameter
      - Enable high quality filtering for better quality. @defaultValue `false`
    downScale: PostProcessEffectEnumParameter
      - Downscale mode for performance optimization. @defaultValue `BloomDownScaleMode.Half`

TonemappingEffect:
  Properties:
    mode: PostProcessEffectEnumParameter
      - Tone mapping algorithm selection. @defaultValue `TonemappingMode.Neutral`

PostProcessManager:
  Methods:
    getBlendEffect<T>(type: T): InstanceType<T>
      - Returns blended result of all effects of specified type in scene.
    _update(camera: Camera): void
      - Internal method for updating effect blending calculations.
    _render(camera: Camera, src: RenderTarget, dest: RenderTarget): void
      - Internal method for rendering post-processing effects.
```

## Best Practices

### Effect Composition
- Apply tone mapping first, then bloom, followed by decorative effects
- Use reasonable parameter ranges to maintain visual quality
- Test effect combinations across different lighting conditions
- Consider performance impact when combining multiple effects

### Parameter Configuration
- Set bloom threshold above 1.0 for realistic lighting
- Use moderate intensity values to avoid oversaturation
- Configure scatter values based on desired visual style
- Apply color tints sparingly to maintain color accuracy

### Performance Optimization
- Implement effect validity checks to skip unnecessary processing
- Use quality level adaptation for different performance targets
- Monitor frame time impact of post-processing effects
- Use local post-processing sparingly due to collision detection overhead

### Memory Management
- Clear effects when changing scenes to prevent memory leaks
- Use effect pooling for frequently toggled effects
- Monitor texture memory usage with dirt textures and custom effects
- Implement proper cleanup in custom effect destructors
