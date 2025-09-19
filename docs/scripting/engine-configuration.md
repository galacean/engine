# Engine Configuration

Galacean Engine provides comprehensive configuration options for initialization, performance tuning, and runtime behavior. This guide covers all available configuration parameters and best practices for different deployment scenarios.

## Engine Initialization

### Basic Configuration

```ts
import { WebGLEngine } from "@galacean/engine";

// Minimal configuration
const engine = await WebGLEngine.create({
  canvas: "canvas-id" // Canvas element ID or HTMLCanvasElement
});

// Canvas element reference
const canvasElement = document.getElementById("canvas") as HTMLCanvasElement;
const engine = await WebGLEngine.create({
  canvas: canvasElement
});

// OffscreenCanvas support (for Web Workers)
const offscreenCanvas = new OffscreenCanvas(800, 600);
const engine = await WebGLEngine.create({
  canvas: offscreenCanvas
});
```

### Complete Configuration Interface

```ts
interface WebGLEngineConfiguration {
  // Required: Canvas target
  canvas: HTMLCanvasElement | OffscreenCanvas | string;
  
  // Optional: Graphics device configuration
  graphicDeviceOptions?: WebGLGraphicDeviceOptions;
  
  // Optional: Color space configuration
  colorSpace?: ColorSpace;
  
  // Optional: Physics engine
  physics?: IPhysics;
  
  // Optional: XR device for VR/AR
  xrDevice?: IXRDevice;
  
  // Optional: Custom shader compilation system
  shaderLab?: IShaderLab;
  
  // Optional: Input system configuration
  input?: IInputOptions;
  
  // Optional: GLTF loader configuration
  gltf?: GLTFConfiguration;
  
  // Optional: KTX2 texture loader configuration
  ktx2Loader?: KTX2Configuration;
}
```

## Graphics Device Options

### WebGL Context Configuration

```ts
interface WebGLGraphicDeviceOptions {
  // WebGL version control
  webGLMode?: WebGLMode;                    // Auto, WebGL1, or WebGL2
  
  // Context creation parameters
  alpha?: boolean;                          // Alpha channel support
  depth?: boolean;                          // Depth buffer
  stencil?: boolean;                        // Stencil buffer
  antialias?: boolean;                      // MSAA anti-aliasing
  premultipliedAlpha?: boolean;             // Premultiplied alpha
  preserveDrawingBuffer?: boolean;          // Preserve buffer contents
  powerPreference?: WebGLPowerPreference;   // GPU selection preference
  failIfMajorPerformanceCaveat?: boolean;   // Fail on software rendering
  desynchronized?: boolean;                 // Low-latency mode
  xrCompatible?: boolean;                   // WebXR compatibility
  
  // Internal options (advanced)
  _forceFlush?: boolean;                    // Force command buffer flush
  _maxAllowSkinUniformVectorCount?: number; // Skinning uniform limit
}

// WebGL version modes
enum WebGLMode {
  Auto = 0,    // Prefer WebGL2, fallback to WebGL1
  WebGL2 = 1,  // Force WebGL2 (fail if not supported)
  WebGL1 = 2   // Force WebGL1
}

// GPU power preferences
type WebGLPowerPreference = "default" | "high-performance" | "low-power";
```

### Platform-Specific Configurations

```ts
import { SystemInfo, Platform } from "@galacean/engine";

// Adaptive configuration based on platform
const engine = await WebGLEngine.create({
  canvas: "canvas",
  graphicDeviceOptions: {
    // WebGL version selection
    webGLMode: SystemInfo.platform === Platform.iOS ? WebGLMode.WebGL2 : WebGLMode.Auto,
    
    // Performance optimizations
    powerPreference: SystemInfo.platform === Platform.Mac ? "high-performance" : "default",
    
    // Platform-specific features
    antialias: SystemInfo.platform !== Platform.Android, // Disable on Android for performance
    alpha: SystemInfo.platform === Platform.Web,         // Enable for web transparency
    
    // Memory optimizations
    preserveDrawingBuffer: false, // Disable for better performance
    
    // XR support
    xrCompatible: SystemInfo.platform === Platform.Web && 'xr' in navigator
  }
});
```

