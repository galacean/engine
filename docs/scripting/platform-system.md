# Platform System

Galacean's platform system provides comprehensive cross-platform support and device information detection for web and mobile environments. The system includes platform detection, system information gathering, canvas abstraction, and device capability assessment to ensure optimal performance across different platforms and devices.

The platform system includes:
- **Platform Detection**: Automatic detection of operating systems and devices
- **SystemInfo**: Comprehensive system and hardware information gathering
- **Canvas Abstraction**: Platform-agnostic canvas management for rendering
- **Device Capabilities**: Runtime detection of device features and limitations
- **Cross-Platform Compatibility**: Unified API across different platforms

## Quick Start

```ts
import { WebGLEngine, SystemInfo, Platform } from "@galacean/engine";

// Create engine with platform-aware configuration
const engine = await WebGLEngine.create({
  canvas: "canvas",
  graphicDeviceOptions: {
    // Platform-specific optimizations
    antialias: SystemInfo.platform !== Platform.Android, // Disable on Android for performance
    powerPreference: SystemInfo.platform === Platform.Mac ? "high-performance" : "default"
  }
});

// Get platform information
console.log("Platform:", Platform[SystemInfo.platform]);
console.log("Operating System:", SystemInfo.operatingSystem);
console.log("Device Pixel Ratio:", SystemInfo.devicePixelRatio);

// Adapt behavior based on platform
if (SystemInfo.platform === Platform.IPhone || SystemInfo.platform === Platform.IPad) {
  console.log("Running on iOS device");
  // iOS-specific optimizations
} else if (SystemInfo.platform === Platform.Android) {
  console.log("Running on Android device");
  // Android-specific optimizations
} else if (SystemInfo.platform === Platform.Mac) {
  console.log("Running on Mac");
  // Desktop optimizations
}

engine.run();
```

## Platform Detection

The platform system automatically detects the current platform and operating system:

```ts
import { SystemInfo, Platform } from "@galacean/engine";

// Platform detection is automatic during engine initialization
SystemInfo.initialize();

// Check current platform
const currentPlatform = SystemInfo.platform;
const osInfo = SystemInfo.operatingSystem;

switch (currentPlatform) {
  case Platform.IPhone:
    console.log("iPhone detected:", osInfo); // e.g., "iPhone OS 15.0.0"
    break;
  case Platform.IPad:
    console.log("iPad detected:", osInfo); // e.g., "iPad OS 15.0.0"
    break;
  case Platform.Android:
    console.log("Android detected:", osInfo); // e.g., "Android 11.0.0"
    break;
  case Platform.Mac:
    console.log("Mac detected:", osInfo); // e.g., "Mac OS X 12.0.0"
    break;
  case Platform.Unknown:
    console.log("Unknown platform");
    break;
}

// Check if running in browser environment
if (typeof navigator !== "undefined") {
  console.log("Running in browser");
  console.log("User Agent:", navigator.userAgent);
} else {
  console.log("Running in non-browser environment");
}
```

### Platform-Specific Optimizations

```ts
// Adaptive configuration based on platform
class PlatformOptimizer {
  static getOptimalSettings() {
    const settings = {
      shadowMapSize: 1024,
      textureQuality: 1.0,
      particleCount: 1000,
      antialiasing: true,
      vsync: true
    };

    switch (SystemInfo.platform) {
      case Platform.IPhone:
      case Platform.IPad:
        // iOS optimizations
        settings.shadowMapSize = 512;
        settings.textureQuality = 0.8;
        settings.particleCount = 500;
        settings.antialiasing = false;
        break;

      case Platform.Android:
        // Android optimizations (more conservative)
        settings.shadowMapSize = 256;
        settings.textureQuality = 0.6;
        settings.particleCount = 300;
        settings.antialiasing = false;
        settings.vsync = false; // Reduce input lag
        break;

      case Platform.Mac:
        // Desktop optimizations
        settings.shadowMapSize = 2048;
        settings.textureQuality = 1.0;
        settings.particleCount = 2000;
        settings.antialiasing = true;
        break;
    }

    return settings;
  }

  static isMobile(): boolean {
    return SystemInfo.platform === Platform.IPhone ||
           SystemInfo.platform === Platform.IPad ||
           SystemInfo.platform === Platform.Android;
  }

  static isDesktop(): boolean {
    return SystemInfo.platform === Platform.Mac ||
           SystemInfo.platform === Platform.Unknown; // Assume desktop for unknown
  }

  static supportsAdvancedFeatures(): boolean {
    // Advanced features typically supported on desktop
    return this.isDesktop();
  }
}

// Usage
const settings = PlatformOptimizer.getOptimalSettings();
console.log("Optimal settings for platform:", settings);

if (PlatformOptimizer.isMobile()) {
  // Enable mobile-specific UI
  enableTouchControls();
  reducedQualityMode();
} else {
  // Enable desktop-specific features
  enableKeyboardShortcuts();
  highQualityMode();
}
```

