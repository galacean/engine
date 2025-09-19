# Texture

Galacean's texture system provides comprehensive support for 2D textures, cube maps, texture arrays, and render targets. Textures are fundamental resources for rendering, serving as surface data for materials, environment maps for lighting, and render targets for post-processing effects. The system supports various formats including compressed textures, HDR formats, and depth textures with extensive filtering and wrapping options.

## Overview

The texture system consists of several core components:
- **Texture Base Class**: Common properties and methods for all texture types
- **Texture2D**: Standard 2D textures for diffuse maps, normal maps, and other surface properties
- **TextureCube**: Cube maps for environment mapping, skyboxes, and reflection probes
- **Texture2DArray**: Array textures for efficient multi-texture sampling
- **RenderTarget**: Frame buffers for render-to-texture operations and post-processing
- **Format Support**: Comprehensive format support including compressed and HDR textures

Each texture type supports mipmapping, various filtering modes, and different wrapping behaviors for optimal rendering quality and performance.

## Quick Start

```ts
import { WebGLEngine, Texture2D, TextureCube, RenderTarget, TextureFormat, TextureFilterMode, TextureWrapMode } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });

// Create 2D texture from image
const texture2D = new Texture2D(engine, 512, 512, TextureFormat.R8G8B8A8, false);

// Load image and apply to texture
const image = new Image();
image.onload = () => {
  texture2D.setImageSource(image);
  texture2D.generateMipmaps();
};
image.src = "path/to/texture.jpg";

// Create cube map texture
const cubeTexture = new TextureCube(engine, 256, TextureFormat.R8G8B8);

// Configure texture filtering and wrapping
texture2D.filterMode = TextureFilterMode.Trilinear;
texture2D.wrapModeU = TextureWrapMode.Repeat;
texture2D.wrapModeV = TextureWrapMode.Repeat;
texture2D.anisoLevel = 4;

// Create render target for post-processing
const renderTarget = new RenderTarget(engine, 1024, 1024, TextureFormat.R8G8B8A8);
renderTarget.autoGenerateMipmaps = true;
```

## Texture Base Class

All texture types inherit from the base `Texture` class, which provides common functionality:

### Core Properties

```ts
// Basic texture properties
console.log(texture.width);     // Texture width in pixels
console.log(texture.height);    // Texture height in pixels
console.log(texture.format);    // Texture format (e.g., R8G8B8A8)
console.log(texture.mipmapCount); // Number of mipmap levels

// Texture sampling configuration
texture.filterMode = TextureFilterMode.Trilinear; // Point, Bilinear, Trilinear
texture.wrapModeU = TextureWrapMode.Repeat;       // Clamp, Repeat, Mirror
texture.wrapModeV = TextureWrapMode.Clamp;
texture.anisoLevel = 8; // Anisotropic filtering level (1-16)

// Advanced properties
texture.name = "DiffuseTexture";                  // Debug name
console.log(texture.usage);                      // Texture usage flags
console.log(texture.isSRGBColorSpace);          // sRGB color space flag
```

### Mipmap Management

```ts
// Generate mipmaps automatically
texture.generateMipmaps();

// Check mipmap count
console.log(`Texture has ${texture.mipmapCount} mipmap levels`);

// Access maximum mipmap level (last valid mip index)
const maxMipLevel = Math.max(0, texture.mipmapCount - 1);
console.log(`Highest mip level index: ${maxMipLevel}`);
```

### Advanced Texture Properties

```ts
// Color space handling
if (texture.isSRGBColorSpace) {
  console.log("Texture uses sRGB color space - automatic gamma correction");
} else {
  console.log("Texture uses linear color space - for normal maps, data textures");
}

// Check texture format capabilities
console.log(`Format: ${texture.format}`);
console.log(`Supports mipmaps: ${texture.mipmapCount > 1}`);
```

## Texture2D

Standard 2D textures for most rendering applications:

### Creation and Initialization

```ts
// Create empty texture
const texture = new Texture2D(
  engine,
  1024,        // width
  1024,        // height
  TextureFormat.R8G8B8A8, // format
  true         // generate mipmaps
);

// Create texture with sRGB color space control
const linearTexture = new Texture2D(
  engine, 512, 512,
  TextureFormat.R8G8B8A8,
  false,  // no mipmaps
  false   // linear color space (for normal maps, etc.)
);
```

