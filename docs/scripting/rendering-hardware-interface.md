# Rendering Hardware Interface

Galacean's Rendering Hardware Interface (RHI) provides a comprehensive abstraction layer over graphics APIs, primarily WebGL 1.0 and WebGL 2.0. The RHI system enables cross-platform rendering by abstracting hardware-specific operations, managing GPU resources, and providing capability detection for optimal performance across different devices.

The RHI system includes:
- **WebGLGraphicDevice**: Main graphics device abstraction for WebGL
- **Hardware Capability Detection**: Runtime detection of GPU features and extensions
- **Platform Resource Management**: Abstracted GPU resource creation and management
- **Render State Management**: Centralized graphics pipeline state control
- **Extension System**: Dynamic loading and management of WebGL extensions

## Quick Start

```ts
import { WebGLEngine, WebGLGraphicDevice, GLCapabilityType } from "@galacean/engine";

// Create WebGL engine with hardware renderer
const engine = await WebGLEngine.create({
  canvas: "canvas",
  graphicDeviceOptions: {
    webGLMode: WebGLMode.Auto, // Auto-detect WebGL2 or fallback to WebGL1
    alpha: true,
    antialias: true,
    depth: true,
    stencil: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false
  }
});

// Access hardware renderer (internal API)
const hardwareRenderer = engine._hardwareRenderer as WebGLGraphicDevice;
const gl = hardwareRenderer.gl;

// Check hardware capabilities
const capabilities = hardwareRenderer.capability;
console.log("WebGL2 supported:", hardwareRenderer.isWebGL2);
console.log("Max texture size:", capabilities.maxTextureSize);
console.log("Max anisotropic filtering:", capabilities.maxAnisoLevel);

// Check specific features
if (capabilities.canIUse(GLCapabilityType.depthTexture)) {
  console.log("Depth textures supported");
}

if (capabilities.canIUse(GLCapabilityType.textureFloat)) {
  console.log("Float textures supported");
}

engine.run();
```

## WebGLGraphicDevice

The `WebGLGraphicDevice` is the core hardware abstraction that manages the WebGL context and provides platform-agnostic rendering operations:

```ts
import { WebGLGraphicDevice, WebGLMode } from "@galacean/engine";

// Create graphics device with specific options
const graphicDevice = new WebGLGraphicDevice({
  webGLMode: WebGLMode.WebGL2,  // Force WebGL2
  alpha: false,                 // Disable alpha channel
  antialias: true,             // Enable MSAA
  depth: true,                 // Enable depth buffer
  stencil: true,               // Enable stencil buffer
  powerPreference: "high-performance", // Request discrete GPU
  failIfMajorPerformanceCaveat: true   // Fail if software rendering
});

// Access WebGL context
const gl = graphicDevice.gl;
const isWebGL2 = graphicDevice.isWebGL2;

// Get context information
console.log("WebGL Version:", gl.getParameter(gl.VERSION));
console.log("GLSL Version:", gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
console.log("Vendor:", gl.getParameter(gl.VENDOR));
console.log("Renderer:", gl.getParameter(gl.RENDERER));
```

### Platform Resource Creation

```ts
// Create platform-specific resources
const mesh = new Mesh(engine);
const platformPrimitive = (engine._hardwareRenderer as WebGLGraphicDevice).createPlatformPrimitive(mesh);

const texture2D = new Texture2D(engine, 512, 512);
const platformTexture = (engine._hardwareRenderer as WebGLGraphicDevice).createPlatformTexture2D(texture2D);

const cubeTexture = new TextureCube(engine, 256);
const platformCubeTexture = (engine._hardwareRenderer as WebGLGraphicDevice).createPlatformTextureCube(cubeTexture);

const renderTarget = new RenderTarget(engine, 1024, 1024);
const platformRenderTarget = (engine._hardwareRenderer as WebGLGraphicDevice).createPlatformRenderTarget(renderTarget);

// Create buffers
const vertexBuffer = new Buffer(engine, 1024, BufferUsage.Static, BufferBindFlag.VertexBuffer);
const platformBuffer = (engine._hardwareRenderer as WebGLGraphicDevice).createPlatformBuffer(vertexBuffer);
```