### Performance-Oriented Configuration

```ts
// High-performance configuration
const highPerformanceEngine = await WebGLEngine.create({
  canvas: "canvas",
  graphicDeviceOptions: {
    webGLMode: WebGLMode.WebGL2,           // Use latest WebGL
    powerPreference: "high-performance",   // Request discrete GPU
    alpha: false,                          // Disable alpha for performance
    antialias: false,                      // Disable MSAA (use FXAA instead)
    preserveDrawingBuffer: false,          // Don't preserve buffer
    desynchronized: true,                  // Enable low-latency mode
    failIfMajorPerformanceCaveat: true     // Fail on software rendering
  }
});

// Quality-oriented configuration
const qualityEngine = await WebGLEngine.create({
  canvas: "canvas",
  graphicDeviceOptions: {
    webGLMode: WebGLMode.Auto,
    powerPreference: "high-performance",
    alpha: true,                           // Enable alpha blending
    antialias: true,                       // Enable MSAA
    depth: true,                           // Enable depth buffer
    stencil: true,                         // Enable stencil operations
    premultipliedAlpha: true               // Correct alpha handling
  }
});
```

## Runtime Configuration

### Frame Rate and Timing Control

```ts
// V-sync based timing (recommended)
engine.vSyncCount = 1; // 60 FPS on 60Hz display
engine.vSyncCount = 2; // 30 FPS on 60Hz display
engine.vSyncCount = 0; // Disable V-sync

// Custom frame rate (when V-sync disabled)
engine.targetFrameRate = 60;   // Target 60 FPS
engine.targetFrameRate = 120;  // Target 120 FPS
engine.targetFrameRate = Number.POSITIVE_INFINITY; // Unlimited

// Adaptive frame rate based on performance
class AdaptiveFrameRate {
  private engine: Engine;
  private targetFrameTime = 16.67; // 60 FPS
  private frameTimeHistory: number[] = [];
  
  constructor(engine: Engine) {
    this.engine = engine;
  }
  
  update(): void {
    const frameTime = this.engine.time.deltaTime * 1000;
    this.frameTimeHistory.push(frameTime);
    
    if (this.frameTimeHistory.length > 60) {
      this.frameTimeHistory.shift();
    }
    
    const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
    
    if (avgFrameTime > this.targetFrameTime * 1.2) {
      // Performance too low, reduce target
      this.engine.targetFrameRate = Math.max(30, this.engine.targetFrameRate - 5);
    } else if (avgFrameTime < this.targetFrameTime * 0.8) {
      // Performance headroom, increase target
      this.engine.targetFrameRate = Math.min(120, this.engine.targetFrameRate + 5);
    }
  }
}
```

### Engine Lifecycle Management

```ts
// Engine state management
class EngineManager {
  private engine: Engine;
  private isInitialized = false;
  
  async initialize(config: WebGLEngineConfiguration): Promise<void> {
    if (this.isInitialized) {
      throw new Error("Engine already initialized");
    }
    
    this.engine = await WebGLEngine.create(config);
    this.isInitialized = true;
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Start render loop
    this.engine.run();
  }
  
  pause(): void {
    if (this.engine && !this.engine.isPaused) {
      this.engine.pause();
    }
  }
  
  resume(): void {
    if (this.engine && this.engine.isPaused) {
      this.engine.resume();
    }
  }
  
  destroy(): void {
    if (this.engine && !this.engine.destroyed) {
      this.engine.destroy();
      this.isInitialized = false;
    }
  }
  
  private setupEventListeners(): void {
    // Handle visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
      } else {
        this.resume();
      }
    });
    
    // Handle device context loss
    this.engine.on('devicelost', () => {
      console.warn('WebGL context lost');
    });
    
    this.engine.on('devicerestored', () => {
      console.log('WebGL context restored');
    });
  }
}
```

## Subsystem Configuration

### Physics Engine Configuration

```ts
import { PhysXPhysics, LitePhysics } from "@galacean/engine";

// PhysX physics (full-featured)
const physxEngine = await WebGLEngine.create({
  canvas: "canvas",
  physics: new PhysXPhysics()
});

// Lite physics (lightweight)
const liteEngine = await WebGLEngine.create({
  canvas: "canvas",
  physics: new LitePhysics()
});

// Conditional physics based on requirements
const physics = needsAdvancedPhysics ? new PhysXPhysics() : new LitePhysics();
const engine = await WebGLEngine.create({
  canvas: "canvas",
  physics: physics
});
```