### Loading Image Data

```ts
// From HTML Image Element
const image = new Image();
image.onload = () => {
  texture.setImageSource(
    image,
    0,      // mipLevel
    false,  // flipY
    false   // premultiplyAlpha
  );
  texture.generateMipmaps(); // Generate mipmaps after setting image
};
image.src = "texture.jpg";

// From Canvas
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
// ... draw to canvas ...
texture.setImageSource(canvas);

// From Video Element (for dynamic textures)
const video = document.getElementsByTagName("video")[0];
texture.setImageSource(video); // Call this in update loop for video

// From Raw Pixel Data
const texture1x1 = new Texture2D(engine, 1, 1);
const redPixel = new Uint8Array([255, 0, 0, 255]); // RGBA
texture1x1.setPixelBuffer(redPixel);

// Read Pixel Data
const width = 256, height = 256;
const readTexture = new Texture2D(engine, width, height);
// ... set texture data ...
const pixelData = new Uint8Array(width * height * 4); // RGBA
readTexture.getPixelBuffer(0, 0, width, height, 0, pixelData);
texture.setImageSource(canvas);

// From ImageBitmap (for efficient loading)
const response = await fetch('texture.jpg');
const blob = await response.blob();
const imageBitmap = await createImageBitmap(blob);
texture.setImageSource(imageBitmap);
```

### Raw Pixel Data Management

```ts
// Set pixel data from typed array
const pixelData = new Uint8Array(width * height * 4); // RGBA
// ... fill pixel data ...
texture.setPixelBuffer(
  pixelData,
  0,        // mipLevel
  0, 0,     // x, y offset
  width,    // width
  height    // height
);

// Read pixel data back
const readBuffer = new Uint8Array(width * height * 4);
texture.getPixelBuffer(
  0,          // mipLevel
  0, 0,       // x, y
  width, height, // dimensions
  readBuffer
);
```

### HDR and Float Textures

```ts
// Create HDR texture
const hdrTexture = new Texture2D(
  engine, 512, 512, 
  TextureFormat.R16G16B16A16, // 16-bit per channel
  true
);

// 32-bit float texture for precision rendering
const floatTexture = new Texture2D(
  engine, 256, 256,
  TextureFormat.R32G32B32A32, // 32-bit float per channel
  false
);

// 11-11-10 packed float format for efficiency
const packedFloatTexture = new Texture2D(
  engine, 512, 512,
  TextureFormat.R11G11B10_UFloat,
  true
);
```

## TextureCube

Cube maps for environment mapping and skyboxes:

### Creation and Setup

```ts
// Create cube texture
const cubeTexture = new TextureCube(
  engine,
  256,                      // size (width/height of each face)
  TextureFormat.R8G8B8,     // format
  true                      // generate mipmaps
);

// Configure filtering for smooth environment mapping
cubeTexture.filterMode = TextureFilterMode.Trilinear;
cubeTexture.anisoLevel = 4;
```

### Loading Cube Map Faces

```ts
// Define face images
const faceImages = [
  'positive_x.jpg', // Right
  'negative_x.jpg', // Left  
  'positive_y.jpg', // Top
  'negative_y.jpg', // Bottom
  'positive_z.jpg', // Front
  'negative_z.jpg'  // Back
];

// Load each face
faceImages.forEach((imagePath, faceIndex) => {
  const image = new Image();
  image.onload = () => {
    cubeTexture.setImageSource(
      image,
      faceIndex as TextureCubeFace, // face index
      0,     // mipLevel
      false, // flipY
      false  // premultiplyAlpha
    );
    
    // Generate mipmaps after all faces are loaded
    if (faceIndex === 5) {
      cubeTexture.generateMipmaps();
    }
  };
  image.src = imagePath;
});
```

### Face-Specific Operations

```ts
import { TextureCubeFace } from "@galacean/engine";

// Set individual faces
cubeTexture.setImageSource(rightImage, TextureCubeFace.PositiveX);
cubeTexture.setImageSource(leftImage, TextureCubeFace.NegativeX);
cubeTexture.setImageSource(topImage, TextureCubeFace.PositiveY);
cubeTexture.setImageSource(bottomImage, TextureCubeFace.NegativeY);
cubeTexture.setImageSource(frontImage, TextureCubeFace.PositiveZ);
cubeTexture.setImageSource(backImage, TextureCubeFace.NegativeZ);

// Read pixel data from specific face
const facePixels = new Uint8Array(256 * 256 * 3);
cubeTexture.getPixelBuffer(
  TextureCubeFace.PositiveX, // face
  0,                         // mipLevel
  0, 0, 256, 256,           // region
  facePixels
);
```

