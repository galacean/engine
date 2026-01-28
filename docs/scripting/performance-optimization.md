# Performance Optimization

Galacean's performance optimization system provides comprehensive tools and strategies for achieving optimal rendering performance, memory efficiency, and smooth frame rates across web and mobile platforms. This guide covers profiling techniques, optimization strategies, and platform-specific performance tuning for high-performance 3D applications.

## Overview

Performance optimization in Galacean involves several key areas:

- **Rendering Performance**: Frame rate optimization, batching, culling, and GPU utilization
- **Memory Management**: Resource lifecycle, garbage collection, and memory profiling
- **Asset Optimization**: Texture compression, mesh optimization, and loading strategies
- **Platform Adaptation**: Device-specific optimizations for mobile and desktop
- **Profiling Tools**: Built-in performance monitoring and debugging capabilities
- **Engine Configuration**: Settings optimization for different performance targets

The system provides both automated optimizations and manual controls for fine-tuning performance characteristics.

## Quick Start

```ts
import { WebGLEngine, SystemInfo, Platform, Camera, MSAASamples } from "@galacean/engine";

// Performance-aware engine initialization
const engine = await WebGLEngine.create({
  canvas: "canvas",
  graphicDeviceOptions: {
    // Adaptive quality settings
    antialias: SystemInfo.platform !== Platform.Android,
    powerPreference: SystemInfo.devicePixelRatio > 2 ? "high-performance" : "default",
    alpha: false // Disable alpha for better performance
  }
});

// Configure camera for optimal performance
const camera = cameraEntity.getComponent(Camera);
camera.msaaSamples = SystemInfo.platform === Platform.Mac 
  ? MSAASamples.FourX 
  : MSAASamples.TwoX; // Adaptive MSAA

// Enable frustum culling
camera.enableFrustumCulling = true;
camera.farClipPlane = 100; // Reduce far plane for better culling

// Start performance monitoring (custom implementation)
const performanceMonitor = new FrameRateManager(engine);

engine.run();
```

## Rendering Performance

### Frame Rate Optimization

```ts
class FrameRateManager {
  private targetFPS = 60;
  private frameTimeThreshold = 16.67; // 60 FPS target
  private qualityLevel = 1.0;

  constructor(private engine: Engine) {
    this.setupFrameRateMonitoring();
  }

  private setupFrameRateMonitoring(): void {
    let frameCount = 0;
    let lastTime = performance.now();
    let frameTimeSum = 0;

    const monitor = () => {
      const currentTime = performance.now();
      const frameTime = currentTime - lastTime;
      
      frameTimeSum += frameTime;
      frameCount++;

      // Calculate average FPS every 30 frames
      if (frameCount >= 30) {
        const avgFrameTime = frameTimeSum / frameCount;
        const currentFPS = 1000 / avgFrameTime;
        
        this.adaptQuality(currentFPS, avgFrameTime);
        
        frameCount = 0;
        frameTimeSum = 0;
      }

      lastTime = currentTime;
      requestAnimationFrame(monitor);
    };

    requestAnimationFrame(monitor);
  }

  private adaptQuality(fps: number, frameTime: number): void {
    const targetFrameTime = this.frameTimeThreshold;
    
    if (frameTime > targetFrameTime * 1.2) {
      // Performance below target, reduce quality
      this.qualityLevel = Math.max(0.5, this.qualityLevel - 0.1);
      this.applyQualitySettings();
    } else if (frameTime < targetFrameTime * 0.8 && this.qualityLevel < 1.0) {
      // Performance good, increase quality
      this.qualityLevel = Math.min(1.0, this.qualityLevel + 0.05);
      this.applyQualitySettings();
    }
  }

  private applyQualitySettings(): void {
    const cameras = this.engine.sceneManager.activeScene.findEntityWithComponents(Camera);
    
    cameras.forEach(entity => {
      const camera = entity.getComponent(Camera);
      
      if (this.qualityLevel < 0.7) {
        camera.msaaSamples = MSAASamples.None;
        camera.enableHDR = false;
      } else if (this.qualityLevel < 0.9) {
        camera.msaaSamples = MSAASamples.TwoX;
        camera.enableHDR = false;
      } else {
        camera.msaaSamples = MSAASamples.FourX;
        camera.enableHDR = true;
      }
    });

    console.log(`Quality level adjusted to: ${(this.qualityLevel * 100).toFixed(1)}%`);
  }
}
```