## Hardware Capability Detection

The capability system provides runtime detection of GPU features and extensions:

```ts
import { GLCapabilityType } from "@galacean/engine";

const capabilities = (engine._hardwareRenderer as WebGLGraphicDevice).capability;

// Check WebGL extensions
const supportedFeatures = {
  // Texture features
  depthTextures: capabilities.canIUse(GLCapabilityType.depthTexture),
  floatTextures: capabilities.canIUse(GLCapabilityType.textureFloat),
  halfFloatTextures: capabilities.canIUse(GLCapabilityType.textureHalfFloat),
  anisotropicFiltering: capabilities.canIUse(GLCapabilityType.textureFilterAnisotropic),
  
  // Rendering features
  instancedRendering: capabilities.canIUse(GLCapabilityType.instancedArrays),
  vertexArrayObjects: capabilities.canIUse(GLCapabilityType.vertexArrayObject),
  multipleRenderTargets: capabilities.canIUse(GLCapabilityType.drawBuffers),
  
  // Shader features
  standardDerivatives: capabilities.canIUse(GLCapabilityType.standardDerivatives),
  shaderTextureLod: capabilities.canIUse(GLCapabilityType.shaderTextureLod),
  fragmentDepth: capabilities.canIUse(GLCapabilityType.fragDepth),
  
  // Compression formats
  s3tcCompression: capabilities.canIUse(GLCapabilityType.s3tc),
  etcCompression: capabilities.canIUse(GLCapabilityType.etc),
  astcCompression: capabilities.canIUse(GLCapabilityType.astc),
  pvrtcCompression: capabilities.canIUse(GLCapabilityType.pvrtc)
};

console.log("Supported features:", supportedFeatures);

// Get hardware limits
const limits = {
  maxTextureSize: capabilities.maxTextureSize,
  maxCubeMapTextureSize: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
  maxRenderBufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
  maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
  maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
  maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
  maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
  maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
  maxCombinedTextureImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
  maxAnisotropy: capabilities.maxAnisoLevel,
  maxMSAASamples: capabilities.maxAntiAliasing
};

console.log("Hardware limits:", limits);
```

### Adaptive Quality Settings

```ts
// Adapt rendering quality based on hardware capabilities
class AdaptiveQualityManager {
  private capabilities: GLCapability;
  
  constructor(engine: Engine) {
    this.capabilities = (engine._hardwareRenderer as WebGLGraphicDevice).capability;
  }
  
  getRecommendedSettings() {
    const settings = {
      shadowMapSize: 1024,
      msaaSamples: 1,
      anisotropicFiltering: 1,
      useFloatTextures: false,
      useInstancedRendering: false,
      maxLights: 4
    };
    
    // High-end device optimizations
    if (this.capabilities.maxTextureSize >= 4096) {
      settings.shadowMapSize = 2048;
    }
    
    if (this.capabilities.maxAntiAliasing >= 4) {
      settings.msaaSamples = 4;
    }
    
    if (this.capabilities.canIUse(GLCapabilityType.textureFilterAnisotropic)) {
      settings.anisotropicFiltering = Math.min(16, this.capabilities.maxAnisoLevel);
    }
    
    if (this.capabilities.canIUse(GLCapabilityType.textureFloat)) {
      settings.useFloatTextures = true;
    }
    
    if (this.capabilities.canIUse(GLCapabilityType.instancedArrays)) {
      settings.useInstancedRendering = true;
    }
    
    // Mobile device optimizations
    if (this.isMobileDevice()) {
      settings.shadowMapSize = Math.min(settings.shadowMapSize, 1024);
      settings.msaaSamples = 1;
      settings.maxLights = 2;
    }
    
    return settings;
  }
  
  private isMobileDevice(): boolean {
    const gl = this.capabilities.rhi.gl;
    const renderer = gl.getParameter(gl.RENDERER).toLowerCase();
    return renderer.includes('adreno') || 
           renderer.includes('mali') || 
           renderer.includes('powervr') ||
           renderer.includes('apple');
  }
}

// Usage
const qualityManager = new AdaptiveQualityManager(engine);
const settings = qualityManager.getRecommendedSettings();
console.log("Recommended settings:", settings);
```