### Environment Mapping Usage

```ts
// Use cube texture for skybox
const skyboxMaterial = new SkyBoxMaterial(engine);
skyboxMaterial.textureCubeMap = cubeTexture;

// Use for environment reflection
const pbrMaterial = new PBRMaterial(engine);
pbrMaterial.envMapTexture = cubeTexture;
pbrMaterial.envMapIntensity = 1.0;
```

## RenderTarget

Frame buffers for render-to-texture operations:

### Basic Render Target Creation

```ts
// Create basic render target
const renderTarget = new RenderTarget(
  engine,
  1024,                    // width
  1024,                    // height
  TextureFormat.R8G8B8A8   // color format
);

// With depth buffer
const renderTargetWithDepth = new RenderTarget(
  engine, 512, 512,
  TextureFormat.R8G8B8A8,           // color format
  TextureFormat.Depth,              // depth format
  true                              // anti-aliasing
);
```

### Multi-Render Target (MRT)

```ts
// Create MRT with multiple color attachments
const mrtTarget = new RenderTarget(
  engine, 1024, 1024,
  TextureFormat.R8G8B8A8,     // color attachment 0
  TextureFormat.Depth24,      // depth format
  false,                      // no anti-aliasing
  2                           // 2 color attachments
);

// Access color textures
const colorTexture0 = mrtTarget.getColorTexture(0);
const colorTexture1 = mrtTarget.getColorTexture(1);
const depthTexture = mrtTarget.depthTexture;
```

### Render Target Configuration

```ts
// Configure automatic mipmap generation
renderTarget.autoGenerateMipmaps = true;

// Manual mipmap generation
renderTarget.generateMipmaps();

// Check properties
console.log(`Render target size: ${renderTarget.width}x${renderTarget.height}`);
console.log(`Color attachments: ${renderTarget.colorTextureCount}`);
console.log(`Has depth: ${renderTarget.depthTexture ? 'Yes' : 'No'}`);
console.log(`Anti-aliasing: ${renderTarget.antiAliasing}`);
```

### Using Render Targets for Post-Processing

```ts
// Create post-processing pipeline
const sceneRT = new RenderTarget(engine, 1920, 1080, TextureFormat.R16G16B16A16);
const blurRT = new RenderTarget(engine, 960, 540, TextureFormat.R16G16B16A16);

// Setup camera to render to texture
camera.renderTarget = sceneRT;

// Post-processing chain
class PostProcessSystem extends Script {
  onEndRender(camera: Camera): void {
    if (camera.renderTarget === sceneRT) {
      // Apply blur effect
      this.applyBlur(sceneRT.getColorTexture(0), blurRT);
      
      // Final composite to screen
      this.composite(blurRT.getColorTexture(0));
    }
  }
  
  private applyBlur(inputTexture: Texture2D, outputRT: RenderTarget): void {
    // Blur shader implementation
    const blurMaterial = new Material(engine, blurShader);
    blurMaterial.shaderData.setTexture("inputTexture", inputTexture);
    
    // Render fullscreen quad to blur RT
    camera.renderTarget = outputRT;
    this.renderFullscreenQuad(blurMaterial);
  }
}
```

## Texture Formats

Comprehensive format support for different use cases:

### Standard Color Formats

```ts
// 8-bit formats
TextureFormat.R8G8B8A8     // Standard RGBA, 32 bits total
TextureFormat.R8G8B8       // RGB without alpha, 24 bits
TextureFormat.R8           // Single channel, 8 bits
TextureFormat.R8G8         // Two channel, 16 bits

// Compact formats
TextureFormat.R5G6B5       // 16-bit RGB, good for mobile
TextureFormat.R4G4B4A4     // 16-bit RGBA, lower quality
TextureFormat.R5G5B5A1     // 16-bit RGBA with 1-bit alpha

// HDR formats
TextureFormat.R16G16B16A16    // 16-bit per channel, HDR
TextureFormat.R32G32B32A32    // 32-bit float per channel
TextureFormat.R11G11B10_UFloat // Packed 32-bit HDR format
```

