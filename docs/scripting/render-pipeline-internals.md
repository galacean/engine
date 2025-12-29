# Render Pipeline Internals

This document provides detailed information about Galacean Engine's internal rendering pipeline components. This information is primarily intended for engine contributors and developers who need deep customization of the rendering system.

## Core Pipeline Architecture

### RenderQueue System

The render queue manages the sorting and batching of render elements for optimal GPU performance:

```typescript
// Internal render queue structure
interface RenderQueue {
  opaqueQueue: RenderElement[];
  transparentQueue: RenderElement[];
  overlayQueue: RenderElement[];
}

// Render element sorting criteria
interface RenderElement {
  priority: number;        // Manual priority override
  renderQueueType: number; // Opaque, Transparent, Overlay
  distanceToCamera: number; // For depth sorting
  material: Material;      // For state change minimization
  mesh: Mesh;             // For geometry batching
}
```

### Render Passes

#### DepthOnlyPass

The depth-only pass renders geometry to establish the depth buffer before the main rendering pass:

```typescript
// Depth-only rendering for early Z-rejection
class DepthOnlyPass {
  // Renders only depth information, no color output
  execute(renderContext: RenderContext): void {
    // 1. Set depth-only render state
    // 2. Bind depth-only shader
    // 3. Render opaque geometry front-to-back
    // 4. Skip transparent geometry
  }
  
  // Optimization: only render shadow casters and occluders
  shouldRenderElement(element: RenderElement): boolean {
    return element.material.castShadows || element.material.occluder;
  }
}
```

#### OpaqueTexturePass

Renders opaque geometry to generate textures for post-processing or effects:

```typescript
class OpaqueTexturePass {
  private opaqueTexture: RenderTarget;
  private depthTexture: RenderTarget;
  
  execute(renderContext: RenderContext): void {
    // 1. Bind opaque render target
    // 2. Clear color and depth
    // 3. Render opaque geometry back-to-front
    // 4. Store result for later use (refraction, distortion, etc.)
  }
  
  getOpaqueTexture(): Texture2D {
    return this.opaqueTexture.getColorTexture(0);
  }
}
```

### MaskManager System

The mask manager handles stencil-based masking for UI and special effects:

```typescript
class MaskManager {
  private maskStack: number[] = [];
  private currentMaskId: number = 0;
  
  // Push a new mask layer
  pushMask(maskRenderer: MaskRenderer): void {
    this.currentMaskId++;
    this.maskStack.push(this.currentMaskId);
    
    // Configure stencil state for mask writing
    const stencilState = {
      enabled: true,
      writeMask: 0xFF,
      referenceValue: this.currentMaskId,
      compareFunction: CompareFunction.Always,
      passOperation: StencilOperation.Replace
    };
    
    // Render mask geometry to stencil buffer
    this.renderMaskGeometry(maskRenderer, stencilState);
  }
  
  // Pop the current mask layer
  popMask(): void {
    this.maskStack.pop();
    this.currentMaskId = this.maskStack.length > 0 ? 
      this.maskStack[this.maskStack.length - 1] : 0;
  }
  
  // Configure stencil state for masked rendering
  getMaskedStencilState(): StencilState {
    return {
      enabled: this.currentMaskId > 0,
      writeMask: 0x00,
      referenceValue: this.currentMaskId,
      compareFunction: CompareFunction.Equal,
      passOperation: StencilOperation.Keep
    };
  }
}
```

### Blitter Utility System

The Blitter provides efficient full-screen quad rendering for post-processing:

```typescript
class Blitter {
  private fullscreenMesh: Mesh;
  private blitMaterial: Material;
  
  constructor() {
    // Create full-screen triangle mesh (more efficient than quad)
    this.fullscreenMesh = this.createFullscreenTriangle();
  }
  
  // Blit from source to destination with custom material
  blit(source: Texture, destination: RenderTarget, material?: Material): void {
    const mat = material || this.blitMaterial;
    mat.setTexture("_MainTex", source);
    
    // Set render target
    this.setRenderTarget(destination);
    
    // Render full-screen triangle
    this.renderMesh(this.fullscreenMesh, mat);
  }
  
  // Multi-target blit for MRT rendering
  blitMRT(sources: Texture[], destination: RenderTarget, material: Material): void {
    for (let i = 0; i < sources.length; i++) {
      material.setTexture(`_MainTex${i}`, sources[i]);
    }
    
    this.setRenderTarget(destination);
    this.renderMesh(this.fullscreenMesh, material);
  }
  
  private createFullscreenTriangle(): Mesh {
    // Create oversized triangle that covers entire screen
    // More efficient than quad as it avoids diagonal edge artifacts
    const vertices = new Float32Array([
      -1, -1, 0,  // Bottom-left
       3, -1, 0,  // Bottom-right (off-screen)
      -1,  3, 0   // Top-left (off-screen)
    ]);
    
    const uvs = new Float32Array([
      0, 0,  // Bottom-left
      2, 0,  // Bottom-right
      0, 2   // Top-left
    ]);
    
    const mesh = new Mesh();
    mesh.setPositions(vertices);
    mesh.setUVs(uvs);
    mesh.uploadData(false);
    return mesh;
  }
}
```