## Extension Management

The extension system dynamically loads and manages WebGL extensions:

```ts
// Access extension manager
const extensions = (engine._hardwareRenderer as WebGLGraphicDevice).extensions;

// Require specific extensions
const depthTextureExt = extensions.requireExtension(GLCapabilityType.depthTexture);
const anisotropicExt = extensions.requireExtension(GLCapabilityType.textureFilterAnisotropic);
const instancedExt = extensions.requireExtension(GLCapabilityType.instancedArrays);

// Use extension features
if (depthTextureExt) {
  // Create depth texture
  const depthTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, depthTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, 1024, 1024, 0, 
                gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
}

if (anisotropicExt && anisotropicExt.TEXTURE_MAX_ANISOTROPY_EXT) {
  // Enable anisotropic filtering
  gl.texParameterf(gl.TEXTURE_2D, anisotropicExt.TEXTURE_MAX_ANISOTROPY_EXT, 16);
}

if (instancedExt) {
  // Use instanced rendering
  instancedExt.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 3, 100);
}
```

## Render State Management

The render state system provides centralized control over the graphics pipeline:

```ts
// Access render states
const renderStates = (engine._hardwareRenderer as WebGLGraphicDevice).renderStates;

// Get cached parameters
const maxTextureUnits = renderStates.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
const maxVertexAttribs = renderStates.getParameter(gl.MAX_VERTEX_ATTRIBS);

// Render states are automatically managed by materials and render pipeline
// But can be accessed for debugging or advanced use cases

// Example: Custom render state management
class CustomRenderState {
  private gl: WebGLRenderingContext;
  private savedStates: Map<string, any> = new Map();
  
  constructor(engine: Engine) {
    this.gl = (engine._hardwareRenderer as WebGLGraphicDevice).gl;
  }
  
  saveState(stateName: string) {
    switch (stateName) {
      case 'blend':
        this.savedStates.set('blend', {
          enabled: this.gl.isEnabled(this.gl.BLEND),
          srcRGB: this.gl.getParameter(this.gl.BLEND_SRC_RGB),
          dstRGB: this.gl.getParameter(this.gl.BLEND_DST_RGB),
          srcAlpha: this.gl.getParameter(this.gl.BLEND_SRC_ALPHA),
          dstAlpha: this.gl.getParameter(this.gl.BLEND_DST_ALPHA)
        });
        break;
      case 'depth':
        this.savedStates.set('depth', {
          enabled: this.gl.isEnabled(this.gl.DEPTH_TEST),
          func: this.gl.getParameter(this.gl.DEPTH_FUNC),
          mask: this.gl.getParameter(this.gl.DEPTH_WRITEMASK)
        });
        break;
    }
  }
  
  restoreState(stateName: string) {
    const state = this.savedStates.get(stateName);
    if (!state) return;
    
    switch (stateName) {
      case 'blend':
        if (state.enabled) {
          this.gl.enable(this.gl.BLEND);
        } else {
          this.gl.disable(this.gl.BLEND);
        }
        this.gl.blendFuncSeparate(state.srcRGB, state.dstRGB, state.srcAlpha, state.dstAlpha);
        break;
      case 'depth':
        if (state.enabled) {
          this.gl.enable(this.gl.DEPTH_TEST);
        } else {
          this.gl.disable(this.gl.DEPTH_TEST);
        }
        this.gl.depthFunc(state.func);
        this.gl.depthMask(state.mask);
        break;
    }
  }
}
```