### GPU Profiling and Optimization

```ts
class GPUProfiler {
  private queries: Map<string, WebGLQuery> = new Map();
  private results: Map<string, number> = new Map();
  private gl: WebGL2RenderingContext;

  constructor(engine: Engine) {
    this.gl = engine.graphicsDevice.gl as WebGL2RenderingContext;
    this.setupExtensions();
  }

  private setupExtensions(): void {
    // Enable GPU timing extensions
    const timerExt = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!timerExt) {
      console.warn('GPU timing not available');
    }
  }

  startGPUTiming(label: string): void {
    if (!this.gl.createQuery) return;
    
    const query = this.gl.createQuery();
    if (query) {
      this.queries.set(label, query);
      this.gl.beginQuery(this.gl.TIME_ELAPSED_EXT, query);
    }
  }

  endGPUTiming(label: string): void {
    if (!this.gl.endQuery) return;
    
    this.gl.endQuery(this.gl.TIME_ELAPSED_EXT);
    
    // Check result asynchronously
    setTimeout(() => this.checkQueryResult(label), 0);
  }

  private checkQueryResult(label: string): void {
    const query = this.queries.get(label);
    if (!query) return;

    const available = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE);
    if (available) {
      const result = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT);
      this.results.set(label, result / 1000000); // Convert to milliseconds
      this.gl.deleteQuery(query);
      this.queries.delete(label);
    } else {
      // Try again later
      setTimeout(() => this.checkQueryResult(label), 1);
    }
  }

  getTimingResults(): Map<string, number> {
    return new Map(this.results);
  }

  generateReport(): string {
    let report = "GPU Timing Report:\\n";
    report += "==================\\n";
    
    for (const [label, time] of this.results) {
      report += `${label}: ${time.toFixed(2)}ms\\n`;
    }
    
    return report;
  }
}
```

### Batch Rendering Optimization

```ts
class BatchOptimizer {
  private batchGroups: Map<string, Entity[]> = new Map();
  private materialInstances: Map<Material, Material[]> = new Map();

  optimizeScene(scene: Scene): void {
    this.groupEntitiesByMaterial(scene);
    this.createMaterialInstances();
    this.reorderDrawCalls();
  }

  private groupEntitiesByMaterial(scene: Scene): void {
    const renderers = scene.findEntityWithComponents(MeshRenderer);
    
    for (const entity of renderers) {
      const renderer = entity.getComponent(MeshRenderer);
      const material = renderer.getMaterial();
      
      if (material) {
        const key = this.getMaterialKey(material);
        
        if (!this.batchGroups.has(key)) {
          this.batchGroups.set(key, []);
        }
        
        this.batchGroups.get(key)!.push(entity);
      }
    }
  }

  private getMaterialKey(material: Material): string {
    // Create unique key for batching compatibility
    return `${material.shader.name}_${material.renderState.blendState.sourceColorBlendFactor}_${material.renderState.depthState.compareFunction}`;
  }

  private createMaterialInstances(): void {
    for (const [key, entities] of this.batchGroups) {
      if (entities.length > 1) {
        // Create shared material instance for batch
        const firstRenderer = entities[0].getComponent(MeshRenderer);
        const baseMaterial = firstRenderer.getMaterial();
        
        if (baseMaterial) {
          const batchMaterial = baseMaterial.clone();
          
          // Apply to all entities in batch
          entities.forEach(entity => {
            const renderer = entity.getComponent(MeshRenderer);
            renderer.setMaterial(batchMaterial);
          });
          
          console.log(`Created batch for ${entities.length} entities with material: ${key}`);
        }
      }
    }
  }

  private reorderDrawCalls(): void {
    // Sort entities by render queue and material for optimal draw call ordering
    const allEntities = Array.from(this.batchGroups.values()).flat();
    
    allEntities.sort((a, b) => {
      const rendererA = a.getComponent(MeshRenderer);
      const rendererB = b.getComponent(MeshRenderer);
      
      const materialA = rendererA.getMaterial();
      const materialB = rendererB.getMaterial();
      
      if (materialA && materialB) {
        // Sort by render queue first, then by material
        const queueDiff = materialA.renderQueueType - materialB.renderQueueType;
        if (queueDiff !== 0) return queueDiff;
        
        return this.getMaterialKey(materialA).localeCompare(this.getMaterialKey(materialB));
      }
      
      return 0;
    });
  }
}
```

