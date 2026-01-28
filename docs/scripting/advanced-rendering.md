# Advanced Rendering Features

Galacean Engine provides sophisticated rendering capabilities including HDR rendering, multi-sample anti-aliasing (MSAA), advanced texture formats, and high-performance render targets. These features enable high-quality visual effects and optimized rendering pipelines.

## HDR Rendering

High Dynamic Range (HDR) rendering allows for a wider range of colors and brightness values, enabling more realistic lighting and post-processing effects.

### HDR Configuration

```ts
import { Camera, TextureFormat, AntiAliasing } from "@galacean/engine";

const camera = cameraEntity.getComponent(Camera);

// Enable HDR rendering
camera.enableHDR = true;

// HDR requires compatible hardware
const rhi = engine._hardwareRenderer;
const supportsHDR = rhi.isWebGL2 || rhi.canIUse(GLCapabilityType.textureHalfFloat);

if (!supportsHDR) {
  console.warn("HDR not supported on this device");
  camera.enableHDR = false;
}
```

### HDR Texture Formats

HDR rendering uses high-precision texture formats:

```ts
// HDR texture formats (automatically selected by engine)
enum HDRFormats {
  // WebGL2 + no alpha required: 11-bit RGB + 10-bit shared exponent
  R11G11B10_UFloat = "R11G11B10_UFloat",
  
  // WebGL1 or alpha required: 16-bit per channel
  R16G16B16A16 = "R16G16B16A16",
  
  // Full precision: 32-bit per channel
  R32G32B32A32 = "R32G32B32A32"
}

// Engine automatically selects optimal format
function getHDRFormat(camera: Camera): TextureFormat {
  const { engine, isAlphaOutputRequired } = camera;
  const rhi = engine._hardwareRenderer;
  
  if (rhi.isWebGL2 && !isAlphaOutputRequired) {
    return TextureFormat.R11G11B10_UFloat; // Most efficient
  } else {
    return TextureFormat.R16G16B16A16; // Compatible fallback
  }
}
```

### HDR Render Targets

```ts
// Create HDR render target
const hdrRenderTarget = new RenderTarget(
  engine,
  1920, 1080,
  new Texture2D(engine, 1920, 1080, TextureFormat.R16G16B16A16, false),
  TextureFormat.Depth24Stencil8,
  1 // No MSAA for HDR by default
);

// Apply to camera
camera.renderTarget = hdrRenderTarget;
camera.enableHDR = true;
```

### HDR Post-Processing Integration

```ts
// HDR works seamlessly with post-processing
camera.enablePostProcess = true;

const postProcess = scene.postProcessManager;

// Bloom effect benefits greatly from HDR
const bloom = postProcess.addEffect(BloomEffect);
bloom.threshold.value = 1.0;  // HDR allows values > 1.0
bloom.intensity.value = 2.5;  // Higher intensity possible with HDR

// Tone mapping converts HDR to display range
const tonemap = postProcess.addEffect(TonemappingEffect);
tonemap.mode.value = TonemappingMode.ACES; // Filmic tone mapping
```

## Multi-Sample Anti-Aliasing (MSAA)

MSAA provides hardware-accelerated edge smoothing by sampling multiple points per pixel during rasterization.

### MSAA Configuration

```ts
import { MSAASamples } from "@galacean/engine";

// Configure MSAA samples
camera.msaaSamples = MSAASamples.FourX; // 4x MSAA (default)

// Available MSAA levels
enum MSAASamples {
  None = 1,   // No anti-aliasing
  TwoX = 2,   // 2x MSAA
  FourX = 4,  // 4x MSAA (recommended)
  EightX = 8  // 8x MSAA (high-end devices)
}

// Hardware capability detection
const maxMSAA = engine._hardwareRenderer.capability.maxAntiAliasing;
console.log(`Max MSAA samples supported: ${maxMSAA}`);

// Adaptive MSAA based on device capability
if (maxMSAA >= 8) {
  camera.msaaSamples = MSAASamples.EightX;
} else if (maxMSAA >= 4) {
  camera.msaaSamples = MSAASamples.FourX;
} else {
  camera.msaaSamples = MSAASamples.TwoX;
}
```

### MSAA with Render Targets

```ts
// Create MSAA render target
const msaaRenderTarget = new RenderTarget(
  engine,
  1920, 1080,
  new Texture2D(engine, 1920, 1080, TextureFormat.R8G8B8A8, false),
  TextureFormat.Depth24Stencil8,
  4 // 4x MSAA
);

camera.renderTarget = msaaRenderTarget;

// MSAA is automatically resolved to final texture
// No additional code needed for resolve operation
```

### MSAA Performance Considerations