## Platform Interfaces

The RHI defines platform-agnostic interfaces for GPU resources:

### IPlatformPrimitive

```ts
// Platform primitive interface for mesh rendering
interface IPlatformPrimitive {
  draw(shaderProgram: IPlatformShaderProgram, subPrimitive: SubMesh): void;
  destroy(): void;
}

// WebGL implementation
class GLPrimitive implements IPlatformPrimitive {
  private _vao: WebGLVertexArrayObject;
  private _indexBuffer: WebGLBuffer;

  draw(shaderProgram: IPlatformShaderProgram, subPrimitive: SubMesh): void {
    const gl = this.rhi.gl;

    // Bind vertex array object
    if (this.vao) {
      gl.bindVertexArray(this.vao);
    }

    // Draw indexed or non-indexed
    if (this.indexBuffer) {
      gl.drawElements(
        subPrimitive.topology,
        subPrimitive.count,
        gl.UNSIGNED_SHORT,
        subPrimitive.start * 2
      );
    } else {
      gl.drawArrays(
        subPrimitive.topology,
        subPrimitive.start,
        subPrimitive.count
      );
    }
  }

  destroy(): void {
    const gl = this.rhi.gl;
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
    }
  }
}
```

### IPlatformTexture

```ts
// Platform texture interfaces
interface IPlatformTexture2D {
  setPixelBuffer(
    colorBuffer: ArrayBufferView,
    mipLevel: number,
    x?: number,
    y?: number,
    width?: number,
    height?: number
  ): void;
  getPixelBuffer(out: ArrayBufferView, mipLevel: number): void;
  destroy(): void;
}

interface IPlatformTextureCube {
  setPixelBuffer(
    face: TextureCubeFace,
    colorBuffer: ArrayBufferView,
    mipLevel: number
  ): void;
  getPixelBuffer(
    face: TextureCubeFace,
    out: ArrayBufferView,
    mipLevel: number
  ): void;
  destroy(): void;
}

// Usage example
const texture2D = new Texture2D(engine, 512, 512, TextureFormat.R8G8B8A8);
const platformTexture = (engine._hardwareRenderer as WebGLGraphicDevice).createPlatformTexture2D(texture2D);

// Upload pixel data
const pixelData = new Uint8Array(512 * 512 * 4);
// ... fill pixel data
platformTexture.setPixelBuffer(pixelData, 0);

// Read pixel data
const readBuffer = new Uint8Array(512 * 512 * 4);
platformTexture.getPixelBuffer(readBuffer, 0);
```

### IPlatformRenderTarget

```ts
// Platform render target interface
interface IPlatformRenderTarget {
  activeRenderTarget(mipLevel: number, faceIndex?: TextureCubeFace): void;
  blitRenderTarget(): void;
  destroy(): void;
}

// Usage for cube texture rendering
const cubeRenderTarget = new RenderTarget(
  engine,
  256,
  256,
  new TextureCube(engine, 256)
);

const platformRT = (engine._hardwareRenderer as WebGLGraphicDevice).createPlatformRenderTarget(cubeRenderTarget);

// Render to each face of the cube
for (let face = 0; face < 6; face++) {
  platformRT.activeRenderTarget(0, face as TextureCubeFace);

  // Render scene from cube face perspective
  camera.render(face as TextureCubeFace);
}
```

## Performance Monitoring

Monitor hardware performance and resource usage:

```ts
class HardwarePerformanceMonitor {
  private gl: WebGLRenderingContext;
  private ext: any;
  private queries: Map<string, WebGLQuery> = new Map();

  constructor(engine: Engine) {
    const hardwareRenderer = engine._hardwareRenderer as WebGLGraphicDevice;
    this.gl = hardwareRenderer.gl;
    this.ext = hardwareRenderer.extensions.requireExtension('EXT_disjoint_timer_query_webgl2');
  }

  startTiming(name: string): void {
    if (!this.ext) return;

    const query = this.gl.createQuery();
    this.queries.set(name, query);
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
  }

  endTiming(name: string): void {
    if (!this.ext) return;

    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
  }

  getTimingResult(name: string): number | null {
    if (!this.ext) return null;

    const query = this.queries.get(name);
    if (!query) return null;

    const available = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE);
    if (available) {
      const timeElapsed = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT);
      return timeElapsed / 1000000; // Convert to milliseconds
    }

    return null;
  }

  getMemoryInfo(): any {
    const memoryInfo = (this.gl as any).getExtension('WEBGL_debug_renderer_info');
    if (memoryInfo) {
      return {
        vendor: this.gl.getParameter(memoryInfo.UNMASKED_VENDOR_WEBGL),
        renderer: this.gl.getParameter(memoryInfo.UNMASKED_RENDERER_WEBGL)
      };
    }
    return null;
  }

  getResourceUsage(): any {
    return {
      textureUnits: this.gl.getParameter(this.gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
      vertexAttribs: this.gl.getParameter(this.gl.MAX_VERTEX_ATTRIBS),
      uniformVectors: this.gl.getParameter(this.gl.MAX_VERTEX_UNIFORM_VECTORS),
      varyingVectors: this.gl.getParameter(this.gl.MAX_VARYING_VECTORS)
    };
  }
}

// Usage
const perfMonitor = new HardwarePerformanceMonitor(engine);

// Time GPU operations
perfMonitor.startTiming('shadowPass');
// ... render shadow pass
perfMonitor.endTiming('shadowPass');

// Get results later
const shadowTime = perfMonitor.getTimingResult('shadowPass');
if (shadowTime !== null) {
  console.log(`Shadow pass took ${shadowTime.toFixed(2)}ms`);
}
```

## Error Handling and Debugging

Comprehensive error handling for hardware operations:

```ts
class HardwareErrorHandler {
  private gl: WebGLRenderingContext;
  private debugExt: any;

  constructor(engine: Engine) {
    const hardwareRenderer = engine._hardwareRenderer as WebGLGraphicDevice;
    this.gl = hardwareRenderer.gl;
    this.debugExt = hardwareRenderer.extensions.requireExtension('WEBGL_debug_renderer_info');

    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    // Override WebGL methods to add error checking
    const originalDrawElements = this.gl.drawElements;
    this.gl.drawElements = (...args) => {
      const result = originalDrawElements.apply(this.gl, args);
      this.checkGLError('drawElements');
      return result;
    };

    const originalDrawArrays = this.gl.drawArrays;
    this.gl.drawArrays = (...args) => {
      const result = originalDrawArrays.apply(this.gl, args);
      this.checkGLError('drawArrays');
      return result;
    };
  }

  checkGLError(operation: string): boolean {
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) {
      const errorString = this.getErrorString(error);
      console.error(`WebGL Error in ${operation}: ${errorString} (${error})`);
      return false;
    }
    return true;
  }

  private getErrorString(error: number): string {
    switch (error) {
      case this.gl.INVALID_ENUM: return 'INVALID_ENUM';
      case this.gl.INVALID_VALUE: return 'INVALID_VALUE';
      case this.gl.INVALID_OPERATION: return 'INVALID_OPERATION';
      case this.gl.INVALID_FRAMEBUFFER_OPERATION: return 'INVALID_FRAMEBUFFER_OPERATION';
      case this.gl.OUT_OF_MEMORY: return 'OUT_OF_MEMORY';
      case this.gl.CONTEXT_LOST_WEBGL: return 'CONTEXT_LOST_WEBGL';
      default: return 'UNKNOWN_ERROR';
    }
  }

  validateFramebuffer(): boolean {
    const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
    if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
      console.error('Framebuffer not complete:', this.getFramebufferStatusString(status));
      return false;
    }
    return true;
  }

  private getFramebufferStatusString(status: number): string {
    switch (status) {
      case this.gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT: return 'INCOMPLETE_ATTACHMENT';
      case this.gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: return 'INCOMPLETE_MISSING_ATTACHMENT';
      case this.gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS: return 'INCOMPLETE_DIMENSIONS';
      case this.gl.FRAMEBUFFER_UNSUPPORTED: return 'UNSUPPORTED';
      default: return 'UNKNOWN_STATUS';
    }
  }

  getContextInfo(): any {
    return {
      version: this.gl.getParameter(this.gl.VERSION),
      shadingLanguageVersion: this.gl.getParameter(this.gl.SHADING_LANGUAGE_VERSION),
      vendor: this.gl.getParameter(this.gl.VENDOR),
      renderer: this.gl.getParameter(this.gl.RENDERER),
      unmaskedVendor: this.debugExt ?
        this.gl.getParameter(this.debugExt.UNMASKED_VENDOR_WEBGL) : 'Unknown',
      unmaskedRenderer: this.debugExt ?
        this.gl.getParameter(this.debugExt.UNMASKED_RENDERER_WEBGL) : 'Unknown'
    };
  }
}

// Usage
const errorHandler = new HardwareErrorHandler(engine);
console.log('WebGL Context Info:', errorHandler.getContextInfo());

// Check for errors after operations
if (!errorHandler.checkGLError('texture upload')) {
  console.error('Texture upload failed');
}
```