### Compressed Formats

```ts
// Desktop compression (DirectX)
TextureFormat.BC1          // DXT1, RGB compression, 4 bits/pixel
TextureFormat.BC3          // DXT5, RGBA compression, 8 bits/pixel  
TextureFormat.BC7          // High quality RGBA compression
TextureFormat.BC6H         // HDR compression

// Mobile compression (OpenGL ES)
TextureFormat.ETC1_RGB     // ETC1 RGB compression
TextureFormat.ETC2_RGB     // ETC2 RGB compression
TextureFormat.ETC2_RGBA8   // ETC2 RGBA compression

// iOS compression
TextureFormat.PVRTC_RGB4   // PowerVR RGB, 4 bits/pixel
TextureFormat.PVRTC_RGBA4  // PowerVR RGBA, 4 bits/pixel

// Universal compression
TextureFormat.ASTC_4x4     // ASTC 4x4 block compression
TextureFormat.ASTC_8x8     // ASTC 8x8 block compression
```

### Depth and Stencil Formats

```ts
// Depth formats
TextureFormat.Depth        // Automatic depth precision
TextureFormat.Depth16      // 16-bit depth
TextureFormat.Depth24      // 24-bit depth
TextureFormat.Depth32      // 32-bit depth

// Depth-stencil combined
TextureFormat.DepthStencil      // Automatic depth-stencil
TextureFormat.Depth24Stencil8   // 24-bit depth + 8-bit stencil
TextureFormat.Depth32Stencil8   // 32-bit depth + 8-bit stencil

// Stencil only
TextureFormat.Stencil      // 8-bit stencil buffer
```

## Texture Filtering and Sampling

Control how textures are sampled during rendering:

### Filter Modes

```ts
// Point filtering - nearest neighbor, pixelated look
texture.filterMode = TextureFilterMode.Point;

// Bilinear filtering - smooth but can be blurry
texture.filterMode = TextureFilterMode.Bilinear;

// Trilinear filtering - smooth with mipmap blending
texture.filterMode = TextureFilterMode.Trilinear;

// Anisotropic filtering for improved quality at oblique angles
texture.anisoLevel = 16; // Maximum anisotropic filtering
```

### Wrap Modes

```ts
// Clamp to edge - prevents tiling artifacts
texture.wrapModeU = TextureWrapMode.Clamp;
texture.wrapModeV = TextureWrapMode.Clamp;

// Repeat tiling - texture repeats seamlessly
texture.wrapModeU = TextureWrapMode.Repeat;
texture.wrapModeV = TextureWrapMode.Repeat;

// Mirror repeat - texture mirrors each repetition
texture.wrapModeU = TextureWrapMode.Mirror;
texture.wrapModeV = TextureWrapMode.Mirror;
```

### Sampling Quality Configuration

```ts
// High quality configuration for hero textures
const heroTexture = new Texture2D(engine, 2048, 2048, TextureFormat.R8G8B8A8, true);
heroTexture.filterMode = TextureFilterMode.Trilinear;
heroTexture.anisoLevel = 16;
heroTexture.wrapModeU = TextureWrapMode.Repeat;
heroTexture.wrapModeV = TextureWrapMode.Repeat;

// Performance configuration for background textures
const backgroundTexture = new Texture2D(engine, 512, 512, TextureFormat.R5G6B5, false);
backgroundTexture.filterMode = TextureFilterMode.Bilinear;
backgroundTexture.anisoLevel = 1;
backgroundTexture.wrapModeU = TextureWrapMode.Clamp;
backgroundTexture.wrapModeV = TextureWrapMode.Clamp;
```

## Advanced Texture Techniques

### Texture Streaming and LOD