```ts
// Performance-aware MSAA configuration
class MSAAManager {
  private camera: Camera;
  private targetFrameRate = 60;
  private frameTimeHistory: number[] = [];
  
  constructor(camera: Camera) {
    this.camera = camera;
  }
  
  adaptiveMSAA(): void {
    const avgFrameTime = this.getAverageFrameTime();
    const currentFPS = 1000 / avgFrameTime;
    
    if (currentFPS < this.targetFrameRate * 0.8) {
      // Performance too low, reduce MSAA
      this.reduceMSAA();
    } else if (currentFPS > this.targetFrameRate * 1.1) {
      // Performance headroom, increase MSAA
      this.increaseMSAA();
    }
  }
  
  private reduceMSAA(): void {
    const current = this.camera.msaaSamples;
    if (current > MSAASamples.None) {
      this.camera.msaaSamples = Math.max(MSAASamples.None, current / 2);
      console.log(`Reduced MSAA to ${this.camera.msaaSamples}x`);
    }
  }
  
  private increaseMSAA(): void {
    const current = this.camera.msaaSamples;
    const maxSupported = engine._hardwareRenderer.capability.maxAntiAliasing;
    if (current < maxSupported) {
      this.camera.msaaSamples = Math.min(maxSupported, current * 2);
      console.log(`Increased MSAA to ${this.camera.msaaSamples}x`);
    }
  }
}
```

## Fast Approximate Anti-Aliasing (FXAA)

FXAA is a post-processing anti-aliasing technique that smooths all pixels, including shader-generated edges.

### FXAA Configuration

```ts
import { AntiAliasing } from "@galacean/engine";

// Enable FXAA (post-processing anti-aliasing)
camera.antiAliasing = AntiAliasing.FXAA;

// FXAA vs MSAA comparison
// MSAA: Hardware-based, only smooths geometry edges, higher performance cost
// FXAA: Shader-based, smooths all edges including alpha-cutoff, lower cost

// Combining FXAA with MSAA (not recommended due to redundancy)
camera.msaaSamples = MSAASamples.TwoX; // Light MSAA
camera.antiAliasing = AntiAliasing.FXAA; // + FXAA for complete coverage
```

### FXAA Implementation Details

```ts
// FXAA requires specific render target format
// Engine automatically creates intermediate R8G8B8A8 target for FXAA
// Then applies FXAA shader and outputs to final target

// FXAA shader parameters (internal, not user-configurable)
const FXAA_PARAMS = {
  SUBPIXEL_BLEND_AMOUNT: 0.75,      // Subpixel blending
  RELATIVE_CONTRAST_THRESHOLD: 0.166, // Edge detection sensitivity
  ABSOLUTE_CONTRAST_THRESHOLD: 0.0833 // Minimum contrast for processing
};
```

## Texture2DArray

Texture arrays allow efficient storage and sampling of multiple textures with the same dimensions.

### Creating Texture Arrays

```ts
import { Texture2DArray, TextureFormat } from "@galacean/engine";

// Create texture array (WebGL2 only)
const textureArray = new Texture2DArray(
  engine,
  512, 512,    // width, height
  16,          // array length (number of textures)
  TextureFormat.R8G8B8A8,
  true,        // generate mipmaps
  true         // sRGB color space
);

// WebGL1 compatibility check
if (!engine._hardwareRenderer.isWebGL2) {
  throw new Error("Texture2DArray requires WebGL2");
}
```

### Loading Data into Texture Arrays

```ts
// Load images into texture array
const images = [
  "texture0.jpg", "texture1.jpg", "texture2.jpg", // ... up to 16 images
];

images.forEach(async (imagePath, index) => {
  const image = new Image();
  image.onload = () => {
    textureArray.setImageSource(
      index,      // array element index
      image,      // image source
      0,          // mip level
      false,      // flip Y
      false,      // premultiply alpha
      0, 0        // x, y offset
    );
  };
  image.src = imagePath;
});

// Set pixel data directly
const pixelData = new Uint8Array(512 * 512 * 4); // RGBA data
// ... fill pixel data ...
textureArray.setPixelBuffer(
  0,           // array element index
  pixelData,   // pixel buffer
  0,           // mip level
  0, 0,        // x, y offset
  512, 512,    // width, height
  1            // length (number of array elements to update)
);
```

### Using Texture Arrays in Shaders

```glsl
// Vertex shader
attribute vec3 a_position;
attribute vec2 a_texCoord;
attribute float a_textureIndex; // Which texture in array to use

varying vec2 v_texCoord;
varying float v_textureIndex;

void main() {
  gl_Position = renderer_MVPMat * vec4(a_position, 1.0);
  v_texCoord = a_texCoord;
  v_textureIndex = a_textureIndex;
}

// Fragment shader
precision mediump float;
uniform sampler2DArray u_textureArray;

varying vec2 v_texCoord;
varying float v_textureIndex;

void main() {
  // Sample from texture array
  vec4 color = texture(u_textureArray, vec3(v_texCoord, v_textureIndex));
  gl_FragColor = color;
}
```

## Advanced Render Target Usage

### Multiple Render Targets (MRT)