## API Reference

```apidoc
WebGLGraphicDevice:
  Properties:
    gl: WebGLRenderingContext | WebGL2RenderingContext
      - The WebGL rendering context.
    isWebGL2: boolean
      - Whether the context is WebGL2.
    capability: GLCapability
      - Hardware capability detection system.
    extensions: GLExtensions
      - WebGL extension management system.
    renderStates: GLRenderStates
      - Render state management system.

  Methods:
    createPlatformPrimitive(primitive: Mesh): IPlatformPrimitive
      - Create platform-specific primitive for mesh rendering.
    createPlatformTexture2D(texture2D: Texture2D): IPlatformTexture2D
      - Create platform-specific 2D texture.
    createPlatformTextureCube(textureCube: TextureCube): IPlatformTextureCube
      - Create platform-specific cube texture.
    createPlatformRenderTarget(renderTarget: RenderTarget): IPlatformRenderTarget
      - Create platform-specific render target.
    createPlatformBuffer(buffer: Buffer): IPlatformBuffer
      - Create platform-specific buffer.
    clear(clearFlags: CameraClearFlags, clearColor: Color): void
      - Clear render target with specified flags and color.
    drawPrimitive(primitive: IPlatformPrimitive, subPrimitive: SubMesh, shaderProgram: IPlatformShaderProgram): void
      - Draw primitive with shader program.

GLCapability:
  Properties:
    maxTextureSize: number
      - Maximum texture size supported by hardware.
    maxAnisoLevel: number
      - Maximum anisotropic filtering level.
    maxAntiAliasing: number
      - Maximum MSAA sample count.

  Methods:
    canIUse(capabilityType: GLCapabilityType): boolean
      - Check if specific capability is supported.

GLCapabilityType (Enum):
  Texture Capabilities:
    depthTexture, textureFloat, textureHalfFloat, textureFilterAnisotropic
  Rendering Capabilities:
    instancedArrays, vertexArrayObject, drawBuffers, multipleSample
  Shader Capabilities:
    standardDerivatives, shaderTextureLod, fragDepth, shaderVertexID
  Compression Formats:
    s3tc, etc, etc1, pvrtc, astc, bptc

GLExtensions:
  Methods:
    requireExtension(ext: GLCapabilityType): any
      - Get WebGL extension object if available.

IPlatformPrimitive:
  Methods:
    draw(shaderProgram: IPlatformShaderProgram, subPrimitive: SubMesh): void
      - Draw the primitive using specified shader and submesh.
    destroy(): void
      - Release GPU resources.

IPlatformTexture2D:
  Methods:
    setPixelBuffer(colorBuffer: ArrayBufferView, mipLevel: number, x?: number, y?: number, width?: number, height?: number): void
      - Upload pixel data to texture.
    getPixelBuffer(out: ArrayBufferView, mipLevel: number): void
      - Read pixel data from texture.
    destroy(): void
      - Release GPU resources.

IPlatformRenderTarget:
  Methods:
    activeRenderTarget(mipLevel: number, faceIndex?: TextureCubeFace): void
      - Activate render target for rendering.
    blitRenderTarget(): void
      - Blit render target contents.
    destroy(): void
      - Release GPU resources.

WebGLMode (Enum):
  Values:
    Auto = 0
      - Automatically detect best WebGL version.
    WebGL1 = 1
      - Force WebGL 1.0 context.
    WebGL2 = 2
      - Force WebGL 2.0 context.
```