```ts
class TextureStreamer extends Script {
  private lodTextures: Texture2D[] = [];
  private currentLOD = 0;
  
  onAwake(): void {
    // Create multiple LOD levels
    const sizes = [2048, 1024, 512, 256];
    sizes.forEach((size, index) => {
      const lodTexture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8, true);
      this.lodTextures[index] = lodTexture;
    });
  }
  
  updateLOD(distanceToCamera: number): void {
    let newLOD = 0;
    if (distanceToCamera > 100) newLOD = 3;      // 256x256
    else if (distanceToCamera > 50) newLOD = 2;  // 512x512  
    else if (distanceToCamera > 20) newLOD = 1;  // 1024x1024
    else newLOD = 0;                             // 2048x2048
    
    if (newLOD !== this.currentLOD) {
      this.currentLOD = newLOD;
      const material = this.entity.getComponent(MeshRenderer).material;
      material.baseTexture = this.lodTextures[newLOD];
    }
  }
}
```

### Procedural Texture Generation

```ts
class ProceduralTexture {
  static generateNoiseTexture(engine: Engine, size: number): Texture2D {
    const texture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8, true);
    const pixelData = new Uint8Array(size * size * 4);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const noise = this.perlinNoise(x / size, y / size);
        const value = Math.floor((noise + 1) * 127.5); // Map [-1,1] to [0,255]
        
        pixelData[index] = value;     // R
        pixelData[index + 1] = value; // G  
        pixelData[index + 2] = value; // B
        pixelData[index + 3] = 255;   // A
      }
    }
    
    texture.setPixelBuffer(pixelData);
    texture.generateMipmaps();
    return texture;
  }
  
  static generateGradientTexture(engine: Engine, width: number, height: number): Texture2D {
    const texture = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8, false);
    const pixelData = new Uint8Array(width * height * 4);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const gradientX = x / (width - 1);
        const gradientY = y / (height - 1);
        
        pixelData[index] = Math.floor(gradientX * 255);     // R
        pixelData[index + 1] = Math.floor(gradientY * 255); // G
        pixelData[index + 2] = 0;                           // B
        pixelData[index + 3] = 255;                         // A
      }
    }
    
    texture.setPixelBuffer(pixelData);
    return texture;
  }
  
  private static perlinNoise(x: number, y: number): number {
    // Simplified Perlin noise implementation
    return Math.sin(x * 10) * Math.cos(y * 10) * 0.5;
  }
}
```

### Texture Atlas Management

```ts
class TextureAtlas {
  private atlas: Texture2D;
  private regions: Map<string, { x: number, y: number, width: number, height: number }> = new Map();
  
  constructor(engine: Engine, size: number) {
    this.atlas = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8, true);
  }
  
  addTexture(name: string, image: HTMLImageElement, x: number, y: number): void {
    // Add texture to atlas at specified position
    this.atlas.setImageSource(image, 0, false, false, x, y);
    
    // Store region information
    this.regions.set(name, {
      x: x / this.atlas.width,
      y: y / this.atlas.height,
      width: image.width / this.atlas.width,
      height: image.height / this.atlas.height
    });
  }
  
  getUVRegion(name: string): { x: number, y: number, width: number, height: number } | null {
    return this.regions.get(name) || null;
  }
  
  generateMipmaps(): void {
    this.atlas.generateMipmaps();
  }
}

// Usage
const atlas = new TextureAtlas(engine, 1024);
atlas.addTexture("grass", grassImage, 0, 0);
atlas.addTexture("rock", rockImage, 256, 0);
atlas.addTexture("dirt", dirtImage, 512, 0);
atlas.generateMipmaps();
```

## Performance Optimization

### Memory Management

```ts
class TextureManager {
  private textureCache = new Map<string, Texture2D>();
  private maxCacheSize = 50;
  
  loadTexture(path: string): Promise<Texture2D> {
    // Check cache first
    if (this.textureCache.has(path)) {
      return Promise.resolve(this.textureCache.get(path)!);
    }
    
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const texture = new Texture2D(engine, image.width, image.height, TextureFormat.R8G8B8A8, true);
        texture.setImageSource(image);
        texture.generateMipmaps();
        
        // Add to cache with LRU eviction
        this.addToCache(path, texture);
        resolve(texture);
      };
      image.onerror = reject;
      image.src = path;
    });
  }
  
  private addToCache(path: string, texture: Texture2D): void {
    if (this.textureCache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.textureCache.keys().next().value;
      const oldTexture = this.textureCache.get(firstKey)!;
      oldTexture.destroy(); // Important: cleanup GPU resources
      this.textureCache.delete(firstKey);
    }
    
    this.textureCache.set(path, texture);
  }
  
  cleanup(): void {
    for (const texture of this.textureCache.values()) {
      texture.destroy();
    }
    this.textureCache.clear();
  }
}
```