## SystemInfo Capabilities

SystemInfo provides comprehensive system and hardware information:

```ts
// Device pixel ratio for high-DPI displays
const pixelRatio = SystemInfo.devicePixelRatio;
console.log("Device Pixel Ratio:", pixelRatio);

// Adjust canvas resolution based on pixel ratio
engine.canvas.resizeByClientSize(pixelRatio);

// SIMD support detection (for performance-critical operations)
const simdSupported = SystemInfo.detectSIMDSupported();
console.log("SIMD Supported:", simdSupported);

if (simdSupported) {
  // Enable SIMD-optimized math operations
  enableSIMDMath();
}

// WebP support detection (for texture compression)
SystemInfo.checkWebpSupported().then(webpSupported => {
  console.log("WebP Supported:", webpSupported);
  
  if (webpSupported) {
    // Use WebP textures for better compression
    setTextureFormat('webp');
  } else {
    // Fallback to PNG/JPEG
    setTextureFormat('png');
  }
});
```

### Advanced System Detection

```ts
class AdvancedSystemDetection {
  static getDetailedPlatformInfo() {
    const info = {
      platform: Platform[SystemInfo.platform],
      os: SystemInfo.operatingSystem,
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      hardwareConcurrency: navigator.hardwareConcurrency,
      maxTouchPoints: navigator.maxTouchPoints,
      deviceMemory: (navigator as any).deviceMemory, // Chrome only
      connection: (navigator as any).connection // Network Information API
    };

    return info;
  }

  static getScreenInfo() {
    return {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
      orientation: screen.orientation?.type
    };
  }

  static getPerformanceInfo() {
    const memory = (performance as any).memory;
    return {
      timing: performance.timing,
      navigation: performance.navigation,
      memory: memory ? {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      } : null
    };
  }

  static isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  static isRetina(): boolean {
    return SystemInfo.devicePixelRatio > 1;
  }

  static estimateDeviceClass(): 'low' | 'medium' | 'high' {
    const concurrency = navigator.hardwareConcurrency || 1;
    const memory = (navigator as any).deviceMemory || 1;
    
    if (concurrency >= 8 && memory >= 8) {
      return 'high';
    } else if (concurrency >= 4 && memory >= 4) {
      return 'medium';
    } else {
      return 'low';
    }
  }
}

// Usage
const platformInfo = AdvancedSystemDetection.getDetailedPlatformInfo();
const screenInfo = AdvancedSystemDetection.getScreenInfo();
const performanceInfo = AdvancedSystemDetection.getPerformanceInfo();

console.log("Platform Info:", platformInfo);
console.log("Screen Info:", screenInfo);
console.log("Performance Info:", performanceInfo);

const deviceClass = AdvancedSystemDetection.estimateDeviceClass();
console.log("Estimated Device Class:", deviceClass);

// Adapt quality based on device class
switch (deviceClass) {
  case 'high':
    setQualityLevel('ultra');
    break;
  case 'medium':
    setQualityLevel('high');
    break;
  case 'low':
    setQualityLevel('low');
    break;
}
```

## Canvas Management

The Canvas system provides platform-agnostic canvas management:

```ts
import { WebCanvas } from "@galacean/engine";

// Create canvas from HTML element
const htmlCanvas = document.getElementById('canvas') as HTMLCanvasElement;
const webCanvas = new WebCanvas(htmlCanvas);

// Access canvas properties
console.log("Canvas Width:", webCanvas.width);
console.log("Canvas Height:", webCanvas.height);
console.log("Canvas Scale:", webCanvas.scale);

// Resize canvas based on client size
webCanvas.resizeByClientSize(); // Uses window.devicePixelRatio
webCanvas.resizeByClientSize(2.0); // Custom pixel ratio

// Set custom scale
webCanvas.setScale(1.5, 1.5);

// Handle canvas size changes by responding to DOM events (example below)
```

### Responsive Canvas Management

```ts
class ResponsiveCanvasManager {
  private readonly canvas: WebCanvas;
  private readonly domCanvas: HTMLCanvasElement;
  private targetAspectRatio: number;
  private resizeObserver?: ResizeObserver;

  constructor(canvas: WebCanvas, domCanvas: HTMLCanvasElement, targetAspectRatio: number = 16 / 9) {
    this.canvas = canvas;
    this.domCanvas = domCanvas;
    this.targetAspectRatio = targetAspectRatio;
    this.setupResponsiveHandling();
  }

  private setupResponsiveHandling(): void {
    // Handle window resize
    window.addEventListener('resize', () => {
      this.updateCanvasSize();
    });

    // Handle orientation change on mobile
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this.updateCanvasSize();
      }, 100); // Delay to ensure orientation change is complete
    });

    // Use ResizeObserver for more precise detection
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateCanvasSize();
      });
      
      if (this.domCanvas.parentElement) {
        this.resizeObserver.observe(this.domCanvas.parentElement);
      }
    }

    // Initial size update
    this.updateCanvasSize();
  }

  private updateCanvasSize(): void {
    const container = this.domCanvas.parentElement;
    
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const containerAspectRatio = containerWidth / containerHeight;

    let canvasWidth, canvasHeight;

    if (containerAspectRatio > this.targetAspectRatio) {
      // Container is wider than target aspect ratio
      canvasHeight = containerHeight;
      canvasWidth = canvasHeight * this.targetAspectRatio;
    } else {
      // Container is taller than target aspect ratio
      canvasWidth = containerWidth;
      canvasHeight = canvasWidth / this.targetAspectRatio;
    }

    // Set CSS size
    this.domCanvas.style.width = `${canvasWidth}px`;
    this.domCanvas.style.height = `${canvasHeight}px`;

    // Update canvas resolution
    this.canvas.resizeByClientSize(SystemInfo.devicePixelRatio);
  }

  setAspectRatio(aspectRatio: number): void {
    this.targetAspectRatio = aspectRatio;
    this.updateCanvasSize();
  }

  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
}

// Usage
const canvasManager = new ResponsiveCanvasManager(engine.canvas, htmlCanvas, 16 / 9);

// Change aspect ratio dynamically
canvasManager.setAspectRatio(4/3); // Switch to 4:3 aspect ratio
```

## Platform-Specific Features

Handle platform-specific features and limitations:

```ts
class PlatformFeatureManager {
  static checkWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return !!gl;
    } catch (e) {
      return false;
    }
  }

  static checkWebGL2Support(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      return !!gl;
    } catch (e) {
      return false;
    }
  }

  static checkOffscreenCanvasSupport(): boolean {
    return typeof OffscreenCanvas !== 'undefined';
  }

  static checkWebAssemblySupport(): boolean {
    return typeof WebAssembly !== 'undefined';
  }

  static checkServiceWorkerSupport(): boolean {
    return 'serviceWorker' in navigator;
  }

  static checkWebRTCSupport(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  static checkGamepadSupport(): boolean {
    return 'getGamepads' in navigator;
  }

  static checkFullscreenSupport(): boolean {
    const element = document.documentElement;
    return !!(element.requestFullscreen ||
             (element as any).webkitRequestFullscreen ||
             (element as any).mozRequestFullScreen ||
             (element as any).msRequestFullscreen);
  }

  static checkPointerLockSupport(): boolean {
    const element = document.documentElement;
    return !!(element.requestPointerLock ||
             (element as any).webkitRequestPointerLock ||
             (element as any).mozRequestPointerLock);
  }

  static getFeatureSupport() {
    return {
      webgl: this.checkWebGLSupport(),
      webgl2: this.checkWebGL2Support(),
      offscreenCanvas: this.checkOffscreenCanvasSupport(),
      webAssembly: this.checkWebAssemblySupport(),
      serviceWorker: this.checkServiceWorkerSupport(),
      webRTC: this.checkWebRTCSupport(),
      gamepad: this.checkGamepadSupport(),
      fullscreen: this.checkFullscreenSupport(),
      pointerLock: this.checkPointerLockSupport()
    };
  }
}

// Usage
const features = PlatformFeatureManager.getFeatureSupport();
console.log("Platform Features:", features);

// Conditional feature enablement
if (features.webgl2) {
  console.log("WebGL2 available - enabling advanced rendering");
  enableWebGL2Features();
} else if (features.webgl) {
  console.log("WebGL1 available - using compatibility mode");
  enableWebGL1Features();
} else {
  console.error("WebGL not supported");
  showWebGLNotSupportedMessage();
}

if (features.gamepad) {
  enableGamepadSupport();
}

if (features.fullscreen) {
  showFullscreenButton();
}
```

## Mobile Platform Handling

Special handling for mobile platforms and touch devices:

```ts
class MobilePlatformHandler {
  private static touchStartTime: number = 0;
  private static preventZoom: boolean = true;

  static setupMobileOptimizations(): void {
    if (!this.isMobile()) return;

    // Prevent zoom on double tap
    if (this.preventZoom) {
      this.preventMobileZoom();
    }

    // Handle orientation changes
    this.handleOrientationChange();

    // Optimize for mobile performance
    this.applyMobilePerformanceSettings();

    // Handle mobile-specific events
    this.setupMobileEventHandlers();
  }

  private static preventMobileZoom(): void {
    // Prevent pinch zoom
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    }, { passive: false });

    // Prevent double-tap zoom
    document.addEventListener('touchstart', (e) => {
      this.touchStartTime = Date.now();
    });

    document.addEventListener('touchend', (e) => {
      const touchEndTime = Date.now();
      const touchDuration = touchEndTime - this.touchStartTime;

      if (touchDuration < 300) {
        e.preventDefault();
      }
    });

    // Add viewport meta tag if not present
    if (!document.querySelector('meta[name="viewport"]')) {
      const viewport = document.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.head.appendChild(viewport);
    }
  }

  private static handleOrientationChange(): void {
    window.addEventListener('orientationchange', () => {
      // Delay to ensure orientation change is complete
      setTimeout(() => {
        // Force canvas resize
        if (window.engine && window.engine.canvas) {
          window.engine.canvas.resizeByClientSize();
        }

        // Dispatch orientation change event
        window.dispatchEvent(new CustomEvent('engineOrientationChange', {
          detail: { orientation: screen.orientation?.type }
        }));
      }, 100);
    });
  }

  private static applyMobilePerformanceSettings(): void {
    // Reduce quality for mobile devices
    const settings = {
      shadowMapSize: 256,
      textureQuality: 0.5,
      particleCount: 100,
      antialiasing: false,
      vsync: false
    };

    // Apply settings to engine
    if (window.engine) {
      window.engine.settings.apply(settings);
    }
  }

  private static setupMobileEventHandlers(): void {
    // Handle app visibility changes (important for mobile)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // App went to background
        if (window.engine) {
          window.engine.pause();
        }
      } else {
        // App came to foreground
        if (window.engine) {
          window.engine.resume();
        }
      }
    });

    // Handle memory warnings (iOS Safari)
    window.addEventListener('pagehide', () => {
      if (window.engine) {
        window.engine.resourceManager.releaseUnusedResources();
      }
    });
  }

  static isMobile(): boolean {
    return SystemInfo.platform === Platform.IPhone ||
           SystemInfo.platform === Platform.IPad ||
           SystemInfo.platform === Platform.Android;
  }

  static isIOS(): boolean {
    return SystemInfo.platform === Platform.IPhone ||
           SystemInfo.platform === Platform.IPad;
  }

  static isAndroid(): boolean {
    return SystemInfo.platform === Platform.Android;
  }

  static getIOSVersion(): number[] | null {
    if (!this.isIOS()) return null;

    const match = SystemInfo.operatingSystem.match(/(\d+)\.(\d+)\.(\d+)/);
    return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : null;
  }

  static getAndroidVersion(): number[] | null {
    if (!this.isAndroid()) return null;

    const match = SystemInfo.operatingSystem.match(/(\d+)\.(\d+)\.(\d+)/);
    return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : null;
  }

  static supportsWebGL2(): boolean {
    if (this.isIOS()) {
      const version = this.getIOSVersion();
      return version ? version[0] >= 13 : false; // iOS 13+ supports WebGL2
    }

    if (this.isAndroid()) {
      const version = this.getAndroidVersion();
      return version ? version[0] >= 7 : false; // Android 7+ generally supports WebGL2
    }

    return true; // Assume desktop supports WebGL2
  }
}

// Usage
MobilePlatformHandler.setupMobileOptimizations();

if (MobilePlatformHandler.isMobile()) {
  console.log("Mobile platform detected");

  if (MobilePlatformHandler.isIOS()) {
    const version = MobilePlatformHandler.getIOSVersion();
    console.log("iOS version:", version);

    if (version && version[0] < 13) {
      console.log("Old iOS version - disabling WebGL2 features");
      disableWebGL2Features();
    }
  }

  if (MobilePlatformHandler.isAndroid()) {
    const version = MobilePlatformHandler.getAndroidVersion();
    console.log("Android version:", version);

    // Android-specific optimizations
    enableAndroidOptimizations();
  }
}
```