```ts
// Create multiple color textures
const colorTexture1 = new Texture2D(engine, 1024, 1024, TextureFormat.R8G8B8A8);
const colorTexture2 = new Texture2D(engine, 1024, 1024, TextureFormat.R16G16B16A16);
const colorTexture3 = new Texture2D(engine, 1024, 1024, TextureFormat.R11G11B10_UFloat);

// Create MRT render target
const mrtRenderTarget = new RenderTarget(
  engine,
  1024, 1024,
  [colorTexture1, colorTexture2, colorTexture3], // Multiple color attachments
  TextureFormat.Depth24Stencil8,
  1 // No MSAA for MRT
);

// Use in deferred rendering pipeline
camera.renderTarget = mrtRenderTarget;
```

### Depth-Only Rendering

```ts
// Create depth-only render target
const depthTexture = new Texture2D(engine, 1024, 1024, TextureFormat.Depth32);
const depthOnlyTarget = new RenderTarget(
  engine,
  1024, 1024,
  null,        // No color attachment
  depthTexture // Depth texture
);

// Use for shadow mapping
const shadowCamera = shadowCasterEntity.getComponent(Camera);
shadowCamera.renderTarget = depthOnlyTarget;
shadowCamera.clearFlags = CameraClearFlags.Depth;
```

### Render Target Chains

```ts
// Create render target chain for post-processing
class RenderTargetChain {
  private targets: RenderTarget[] = [];
  
  constructor(engine: Engine, width: number, height: number, count: number) {
    for (let i = 0; i < count; i++) {
      const colorTexture = new Texture2D(
        engine, width, height, 
        TextureFormat.R16G16B16A16, // HDR format
        false // No mipmaps for intermediate targets
      );
      
      this.targets.push(new RenderTarget(
        engine, width, height, colorTexture, null, 1
      ));
    }
  }
  
  getTarget(index: number): RenderTarget {
    return this.targets[index % this.targets.length];
  }
  
  // Ping-pong between targets
  pingPong(currentIndex: number): number {
    return (currentIndex + 1) % this.targets.length;
  }
}

// Usage in post-processing pipeline
const rtChain = new RenderTargetChain(engine, 1920, 1080, 2);
let currentTarget = 0;

// Pass 1: Bloom prefilter
camera.renderTarget = rtChain.getTarget(currentTarget);
// ... render bloom prefilter ...

// Pass 2: Bloom blur
currentTarget = rtChain.pingPong(currentTarget);
camera.renderTarget = rtChain.getTarget(currentTarget);
// ... render bloom blur ...
```

## Performance Optimization

### Adaptive Quality Settings

```ts
class AdaptiveRenderingManager {
  private camera: Camera;
  private qualityLevel = 1.0;
  
  constructor(camera: Camera) {
    this.camera = camera;
  }
  
  updateQuality(frameTime: number): void {
    const targetFrameTime = 16.67; // 60 FPS
    const ratio = frameTime / targetFrameTime;
    
    if (ratio > 1.2) {
      // Performance too low
      this.qualityLevel = Math.max(0.5, this.qualityLevel - 0.1);
    } else if (ratio < 0.8) {
      // Performance headroom
      this.qualityLevel = Math.min(1.0, this.qualityLevel + 0.05);
    }
    
    this.applyQualitySettings();
  }
  
  private applyQualitySettings(): void {
    if (this.qualityLevel < 0.7) {
      // Low quality
      this.camera.msaaSamples = MSAASamples.None;
      this.camera.enableHDR = false;
      this.camera.antiAliasing = AntiAliasing.None;
    } else if (this.qualityLevel < 0.9) {
      // Medium quality
      this.camera.msaaSamples = MSAASamples.TwoX;
      this.camera.enableHDR = false;
      this.camera.antiAliasing = AntiAliasing.FXAA;
    } else {
      // High quality
      this.camera.msaaSamples = MSAASamples.FourX;
      this.camera.enableHDR = true;
      this.camera.antiAliasing = AntiAliasing.FXAA;
    }
  }
}
```

### Memory Management

```ts
// Efficient render target management
class RenderTargetPool {
  private pool = new Map<string, RenderTarget[]>();
  
  getRenderTarget(
    engine: Engine,
    width: number,
    height: number,
    format: TextureFormat,
    msaa: number = 1
  ): RenderTarget {
    const key = `${width}x${height}_${format}_${msaa}`;
    const targets = this.pool.get(key) || [];
    
    if (targets.length > 0) {
      return targets.pop()!;
    }
    
    // Create new render target
    const colorTexture = new Texture2D(engine, width, height, format, false);
    return new RenderTarget(engine, width, height, colorTexture, null, msaa);
  }
  
  returnRenderTarget(target: RenderTarget): void {
    const { width, height, antiAliasing } = target;
    const format = target.getColorTexture(0)?.format;
    const key = `${width}x${height}_${format}_${antiAliasing}`;
    
    const targets = this.pool.get(key) || [];
    targets.push(target);
    this.pool.set(key, targets);
  }
}
```

These advanced rendering features provide the foundation for high-quality visual effects while maintaining optimal performance across different hardware configurations.