### Format Selection Strategy

```ts
class TextureFormatSelector {
  static selectOptimalFormat(usage: 'diffuse' | 'normal' | 'ui' | 'hdr', platform: 'desktop' | 'mobile'): TextureFormat {
    switch (usage) {
      case 'diffuse':
        if (platform === 'mobile') {
          return TextureFormat.ETC2_RGB; // Compressed RGB for mobile
        } else {
          return TextureFormat.BC1; // Compressed RGB for desktop
        }
        
      case 'normal':
        if (platform === 'mobile') {
          return TextureFormat.ETC2_RGBA8; // Need alpha for normal maps
        } else {
          return TextureFormat.BC3; // DXT5 for desktop
        }
        
      case 'ui':
        return TextureFormat.R8G8B8A8; // Uncompressed for UI clarity
        
      case 'hdr':
        return TextureFormat.R11G11B10_UFloat; // Efficient HDR format
        
      default:
        return TextureFormat.R8G8B8A8;
    }
  }
}
```

### Mipmap Optimization

```ts
class MipmapOptimizer {
  static optimizeTextureForDistance(texture: Texture2D, viewingDistance: number): void {
    // Skip expensive operations for distant textures
    if (viewingDistance > 100) {
      texture.filterMode = TextureFilterMode.Bilinear;
      texture.anisoLevel = 1;
    } else if (viewingDistance > 50) {
      texture.filterMode = TextureFilterMode.Trilinear;
      texture.anisoLevel = 4;
    } else {
      texture.filterMode = TextureFilterMode.Trilinear;
      texture.anisoLevel = 16;
    }
  }
  
  static calculateOptimalMipmapLevel(textureSize: number, screenSize: number): number {
    const ratio = textureSize / screenSize;
    return Math.max(0, Math.floor(Math.log2(ratio)));
  }
}
```

## API Reference

```apidoc
Texture (Base Class):
  Properties:
    name: string
      - Debug name for the texture.
    width: number
      - Texture width in pixels (read-only).
    height: number  
      - Texture height in pixels (read-only).
    format: TextureFormat
      - Pixel format of the texture (read-only).
    mipmapCount: number
      - Number of mipmap levels (read-only).
    usage: TextureUsage
      - Usage flags for the texture (read-only).
    isSRGBColorSpace: boolean
      - Whether texture uses sRGB color space (read-only).
    filterMode: TextureFilterMode
      - Texture filtering mode (Point, Bilinear, Trilinear).
    wrapModeU: TextureWrapMode
      - Horizontal wrap mode (Clamp, Repeat, Mirror).
    wrapModeV: TextureWrapMode
      - Vertical wrap mode (Clamp, Repeat, Mirror).
    anisoLevel: number
      - Anisotropic filtering level (1-16).
    depthCompareFunction: TextureDepthCompareFunction
      - Depth comparison function for depth textures.

  Methods:
    generateMipmaps(): void
      - Generate mipmaps for the texture.

Texture2D extends Texture:
  Constructor:
    new Texture2D(engine: Engine, width: number, height: number, format?: TextureFormat, generateMipmaps?: boolean, usage?: TextureUsage)
      - Create new 2D texture with specified dimensions and format.

  Methods:
    setImageSource(imageSource: TexImageSource, mipLevel?: number, flipY?: boolean, premultiplyAlpha?: boolean, x?: number, y?: number): void
      - Set texture data from image source (Image, Canvas, ImageBitmap, etc.).
    setPixelBuffer(colorBuffer: ArrayBufferView, mipLevel?: number, x?: number, y?: number, width?: number, height?: number): void
      - Set texture data from raw pixel buffer.
    getPixelBuffer(mipLevel?: number, x?: number, y?: number, width?: number, height?: number, out?: ArrayBufferView): ArrayBufferView
      - Read pixel data from texture into buffer.

TextureCube extends Texture:
  Constructor:
    new TextureCube(engine: Engine, size: number, format?: TextureFormat, generateMipmaps?: boolean)
      - Create new cube texture with specified size and format.

  Methods:
    setImageSource(imageSource: TexImageSource, face: TextureCubeFace, mipLevel?: number, flipY?: boolean, premultiplyAlpha?: boolean): void
      - Set cube face data from image source.
    setPixelBuffer(colorBuffer: ArrayBufferView, face: TextureCubeFace, mipLevel?: number): void
      - Set cube face data from raw pixel buffer.
    getPixelBuffer(face: TextureCubeFace, mipLevel?: number, x?: number, y?: number, width?: number, height?: number, out?: ArrayBufferView): ArrayBufferView
      - Read pixel data from cube face into buffer.

RenderTarget extends RefObject:
  Constructor:
    new RenderTarget(engine: Engine, width: number, height: number, colorFormat?: TextureFormat, depthFormat?: TextureFormat, antiAliasing?: boolean, colorTextureCount?: number)
      - Create new render target with specified parameters.

  Properties:
    width: number
      - Render target width (read-only).
    height: number
      - Render target height (read-only).
    antiAliasing: boolean
      - Anti-aliasing enabled state (read-only).
    autoGenerateMipmaps: boolean
      - Whether to automatically generate mipmaps after rendering.
    colorTextureCount: number
      - Number of color attachments (read-only).
    depthTexture: Texture2D | null
      - Depth texture attachment (read-only).

  Methods:
    getColorTexture(index?: number): Texture2D
      - Get color texture at specified index.
    generateMipmaps(): void
      - Manually generate mipmaps for all color attachments.

Enums:
  TextureFormat:
    - Standard formats: R8G8B8A8, R8G8B8, R5G6B5, R4G4B4A4, etc.
    - HDR formats: R16G16B16A16, R32G32B32A32, R11G11B10_UFloat
    - Compressed formats: BC1, BC3, BC7, ETC2_RGB, ASTC_4x4, etc.
    - Depth formats: Depth, Depth16, Depth24, Depth32, DepthStencil

  TextureFilterMode:
    - Point: Nearest neighbor filtering
    - Bilinear: Linear filtering
    - Trilinear: Linear filtering with mipmap blending

  TextureWrapMode:
    - Clamp: Clamp to edge pixels
    - Repeat: Repeat texture coordinates
    - Mirror: Mirror repeat texture coordinates

  TextureCubeFace:
    - PositiveX, NegativeX, PositiveY, NegativeY, PositiveZ, NegativeZ
```