## Memory Management

### Memory Profiling and Monitoring

```ts
class MemoryProfiler {
  private memorySnapshots: MemorySnapshot[] = [];
  private resourceUsage: Map<string, number> = new Map();
  private gcScheduled = false;

  interface MemorySnapshot {
    timestamp: number;
    jsHeapSize: number;
    jsHeapSizeLimit: number;
    textureMemory: number;
    meshMemory: number;
    activeEntities: number;
  }

  startProfiling(): void {
    setInterval(() => {
      this.takeSnapshot();
      this.analyzeMemoryTrends();
    }, 5000); // Every 5 seconds
  }

  private takeSnapshot(): void {
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      jsHeapSize: this.getJSHeapSize(),
      jsHeapSizeLimit: this.getJSHeapSizeLimit(),
      textureMemory: this.estimateTextureMemory(),
      meshMemory: this.estimateMeshMemory(),
      activeEntities: this.countActiveEntities()
    };

    this.memorySnapshots.push(snapshot);
    
    // Keep last 60 snapshots (5 minutes at 5-second intervals)
    if (this.memorySnapshots.length > 60) {
      this.memorySnapshots.shift();
    }
  }

  private getJSHeapSize(): number {
    const memory = (performance as any).memory;
    return memory ? memory.usedJSHeapSize : 0;
  }

  private getJSHeapSizeLimit(): number {
    const memory = (performance as any).memory;
    return memory ? memory.jsHeapSizeLimit : 0;
  }

  private estimateTextureMemory(): number {
    // Estimate texture memory usage based on loaded textures
    let totalMemory = 0;
    
    // This would require access to engine's resource manager
    // const textures = engine.resourceManager.getLoadedResources(AssetType.Texture2D);
    // textures.forEach(texture => {
    //   totalMemory += texture.width * texture.height * 4; // RGBA bytes
    // });
    
    return totalMemory;
  }

  private estimateMeshMemory(): number {
    // Estimate mesh memory usage
    return 0; // Implementation depends on mesh data access
  }

  private countActiveEntities(): number {
    // Count active entities in scene
    return 0; // Implementation depends on scene access
  }

  private analyzeMemoryTrends(): void {
    if (this.memorySnapshots.length < 2) return;

    const current = this.memorySnapshots[this.memorySnapshots.length - 1];
    const previous = this.memorySnapshots[this.memorySnapshots.length - 2];

    const heapGrowth = current.jsHeapSize - previous.jsHeapSize;
    const heapUsagePercent = (current.jsHeapSize / current.jsHeapSizeLimit) * 100;

    // Trigger GC if memory usage is high
    if (heapUsagePercent > 80 && !this.gcScheduled) {
      this.scheduleGarbageCollection();
    }

    // Log memory warnings
    if (heapGrowth > 10 * 1024 * 1024) { // 10MB growth
      console.warn(`High memory growth detected: ${(heapGrowth / 1024 / 1024).toFixed(2)}MB`);
    }
  }

  private scheduleGarbageCollection(): void {
    this.gcScheduled = true;
    
    setTimeout(() => {
      // Trigger cleanup
      this.performResourceCleanup();
      this.gcScheduled = false;
    }, 1000);
  }

  private performResourceCleanup(): void {
    // Trigger various cleanup operations
    console.log('Performing resource cleanup...');
    
    // Force garbage collection if available (Chrome DevTools)
    if ((window as any).gc) {
      (window as any).gc();
    }
  }

  generateMemoryReport(): string {
    const latest = this.memorySnapshots[this.memorySnapshots.length - 1];
    if (!latest) return "No memory data available";

    const usagePercent = (latest.jsHeapSize / latest.jsHeapSizeLimit) * 100;
    
    return `Memory Report:
JS Heap: ${(latest.jsHeapSize / 1024 / 1024).toFixed(2)}MB / ${(latest.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB (${usagePercent.toFixed(1)}%)
Texture Memory: ${(latest.textureMemory / 1024 / 1024).toFixed(2)}MB
Mesh Memory: ${(latest.meshMemory / 1024 / 1024).toFixed(2)}MB
Active Entities: ${latest.activeEntities}`;
  }
}
```

### Automatic Resource Management

```ts
class ResourceLifecycleManager {
  private resourceRefs: Map<string, { count: number; lastUsed: number }> = new Map();
  private cleanupTimer: number | null = null;

  constructor(private resourceManager: ResourceManager) {
    this.startCleanupTimer();
  }

  addReference(url: string): void {
    const current = this.resourceRefs.get(url) || { count: 0, lastUsed: Date.now() };
    current.count++;
    current.lastUsed = Date.now();
    this.resourceRefs.set(url, current);
  }

  removeReference(url: string): void {
    const current = this.resourceRefs.get(url);
    if (current) {
      current.count--;
      current.lastUsed = Date.now();
      
      if (current.count <= 0) {
        // Schedule for cleanup
        setTimeout(() => this.maybeCleanupResource(url), 30000); // 30 second delay
      }
    }
  }

  private maybeCleanupResource(url: string): void {
    const ref = this.resourceRefs.get(url);
    if (ref && ref.count <= 0) {
      const timeSinceLastUsed = Date.now() - ref.lastUsed;
      
      if (timeSinceLastUsed > 60000) { // 1 minute since last use
        console.log(`Cleaning up unused resource: ${url}`);
        this.resourceManager.cancelNotLoaded(url);
        this.resourceRefs.delete(url);
      }
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const urlsToCleanup: string[] = [];
      
      for (const [url, ref] of this.resourceRefs) {
        if (ref.count <= 0 && (now - ref.lastUsed) > 300000) { // 5 minutes
          urlsToCleanup.push(url);
        }
      }
      
      urlsToCleanup.forEach(url => {
        console.log(`Auto-cleaning up old resource: ${url}`);
        this.resourceManager.cancelNotLoaded(url);
        this.resourceRefs.delete(url);
      });
      
      if (urlsToCleanup.length > 0) {
        this.resourceManager.gc();
      }
    }, 60000); // Check every minute
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
```

## Asset Optimization

### Texture Optimization Strategies

```ts
class TextureOptimizer {
  private compressionFormats: string[] = [];

  constructor(private engine: Engine) {
    this.detectSupportedFormats();
  }

  private detectSupportedFormats(): void {
    const gl = this.engine.graphicsDevice.gl;
    
    // Check for compressed texture support
    if (gl.getExtension('WEBGL_compressed_texture_s3tc')) {
      this.compressionFormats.push('DXT');
    }
    if (gl.getExtension('WEBGL_compressed_texture_etc1')) {
      this.compressionFormats.push('ETC1');
    }
    if (gl.getExtension('WEBGL_compressed_texture_pvrtc')) {
      this.compressionFormats.push('PVRTC');
    }
    if (gl.getExtension('WEBGL_compressed_texture_astc')) {
      this.compressionFormats.push('ASTC');
    }
  }

  optimizeTextureLoading(baseUrl: string): string {
    const platform = SystemInfo.platform;
    
    // Choose optimal texture format based on platform
    if (platform === Platform.IPhone || platform === Platform.IPad) {
      // iOS devices prefer PVRTC
      if (this.compressionFormats.includes('PVRTC')) {
        return baseUrl.replace(/\\.(jpg|png)$/, '.pvr');
      }
    } else if (platform === Platform.Android) {
      // Android devices prefer ETC1/ETC2
      if (this.compressionFormats.includes('ETC1')) {
        return baseUrl.replace(/\\.(jpg|png)$/, '.ktx');
      }
    } else {
      // Desktop prefers DXT/S3TC
      if (this.compressionFormats.includes('DXT')) {
        return baseUrl.replace(/\\.(jpg|png)$/, '.dds');
      }
    }
    
    // Fallback to original format
    return baseUrl;
  }

  calculateOptimalTextureSize(originalWidth: number, originalHeight: number): { width: number; height: number } {
    const maxTextureSize = this.engine.graphicsDevice.capabilities.maxTextureSize;
    const devicePixelRatio = SystemInfo.devicePixelRatio;
    
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;
    
    // Reduce texture size on high-DPI mobile devices
    if (SystemInfo.platform === Platform.Android && devicePixelRatio > 2) {
      targetWidth = Math.floor(originalWidth * 0.75);
      targetHeight = Math.floor(originalHeight * 0.75);
    }
    
    // Ensure power-of-two for older devices
    targetWidth = Math.min(this.nextPowerOfTwo(targetWidth), maxTextureSize);
    targetHeight = Math.min(this.nextPowerOfTwo(targetHeight), maxTextureSize);
    
    return { width: targetWidth, height: targetHeight };
  }

  private nextPowerOfTwo(value: number): number {
    return Math.pow(2, Math.ceil(Math.log2(value)));
  }
}
```

### Mesh Level-of-Detail (LOD) System

```ts
class LODManager {
  private lodGroups: Map<Entity, LODGroup> = new Map();
  private camera: Camera | null = null;

  interface LODGroup {
    entity: Entity;
    levels: LODLevel[];
    currentLOD: number;
  }

  interface LODLevel {
    distance: number;
    mesh: Mesh;
    material?: Material;
  }

  registerLODGroup(entity: Entity, levels: LODLevel[]): void {
    const lodGroup: LODGroup = {
      entity,
      levels: levels.sort((a, b) => a.distance - b.distance),
      currentLOD: 0
    };
    
    this.lodGroups.set(entity, lodGroup);
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
  }

  update(): void {
    if (!this.camera) return;

    const cameraPosition = this.camera.entity.transform.worldPosition;
    
    for (const lodGroup of this.lodGroups.values()) {
      this.updateLODForGroup(lodGroup, cameraPosition);
    }
  }

  private updateLODForGroup(lodGroup: LODGroup, cameraPosition: Vector3): void {
    const entityPosition = lodGroup.entity.transform.worldPosition;
    const distance = Vector3.distance(cameraPosition, entityPosition);
    
    let newLOD = lodGroup.levels.length - 1; // Default to lowest LOD
    
    for (let i = 0; i < lodGroup.levels.length; i++) {
      if (distance <= lodGroup.levels[i].distance) {
        newLOD = i;
        break;
      }
    }
    
    if (newLOD !== lodGroup.currentLOD) {
      this.applyLOD(lodGroup, newLOD);
      lodGroup.currentLOD = newLOD;
    }
  }

  private applyLOD(lodGroup: LODGroup, lodIndex: number): void {
    const renderer = lodGroup.entity.getComponent(MeshRenderer);
    if (renderer) {
      const level = lodGroup.levels[lodIndex];
      renderer.mesh = level.mesh;
      
      if (level.material) {
        renderer.setMaterial(level.material);
      }
    }
  }

  removeLODGroup(entity: Entity): void {
    this.lodGroups.delete(entity);
  }
}
```

## Platform-Specific Optimizations

### Mobile Performance Adaptations

```ts
class MobileOptimizer {
  private isMobile: boolean;
  private performanceProfile: 'low' | 'medium' | 'high';

  constructor(private engine: Engine) {
    this.isMobile = this.detectMobile();
    this.performanceProfile = this.detectPerformanceProfile();
    this.applyMobileOptimizations();
  }

  private detectMobile(): boolean {
    return SystemInfo.platform === Platform.Android || 
           SystemInfo.platform === Platform.IPhone || 
           SystemInfo.platform === Platform.IPad;
  }

  private detectPerformanceProfile(): 'low' | 'medium' | 'high' {
    const concurrency = navigator.hardwareConcurrency || 2;
    const memory = (navigator as any).deviceMemory || 1;
    
    if (concurrency >= 8 && memory >= 8) {
      return 'high';
    } else if (concurrency >= 4 && memory >= 4) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private applyMobileOptimizations(): void {
    if (!this.isMobile) return;

    // Camera optimizations
    const cameras = this.engine.sceneManager.activeScene.findEntityWithComponents(Camera);
    cameras.forEach(entity => {
      const camera = entity.getComponent(Camera);
      
      switch (this.performanceProfile) {
        case 'low':
          camera.msaaSamples = MSAASamples.None;
          camera.enableHDR = false;
          camera.farClipPlane = Math.min(camera.farClipPlane, 50);
          break;
        case 'medium':
          camera.msaaSamples = MSAASamples.TwoX;
          camera.enableHDR = false;
          camera.farClipPlane = Math.min(camera.farClipPlane, 100);
          break;
        case 'high':
          camera.msaaSamples = MSAASamples.FourX;
          camera.enableHDR = true;
          break;
      }
    });

    // Shadow optimizations
    if (this.engine.shadowManager) {
      switch (this.performanceProfile) {
        case 'low':
          this.engine.shadowManager.enabled = false;
          break;
        case 'medium':
          this.engine.shadowManager.shadowMapSize = 512;
          this.engine.shadowManager.shadowDistance = 20;
          break;
        case 'high':
          this.engine.shadowManager.shadowMapSize = 1024;
          this.engine.shadowManager.shadowDistance = 50;
          break;
      }
    }

    // Reduce texture quality on low-end devices
    if (this.performanceProfile === 'low') {
      this.setupTextureQualityReduction();
    }
  }

  private setupTextureQualityReduction(): void {
    // Intercept texture loading to reduce quality
    const originalLoad = this.engine.resourceManager.load;
    
    this.engine.resourceManager.load = function(item: any) {
      if (item.type === AssetType.Texture2D) {
        // Add quality reduction parameters
        item.params = item.params || {};
        item.params.maxSize = 512; // Limit texture size
        item.params.quality = 0.8; // Reduce quality
      }
      
      return originalLoad.call(this, item);
    };
  }

  handleMemoryWarning(): void {
    if (!this.isMobile) return;
    
    console.warn('Memory warning received, performing emergency cleanup');
    
    // Force garbage collection
    this.engine.resourceManager.gc();
    
    // Reduce texture quality further
    this.reduceTextureQuality();
    
    // Disable unnecessary effects
    this.disableExpensiveEffects();
  }

  private reduceTextureQuality(): void {
    // Implementation would require access to loaded textures
    console.log('Reducing texture quality due to memory pressure');
  }

  private disableExpensiveEffects(): void {
    const cameras = this.engine.sceneManager.activeScene.findEntityWithComponents(Camera);
    cameras.forEach(entity => {
      const camera = entity.getComponent(Camera);
      camera.msaaSamples = MSAASamples.None;
      camera.enableHDR = false;
    });
  }
}
```

## Performance Monitoring

### Comprehensive Performance Monitor

```ts
class PerformanceMonitor {
  private enabled = false;
  private metrics: PerformanceMetrics = new PerformanceMetrics();
  private logInterval: number | null = null;
  
  interface PerformanceMetrics {
    frameRate: number;
    frameTime: number;
    drawCalls: number;
    triangles: number;
    memoryUsage: number;
    gpuTime: number;
    cpuTime: number;
  }

  constructor(private engine: Engine) {}

  start(): void {
    this.enabled = true;
    this.startMetricsCollection();
    this.setupPerformanceLogging();
  }

  stop(): void {
    this.enabled = false;
    if (this.logInterval) {
      clearInterval(this.logInterval);
      this.logInterval = null;
    }
  }

  private startMetricsCollection(): void {
    let frameCount = 0;
    let lastTime = performance.now();
    let frameTimeSum = 0;

    const collectMetrics = () => {
      if (!this.enabled) return;

      const currentTime = performance.now();
      const frameTime = currentTime - lastTime;
      
      frameTimeSum += frameTime;
      frameCount++;

      // Update metrics every 60 frames (approximately 1 second)
      if (frameCount >= 60) {
        const avgFrameTime = frameTimeSum / frameCount;
        
        this.metrics.frameTime = avgFrameTime;
        this.metrics.frameRate = 1000 / avgFrameTime;
        this.updateRenderingMetrics();
        this.updateMemoryMetrics();
        
        frameCount = 0;
        frameTimeSum = 0;
      }

      lastTime = currentTime;
      requestAnimationFrame(collectMetrics);
    };

    requestAnimationFrame(collectMetrics);
  }

  private updateRenderingMetrics(): void {
    // These would require access to engine's internal render statistics
    // this.metrics.drawCalls = this.engine.statistics.drawCalls;
    // this.metrics.triangles = this.engine.statistics.triangles;
  }

  private updateMemoryMetrics(): void {
    const memory = (performance as any).memory;
    if (memory) {
      this.metrics.memoryUsage = memory.usedJSHeapSize / 1024 / 1024; // MB
    }
  }

  private setupPerformanceLogging(): void {
    this.logInterval = setInterval(() => {
      if (this.enabled) {
        this.logPerformanceReport();
        this.checkPerformanceThresholds();
      }
    }, 10000); // Every 10 seconds
  }

  private logPerformanceReport(): void {
    console.log(`Performance Report:
FPS: ${this.metrics.frameRate.toFixed(1)}
Frame Time: ${this.metrics.frameTime.toFixed(2)}ms
Memory: ${this.metrics.memoryUsage.toFixed(1)}MB
Draw Calls: ${this.metrics.drawCalls}
Triangles: ${this.metrics.triangles}`);
  }

  private checkPerformanceThresholds(): void {
    const warnings: string[] = [];
    
    if (this.metrics.frameRate < 30) {
      warnings.push(`Low FPS: ${this.metrics.frameRate.toFixed(1)}`);
    }
    
    if (this.metrics.frameTime > 33.33) {
      warnings.push(`High frame time: ${this.metrics.frameTime.toFixed(2)}ms`);
    }
    
    if (this.metrics.memoryUsage > 100) {
      warnings.push(`High memory usage: ${this.metrics.memoryUsage.toFixed(1)}MB`);
    }
    
    if (this.metrics.drawCalls > 1000) {
      warnings.push(`High draw calls: ${this.metrics.drawCalls}`);
    }
    
    if (warnings.length > 0) {
      console.warn('Performance warnings:', warnings.join(', '));
    }
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  generateDetailedReport(): string {
    const report = `
=== Galacean Performance Report ===
Frame Rate: ${this.metrics.frameRate.toFixed(2)} FPS
Frame Time: ${this.metrics.frameTime.toFixed(2)} ms
Memory Usage: ${this.metrics.memoryUsage.toFixed(2)} MB
Draw Calls: ${this.metrics.drawCalls}
Triangle Count: ${this.metrics.triangles.toLocaleString()}
GPU Time: ${this.metrics.gpuTime.toFixed(2)} ms
CPU Time: ${this.metrics.cpuTime.toFixed(2)} ms

Platform: ${Platform[SystemInfo.platform]}
Device Pixel Ratio: ${SystemInfo.devicePixelRatio}
Hardware Concurrency: ${navigator.hardwareConcurrency}

=== Recommendations ===`;

    const recommendations: string[] = [];
    
    if (this.metrics.frameRate < 30) {
      recommendations.push('- Reduce rendering quality or complexity');
      recommendations.push('- Enable frustum culling and occlusion culling');
      recommendations.push('- Use texture compression and lower resolution textures');
    }
    
    if (this.metrics.drawCalls > 500) {
      recommendations.push('- Implement draw call batching');
      recommendations.push('- Use shared materials between objects');
      recommendations.push('- Combine small meshes into larger ones');
    }
    
    if (this.metrics.memoryUsage > 50) {
      recommendations.push('- Implement asset streaming or LOD systems');
      recommendations.push('- Use compressed texture formats');
      recommendations.push('- Clean up unused resources regularly');
    }
    
    return report + '\\n' + recommendations.join('\\n');
  }
}
```

## API Reference

```apidoc
PerformanceMonitor:
  Methods:
    constructor(engine: Engine)
      - Creates performance monitor for the given engine.
    start(): void
      - Begins performance metrics collection and logging.
    stop(): void
      - Stops performance monitoring and clears intervals.
    getMetrics(): PerformanceMetrics
      - Returns current performance metrics snapshot.
    generateDetailedReport(): string
      - Generates comprehensive performance analysis report.

FrameRateManager:
  Methods:
    constructor(engine: Engine)
      - Creates adaptive frame rate management system.
    adaptQuality(fps: number, frameTime: number): void
      - Automatically adjusts quality settings based on performance.

MemoryProfiler:
  Methods:
    startProfiling(): void
      - Begins memory usage monitoring and trend analysis.
    takeSnapshot(): void
      - Captures current memory usage snapshot.
    generateMemoryReport(): string
      - Creates detailed memory usage report.

GPUProfiler:
  Methods:
    startGPUTiming(label: string): void
      - Begins GPU timing measurement for labeled operation.
    endGPUTiming(label: string): void
      - Ends GPU timing and stores result.
    getTimingResults(): Map<string, number>
      - Returns all GPU timing measurements.

BatchOptimizer:
  Methods:
    optimizeScene(scene: Scene): void
      - Analyzes scene and optimizes draw call batching.
    groupEntitiesByMaterial(scene: Scene): void
      - Groups entities by material compatibility for batching.

LODManager:
  Methods:
    registerLODGroup(entity: Entity, levels: LODLevel[]): void
      - Registers entity for level-of-detail management.
    setCamera(camera: Camera): void
      - Sets camera used for distance calculations.
    update(): void
      - Updates LOD levels based on camera distance.

TextureOptimizer:
  Methods:
    optimizeTextureLoading(baseUrl: string): string
      - Returns optimal texture URL based on platform capabilities.
    calculateOptimalTextureSize(width: number, height: number): {width: number, height: number}
      - Calculates optimal texture dimensions for current platform.

MobileOptimizer:
  Methods:
    constructor(engine: Engine)
      - Creates mobile-specific performance optimizer.
    handleMemoryWarning(): void
      - Responds to mobile memory pressure events.
```

## Best Practices

### Rendering Optimization
- Use frustum culling and occlusion culling to reduce draw calls
- Implement draw call batching for objects with shared materials
- Choose appropriate MSAA levels based on target platform performance
- Use texture compression formats suitable for target platforms

### Memory Management
- Monitor memory usage trends and implement automatic cleanup
- Use resource pooling for frequently created/destroyed objects
- Implement level-of-detail systems for large scenes
- Clear unused resources regularly with resourceManager.gc()

### Asset Optimization
- Use compressed texture formats (KTX, DDS, PVR) when supported
- Implement texture LOD systems for large worlds
- Optimize mesh complexity using automatic LOD generation
- Use efficient audio formats and streaming for large audio files

### Platform Adaptation
- Detect device capabilities and adjust quality settings accordingly
- Implement adaptive quality systems that respond to performance issues
- Use platform-specific asset variants for optimal performance
- Handle mobile memory warnings with appropriate cleanup strategies

### Profiling and Debugging
- Use built-in performance monitoring to identify bottlenecks
- Profile GPU performance with timing queries when available
- Monitor frame rate stability, not just average frame rate
- Implement automatic quality reduction for performance maintenance