## Context Loss Handling

Handle WebGL context loss gracefully:

```ts
class WebGLContextManager {
  private canvas: HTMLCanvasElement;
  private engine: WebGLEngine;
  private contextLostHandler: (event: Event) => void;
  private contextRestoredHandler: (event: Event) => void;

  constructor(engine: WebGLEngine) {
    this.engine = engine;
    this.canvas = engine.canvas.htmlCanvas as HTMLCanvasElement;

    this.setupContextLossHandling();
  }

  private setupContextLossHandling(): void {
    this.contextLostHandler = (event: Event) => {
      event.preventDefault();
      console.warn('WebGL context lost');

      // Pause engine
      this.engine.pause();

      // Notify application
      this.engine.dispatch('contextLost', event);
    };

    this.contextRestoredHandler = (event: Event) => {
      console.log('WebGL context restored');

      // Recreate resources
      this.recreateResources();

      // Resume engine
      this.engine.resume();

      // Notify application
      this.engine.dispatch('contextRestored', event);
    };

    this.canvas.addEventListener('webglcontextlost', this.contextLostHandler);
    this.canvas.addEventListener('webglcontextrestored', this.contextRestoredHandler);
  }

  private recreateResources(): void {
    // Resources need to be recreated after context restoration
    // This is typically handled automatically by the engine
    console.log('Recreating GPU resources...');

    // Force recreation of all GPU resources
    this.engine.resourceManager.recreateGPUResources();
  }

  forceContextLoss(): void {
    // For testing purposes
    const loseContext = (this.engine._hardwareRenderer as WebGLGraphicDevice).extensions
      .requireExtension('WEBGL_lose_context');

    if (loseContext) {
      loseContext.loseContext();
    }
  }

  destroy(): void {
    this.canvas.removeEventListener('webglcontextlost', this.contextLostHandler);
    this.canvas.removeEventListener('webglcontextrestored', this.contextRestoredHandler);
  }
}

// Usage
const contextManager = new WebGLContextManager(engine);

// Listen for context events
engine.on('contextLost', () => {
  console.log('Application: Context lost, showing loading screen');
});

engine.on('contextRestored', () => {
  console.log('Application: Context restored, hiding loading screen');
});
```

## Best Practices

- **Capability Detection**: Always check hardware capabilities before using advanced features
- **Graceful Degradation**: Provide fallbacks for unsupported features
- **Resource Management**: Properly destroy platform resources to prevent memory leaks
- **Error Handling**: Implement comprehensive WebGL error checking in development
- **Context Loss**: Handle WebGL context loss for robust applications
- **Performance Monitoring**: Use timing queries to identify performance bottlenecks
- **Extension Usage**: Check extension availability before using extension features
- **Mobile Optimization**: Adapt quality settings based on mobile GPU capabilities
- **Memory Awareness**: Monitor GPU memory usage, especially on mobile devices
- **Debugging**: Use WebGL debugging tools and extensions during development