## Best Practices

- **Choose Appropriate Formats**: Use compressed formats on mobile devices and for large textures to save memory
- **Generate Mipmaps**: Always generate mipmaps for textures that will be viewed at different distances
- **Optimize Filtering**: Use trilinear filtering for important textures, bilinear for less critical ones
- **Power of Two Sizes**: Use power-of-two dimensions (256, 512, 1024) for optimal GPU performance
- **Texture Atlasing**: Combine small textures into atlases to reduce draw calls
- **Memory Management**: Properly destroy textures when no longer needed to prevent memory leaks
- **LOD Systems**: Implement texture LOD systems for large worlds to manage memory usage
- **Async Loading**: Load textures asynchronously to prevent frame drops
- **Format Selection**: Choose the minimal format that provides acceptable quality
- **Anisotropic Filtering**: Use anisotropic filtering judiciously as it has performance costs

## Common Issues

**Memory Management**: Textures are automatically managed by the engine's resource system:
```ts
// Load texture through ResourceManager for automatic management
const texture = await engine.resourceManager.load<Texture2D>({
  url: "texture.jpg",
  type: AssetType.Texture2D
});

// Manual garbage collection when needed
engine.resourceManager.gc();
```

**Color Space Issues**: Use correct color space for different texture types:
```ts
// sRGB for color textures (default)
const colorTexture = new Texture2D(engine, 512, 512, TextureFormat.R8G8B8A8, true, true);

// Linear for data textures (normal maps, etc.)
const normalTexture = new Texture2D(engine, 512, 512, TextureFormat.R8G8B8A8, true, false);
```

**Premature Mipmap Generation**: Generate mipmaps only after all texture data is uploaded:
```ts
// Wrong - generates mipmaps before data is set
texture.generateMipmaps();
texture.setImageSource(image);

// Correct - generate mipmaps after data
texture.setImageSource(image);
texture.generateMipmaps();
```

**Texture Size Limits**: Respect platform texture size limits:
```ts
const maxTextureSize = engine.capabilities.maxTextureSize;
const size = Math.min(requestedSize, maxTextureSize);
```