### Input System Configuration

```ts
// Input configuration
const engine = await WebGLEngine.create({
  canvas: "canvas",
  input: {
    pointerTarget: document,           // Event listener target
    enablePointerLock: true,          // Enable pointer lock API
    enableGamepad: true,              // Enable gamepad support
    touchSensitivity: 1.0,            // Touch input sensitivity
    mouseSensitivity: 1.0             // Mouse input sensitivity
  }
});
```

### Loader Configuration

```ts
// GLTF loader configuration
const engine = await WebGLEngine.create({
  canvas: "canvas",
  gltf: {
    meshOpt: {
      workerCount: navigator.hardwareConcurrency || 4, // Use available CPU cores
      wasmUrl: "/path/to/meshopt_decoder.wasm"         // Custom WASM path
    }
  },
  ktx2Loader: {
    workerCount: 2,                                    // KTX2 worker threads
    wasmUrl: "/path/to/basis_transcoder.wasm"          // Custom transcoder path
  }
});
```

## Environment-Specific Configurations

### Development Configuration

```ts
// Development environment
const developmentConfig: WebGLEngineConfiguration = {
  canvas: "canvas",
  graphicDeviceOptions: {
    webGLMode: WebGLMode.Auto,
    alpha: true,                    // Enable for debugging
    preserveDrawingBuffer: true,    // Enable for screenshots
    failIfMajorPerformanceCaveat: false // Allow software rendering
  }
};
```

### Production Configuration

```ts
// Production environment
const productionConfig: WebGLEngineConfiguration = {
  canvas: "canvas",
  graphicDeviceOptions: {
    webGLMode: WebGLMode.Auto,
    alpha: false,                   // Optimize performance
    preserveDrawingBuffer: false,   // Optimize memory
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: true // Ensure hardware acceleration
  }
};
```

### Mobile-Optimized Configuration

```ts
// Mobile optimization
const mobileConfig: WebGLEngineConfiguration = {
  canvas: "canvas",
  graphicDeviceOptions: {
    webGLMode: WebGLMode.Auto,
    powerPreference: "low-power",   // Preserve battery
    antialias: false,               // Reduce GPU load
    alpha: false,                   // Optimize performance
    preserveDrawingBuffer: false    // Reduce memory usage
  }
};

// Apply mobile-specific settings
const engine = await WebGLEngine.create(mobileConfig);
engine.targetFrameRate = 30;       // Reduce frame rate for battery life
```

## Configuration Validation and Error Handling

```ts
class EngineConfigValidator {
  static validate(config: WebGLEngineConfiguration): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate canvas
    if (!config.canvas) {
      errors.push("Canvas is required");
    }
    
    // Validate WebGL support
    if (config.graphicDeviceOptions?.webGLMode === WebGLMode.WebGL2) {
      if (!this.isWebGL2Supported()) {
        errors.push("WebGL2 not supported on this device");
      }
    }
    
    // Performance warnings
    if (config.graphicDeviceOptions?.preserveDrawingBuffer) {
      warnings.push("preserveDrawingBuffer may impact performance");
    }
    
    return { errors, warnings, isValid: errors.length === 0 };
  }
  
  private static isWebGL2Supported(): boolean {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  }
}

// Usage
const config: WebGLEngineConfiguration = {
  canvas: "canvas",
  graphicDeviceOptions: {
    webGLMode: WebGLMode.WebGL2,
    preserveDrawingBuffer: true
  }
};

const validation = EngineConfigValidator.validate(config);
if (!validation.isValid) {
  console.error("Configuration errors:", validation.errors);
  return;
}

if (validation.warnings.length > 0) {
  console.warn("Configuration warnings:", validation.warnings);
}

const engine = await WebGLEngine.create(config);
```

This configuration system provides fine-grained control over engine behavior while maintaining reasonable defaults for most use cases. Choose configurations based on your specific performance requirements, target platforms, and feature needs.