## Cross-Platform Asset Loading

Handle platform-specific asset loading and optimization:

```ts
class CrossPlatformAssetLoader {
  private static assetBaseUrl: string = './assets/';
  private static platformSuffix: string = '';

  static initialize(): void {
    // Set platform-specific asset suffix
    switch (SystemInfo.platform) {
      case Platform.IPhone:
      case Platform.IPad:
        this.platformSuffix = '_ios';
        break;
      case Platform.Android:
        this.platformSuffix = '_android';
        break;
      case Platform.Mac:
        this.platformSuffix = '_desktop';
        break;
      default:
        this.platformSuffix = '';
    }
  }

  static getAssetUrl(assetPath: string): string {
    const extension = assetPath.split('.').pop();
    const basePath = assetPath.substring(0, assetPath.lastIndexOf('.'));

    // Try platform-specific version first
    const platformSpecificPath = `${basePath}${this.platformSuffix}.${extension}`;

    return this.assetBaseUrl + platformSpecificPath;
  }

  static async loadTexture(path: string): Promise<string> {
    // Check WebP support for better compression
    const webpSupported = await SystemInfo.checkWebpSupported();

    if (webpSupported && !path.endsWith('.webp')) {
      const webpPath = path.replace(/\.(jpg|jpeg|png)$/i, '.webp');

      // Try to load WebP version first
      try {
        await this.checkAssetExists(this.getAssetUrl(webpPath));
        return this.getAssetUrl(webpPath);
      } catch {
        // Fallback to original format
      }
    }

    return this.getAssetUrl(path);
  }

  static async loadModel(path: string): Promise<string> {
    // Use different model formats based on platform capabilities
    if (SystemInfo.platform === Platform.Android) {
      // Use lower poly models for Android
      const lowPolyPath = path.replace('.gltf', '_low.gltf');

      try {
        await this.checkAssetExists(this.getAssetUrl(lowPolyPath));
        return this.getAssetUrl(lowPolyPath);
      } catch {
        // Fallback to original model
      }
    }

    return this.getAssetUrl(path);
  }

  static async loadAudio(path: string): Promise<string> {
    // Check audio format support
    const audio = new Audio();

    // Prefer OGG on desktop, AAC on mobile
    if (MobilePlatformHandler.isMobile()) {
      const aacPath = path.replace(/\.(mp3|ogg|wav)$/i, '.aac');

      if (audio.canPlayType('audio/aac')) {
        try {
          await this.checkAssetExists(this.getAssetUrl(aacPath));
          return this.getAssetUrl(aacPath);
        } catch {
          // Fallback to original format
        }
      }
    } else {
      const oggPath = path.replace(/\.(mp3|aac|wav)$/i, '.ogg');

      if (audio.canPlayType('audio/ogg')) {
        try {
          await this.checkAssetExists(this.getAssetUrl(oggPath));
          return this.getAssetUrl(oggPath);
        } catch {
          // Fallback to original format
        }
      }
    }

    return this.getAssetUrl(path);
  }

  private static async checkAssetExists(url: string): Promise<void> {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error(`Asset not found: ${url}`);
    }
  }

  static setAssetBaseUrl(url: string): void {
    this.assetBaseUrl = url.endsWith('/') ? url : url + '/';
  }
}

// Usage
CrossPlatformAssetLoader.initialize();
CrossPlatformAssetLoader.setAssetBaseUrl('https://cdn.example.com/assets/');

// Load platform-optimized assets
const textureUrl = await CrossPlatformAssetLoader.loadTexture('character.png');
const modelUrl = await CrossPlatformAssetLoader.loadModel('character.gltf');
const audioUrl = await CrossPlatformAssetLoader.loadAudio('background.mp3');

console.log("Loading assets:", { textureUrl, modelUrl, audioUrl });
```