## Internal Rendering Components

### RenderContext

The render context maintains state throughout the rendering pipeline:

```typescript
interface RenderContext {
  camera: Camera;
  scene: Scene;
  renderTarget: RenderTarget;
  
  // Lighting information
  directionalLights: DirectLight[];
  pointLights: PointLight[];
  spotLights: SpotLight[];
  
  // Shadow information
  shadowMaps: ShadowMap[];
  shadowMatrices: Matrix4[];
  
  // Environment information
  skybox: SkyBox;
  environmentProbe: CubeProbe;
  
  // Render statistics
  drawCalls: number;
  triangles: number;
  vertices: number;
}
```

### ShaderPass System

Internal shader pass management for multi-pass rendering:

```typescript
class ShaderPass {
  name: string;
  vertexShader: string;
  fragmentShader: string;
  renderState: RenderState;
  
  // Pass-specific uniform bindings
  bindUniforms(material: Material, renderContext: RenderContext): void {
    // Bind pass-specific uniforms
    this.bindLightingUniforms(renderContext);
    this.bindCameraUniforms(renderContext.camera);
    this.bindMaterialUniforms(material);
  }
  
  private bindLightingUniforms(context: RenderContext): void {
    // Bind light arrays, shadow maps, etc.
  }
  
  private bindCameraUniforms(camera: Camera): void {
    // Bind view/projection matrices, camera position, etc.
  }
  
  private bindMaterialUniforms(material: Material): void {
    // Bind material-specific properties
  }
}
```

### BasicRenderPipeline

The default forward rendering pipeline implementation:

```typescript
class BasicRenderPipeline {
  private depthOnlyPass: DepthOnlyPass;
  private opaquePass: OpaquePass;
  private transparentPass: TransparentPass;
  private postProcessPass: PostProcessPass;
  
  render(renderContext: RenderContext): void {
    // 1. Shadow map generation
    this.renderShadowMaps(renderContext);
    
    // 2. Depth pre-pass (optional, for complex scenes)
    if (this.useDepthPrepass) {
      this.depthOnlyPass.execute(renderContext);
    }
    
    // 3. Opaque geometry rendering
    this.opaquePass.execute(renderContext);
    
    // 4. Sky rendering
    this.renderSky(renderContext);
    
    // 5. Transparent geometry rendering
    this.transparentPass.execute(renderContext);
    
    // 6. Post-processing
    this.postProcessPass.execute(renderContext);
    
    // 7. UI overlay rendering
    this.renderUI(renderContext);
  }
  
  private renderShadowMaps(context: RenderContext): void {
    for (const light of context.directionalLights) {
      if (light.castShadows) {
        this.renderDirectionalShadowMap(light, context);
      }
    }
  }
}
```

## Performance Optimization Internals

### Frustum Culling

```typescript
class FrustumCuller {
  private frustumPlanes: Plane[] = new Array(6);
  
  updateFrustum(camera: Camera): void {
    const viewProjection = camera.viewProjectionMatrix;
    this.extractFrustumPlanes(viewProjection, this.frustumPlanes);
  }
  
  cullRenderers(renderers: Renderer[]): Renderer[] {
    return renderers.filter(renderer => {
      const bounds = renderer.bounds;
      return this.isInFrustum(bounds);
    });
  }
  
  private isInFrustum(bounds: BoundingBox): boolean {
    for (const plane of this.frustumPlanes) {
      if (this.distanceToPlane(bounds, plane) < 0) {
        return false;
      }
    }
    return true;
  }
}
```

### Occlusion Culling

```typescript
class OcclusionCuller {
  private occlusionQueries: WebGLQuery[] = [];
  private queryResults: Map<Renderer, boolean> = new Map();
  
  // Submit occlusion queries for renderers
  submitQueries(renderers: Renderer[]): void {
    for (const renderer of renderers) {
      const query = this.getOrCreateQuery(renderer);
      
      // Begin occlusion query
      gl.beginQuery(gl.ANY_SAMPLES_PASSED, query);
      
      // Render bounding box with depth-only shader
      this.renderBoundingBox(renderer.bounds);
      
      // End query
      gl.endQuery(gl.ANY_SAMPLES_PASSED);
    }
  }
  
  // Collect query results (next frame)
  collectResults(): void {
    for (const [renderer, query] of this.rendererQueries) {
      const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
      if (available) {
        const visible = gl.getQueryParameter(query, gl.QUERY_RESULT);
        this.queryResults.set(renderer, visible > 0);
      }
    }
  }
}
```

This internal documentation provides insight into the engine's rendering architecture for advanced users and contributors who need to understand or modify the core rendering pipeline.