## API Reference

```apidoc
SystemInfo:
  Static Properties:
    platform: Platform
      - The current platform (Android, IPhone, IPad, Mac, Unknown).
    operatingSystem: string
      - The operating system version string.
    devicePixelRatio: number
      - The pixel ratio of the device.

  Static Methods:
    detectSIMDSupported(): boolean
      - Check if WebAssembly SIMD is supported.
    checkWebpSupported(): Promise<boolean>
      - Check if WebP image format is supported.

Platform (Enum):
  Values:
    Android = 0
      - Android mobile platform.
    IPhone = 1
      - iPhone mobile platform.
    IPad = 2
      - iPad tablet platform.
    Mac = 3
      - Mac desktop platform.
    Unknown = 4
      - Unknown or unsupported platform.

Canvas / WebCanvas:
  Properties:
    width: number
      - Canvas width in pixels.
    height: number
      - Canvas height in pixels.
    scale: Vector2
      - Display scale factor for the HTML canvas element.

  Methods:
    resizeByClientSize(pixelRatio?: number): void
      - Resize canvas based on client size and pixel ratio.
    setScale(x: number, y: number): void
      - Apply CSS scaling for responsive layouts.

WebGLEngine:
  Static Methods:
    create(configuration: WebGLEngineConfiguration): Promise<WebGLEngine>
      - Create WebGL engine with platform-specific configuration.

WebGLEngineConfiguration:
  Properties:
    canvas: string | HTMLCanvasElement
      - Canvas element or ID for rendering.
    graphicDeviceOptions?: WebGLGraphicDeviceOptions
      - WebGL-specific rendering options.
```

## Performance Monitoring

Monitor platform-specific performance metrics:

```ts
class PlatformPerformanceMonitor {
  private frameCount: number = 0;
  private lastTime: number = 0;
  private fps: number = 0;
  private memoryUsage: any = {};
  private performanceObserver: PerformanceObserver | null = null;

  constructor() {
    this.setupPerformanceMonitoring();
  }

  private setupPerformanceMonitoring(): void {
    // FPS monitoring
    this.monitorFPS();

    // Memory monitoring
    this.monitorMemory();

    // Performance observer for detailed metrics
    if (typeof PerformanceObserver !== 'undefined') {
      this.setupPerformanceObserver();
    }
  }

  private monitorFPS(): void {
    const updateFPS = (currentTime: number) => {
      this.frameCount++;

      if (currentTime - this.lastTime >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
        this.frameCount = 0;
        this.lastTime = currentTime;

        // Trigger performance warnings
        this.checkPerformanceThresholds();
      }

      requestAnimationFrame(updateFPS);
    };

    requestAnimationFrame(updateFPS);
  }

  private monitorMemory(): void {
    if ((performance as any).memory) {
      setInterval(() => {
        const memory = (performance as any).memory;
        this.memoryUsage = {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          usedPercent: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
        };
      }, 1000);
    }
  }

  private setupPerformanceObserver(): void {
    this.performanceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();

      entries.forEach(entry => {
        if (entry.entryType === 'measure') {
          console.log(`Performance measure: ${entry.name} took ${entry.duration}ms`);
        }
      });
    });

    this.performanceObserver.observe({ entryTypes: ['measure', 'navigation'] });
  }

  private checkPerformanceThresholds(): void {
    const platform = SystemInfo.platform;
    let targetFPS = 60;
    let memoryWarningThreshold = 80;

    // Adjust thresholds based on platform
    if (platform === Platform.Android) {
      targetFPS = 30; // Lower target for Android
      memoryWarningThreshold = 70;
    } else if (platform === Platform.IPhone || platform === Platform.IPad) {
      targetFPS = 60;
      memoryWarningThreshold = 75;
    }

    // FPS warning
    if (this.fps < targetFPS * 0.8) {
      console.warn(`Low FPS detected: ${this.fps} (target: ${targetFPS})`);
      this.triggerPerformanceOptimization();
    }

    // Memory warning
    if (this.memoryUsage.usedPercent > memoryWarningThreshold) {
      console.warn(`High memory usage: ${this.memoryUsage.usedPercent.toFixed(1)}%`);
      this.triggerMemoryOptimization();
    }
  }

  private triggerPerformanceOptimization(): void {
    // Reduce quality settings
    if (window.engine) {
      const currentSettings = window.engine.settings;

      // Reduce shadow quality
      if (currentSettings.shadowMapSize > 256) {
        currentSettings.shadowMapSize = Math.max(256, currentSettings.shadowMapSize / 2);
      }

      // Reduce particle count
      if (currentSettings.particleCount > 100) {
        currentSettings.particleCount = Math.max(100, currentSettings.particleCount / 2);
      }

      // Disable antialiasing
      currentSettings.antialiasing = false;
    }
  }

  private triggerMemoryOptimization(): void {
    if (window.engine) {
      // Force garbage collection if available
      if ((window as any).gc) {
        (window as any).gc();
      }

      // Release unused resources
      window.engine.resourceManager.releaseUnusedResources();

      // Reduce texture quality
      window.engine.resourceManager.reduceTextureQuality();
    }
  }

  getPerformanceReport(): any {
    return {
      fps: this.fps,
      memory: this.memoryUsage,
      platform: Platform[SystemInfo.platform],
      devicePixelRatio: SystemInfo.devicePixelRatio,
      timestamp: Date.now()
    };
  }

  destroy(): void {
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
  }
}

// Usage
const perfMonitor = new PlatformPerformanceMonitor();

// Get performance report
setInterval(() => {
  const report = perfMonitor.getPerformanceReport();
  console.log("Performance Report:", report);

  // Send to analytics service
  sendAnalytics('performance', report);
}, 5000);
```

## Best Practices

- **Platform Detection**: Always check platform capabilities before enabling features
- **Responsive Design**: Implement responsive canvas management for different screen sizes
- **Mobile Optimization**: Apply mobile-specific optimizations for performance and battery life
- **Asset Loading**: Use platform-specific asset variants for optimal performance
- **Memory Management**: Monitor memory usage and implement cleanup strategies
- **Performance Monitoring**: Track FPS and memory usage to detect performance issues
- **Graceful Degradation**: Provide fallbacks for unsupported platform features
- **Touch Optimization**: Handle touch events and prevent unwanted zoom on mobile
- **Orientation Handling**: Properly handle device orientation changes
- **Context Management**: Handle app visibility changes and context loss gracefully

This comprehensive platform system ensures optimal performance and compatibility across all supported platforms while providing detailed system information for adaptive behavior and debugging.
