# Camera

The `Camera` component is the lens into the 3D world, determining what is rendered and how. It controls the projection (perspective or orthographic), culling, and rendering order. A scene can have multiple cameras, each rendering to a different part of the screen or to a texture.

## Creating a Camera

A Camera is a component that must be attached to an `Entity`. You can create a camera entity and add it to the scene.

```ts
import { WebGLEngine, Entity, Camera } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;
const rootEntity = scene.createRootEntity();

// Create an entity for the camera
const cameraEntity = rootEntity.createChild("camera_entity");
cameraEntity.transform.setPosition(0, 0, 10);

// Add a Camera component to the entity
const camera = cameraEntity.addComponent(Camera);
```

## Projection Types

The camera supports two main projection types: Perspective and Orthographic.

### Perspective Camera
This is the most common projection for 3D games. It creates a sense of depth, where objects appear smaller as they move further away. The viewing volume is a frustum.

```ts
// By default, a camera is a perspective camera
camera.isOrthographic = false;

// Adjust the field of view (in degrees)
camera.fieldOfView = 60;

// Set the near and far clipping planes
camera.nearClipPlane = 0.1;
camera.farClipPlane = 100;
```

### Orthographic Camera
This projection removes perspective, making it ideal for 2D games, UI, or isometric views. All objects appear at the same scale regardless of their distance from the camera. The viewing volume is a rectangular box.

```ts
camera.isOrthographic = true;

// Set the size of the viewing volume.
// For a 2D game, this can correspond to half the screen height in world units.
camera.orthographicSize = 5;

// Set the near and far clipping planes
camera.nearClipPlane = 0.1;
camera.farClipPlane = 100;
```

## Viewport and Multiple Cameras

The `viewport` property allows the camera to render to a specific rectangular area of the canvas, defined in normalized coordinates (0,0 to 1,1). This is useful for split-screen multiplayer or minimaps.

The `priority` property determines the rendering order. Cameras with a higher priority are rendered on top of those with a lower priority.

```ts
// Main camera renders to the full screen
const mainCamera = mainCameraEntity.addComponent(Camera);
mainCamera.viewport = new Vector4(0, 0, 1, 1);
mainCamera.priority = 0;

// Minimap camera renders to the top-right corner
const minimapCameraEntity = rootEntity.createChild("minimap_camera");
const minimapCamera = minimapCameraEntity.addComponent(Camera);
minimapCamera.viewport = new Vector4(0.7, 0.7, 0.3, 0.3); // x, y, width, height
minimapCamera.priority = 1; // Rendered after the main camera
```

## Coordinate Conversion

The Camera provides essential utility methods to convert coordinates between different spaces.

- **World Space**: The 3D coordinate system of the scene.
- **Viewport Space**: A 2D normalized coordinate system where (0,0) is the bottom-left and (1,1) is the top-right of the camera's viewport.
- **Screen Space**: A 2D pixel-based coordinate system where (0,0) is the top-left of the canvas.

```ts
import { Vector2, Vector3, Ray } from "@galacean/engine-math";

// Create a ray from the mouse position (in screen space)
const mousePosition = new Vector2(inputManager.pointers[0].position.x, inputManager.pointers[0].position.y);
const ray = camera.screenPointToRay(mousePosition);

// Now you can use this ray for physics picking
const hitResult = new HitResult();
if (scene.physics.raycast(ray, Number.MAX_VALUE, Layer.Default, hitResult)) {
    console.log("Hit entity:", hitResult.entity.name);
}

// Convert a 3D world point to 2D screen coordinates
const worldPosition = new Vector3(5, 2, 0);
const screenPosition = camera.worldToScreenPoint(worldPosition);
console.log(`Screen position: ${screenPosition.x}, ${screenPosition.y}`);

// Convert viewport point to world space
const viewportPoint = new Vector3(0.5, 0.5, 10); // center of screen, 10 units from camera
const worldPoint = camera.viewportToWorldPoint(viewportPoint);
console.log(`World position: ${worldPoint.x}, ${worldPoint.y}, ${worldPoint.z}`);
```

## Rendering to a Texture

Set the `renderTarget` property to make a camera render its view into a texture instead of the screen. This is the foundation for effects like security camera monitors, reflections, or post-processing.

```ts
import { RenderTarget, Texture2D, TextureFormat } from "@galacean/engine";

// Create a render target
const renderColorTexture = new Texture2D(engine, 512, 512, TextureFormat.R8G8B8A8, true);
const renderDepthTexture = new Texture2D(engine, 512, 512, TextureFormat.Depth16, true);
const renderTarget = new RenderTarget(engine, 512, 512, renderColorTexture, renderDepthTexture);

// Assign it to the camera
camera.renderTarget = renderTarget;

// The `renderColorTexture` can now be used in a material
material.shaderData.setTexture("u_baseTexture", renderColorTexture);
```

## Advanced Camera Features

### Depth and Opaque Textures

Cameras can generate depth and opaque textures for advanced rendering effects:

```ts
// Enable depth texture (accessible as camera_DepthTexture in shaders)
camera.depthTextureMode = true;

// Enable opaque texture for transparent queue effects
camera.opaqueTextureEnabled = true;
camera.opaqueTextureDownsampling = 2; // Half resolution for performance

// Note: Only non-transparent objects write to depth texture
```

### Anti-Aliasing and Quality Settings

```ts
import { AntiAliasing } from "@galacean/engine";

// Enable FXAA anti-aliasing
camera.antiAliasing = AntiAliasing.FXAA;

// Configure MSAA samples
camera.msaaSamples = 4; // 2, 4, or 8 samples

// Enable HDR for wider color range
camera.enableHDR = true;

// Enable post-processing pipeline
camera.enablePostProcess = true;

// Preserve alpha channel in output
camera.isAlphaOutputRequired = true;
```

### Culling and Layer Management

```ts
import { Layer } from "@galacean/engine";

// Control which layers this camera renders
camera.cullingMask = Layer.Layer0 | Layer.Layer1; // Only render these layers

// Enable/disable frustum culling for performance
camera.enableFrustumCulling = true; // Default: true

// Set clear flags
camera.clearFlags = CameraClearFlags.All; // Clear color, depth, and stencil
```

## API Reference

```apidoc
Camera:
  Properties:
    isOrthographic: boolean
      - Toggles between perspective (false) and orthographic (true) projection.
    fieldOfView: number
      - The vertical field of view in degrees (for perspective cameras).
    orthographicSize: number
      - Half the vertical size of the viewing volume (for orthographic cameras).
    nearClipPlane: number
      - The closest point the camera will render.
    farClipPlane: number
      - The furthest point the camera will render.
    aspectRatio: number
      - The aspect ratio (width/height). Automatically calculated from viewport by default.
    viewport: Vector4
      - The normalized screen-space rectangle to render into `(x, y, width, height)`.
    clearFlags: CameraClearFlags
      - What to clear before rendering (e.g., color, depth). `CameraClearFlags.All` is default.
    cullingMask: Layer
      - A bitmask that determines which layers this camera renders.
    priority: number
      - Render order for cameras. Higher values render later (on top).
    renderTarget: RenderTarget | null
      - The target to render to. If null, renders to the canvas.
    viewMatrix: Readonly<Matrix>
      - The matrix that transforms from world to camera space.
    projectionMatrix: Readonly<Matrix>
      - The matrix that transforms from camera to clip space.
    enableFrustumCulling: boolean
      - If true, objects outside the camera's view frustum are not rendered. Default is true.
    enablePostProcess: boolean
      - If true, post-processing effects will be applied to this camera's output.
    enableHDR: boolean
      - If true, enables High Dynamic Range rendering, requiring a compatible device.
    depthTextureMode: boolean
      - Enables depth texture generation. Accessible as camera_DepthTexture in shaders.
    opaqueTextureEnabled: boolean
      - Enables opaque texture for transparent queue rendering effects.
    opaqueTextureDownsampling: number
      - Downsampling level for opaque texture (1 = no downsampling, 2 = half resolution).
    antiAliasing: AntiAliasing
      - Anti-aliasing method (None, FXAA).
    msaaSamples: number
      - Multi-sample anti-aliasing sample count (2, 4, 8).
    isAlphaOutputRequired: boolean
      - Whether to preserve alpha channel in output.
    pixelViewport: Vector4
      - Camera viewport in screen pixels (read-only).

  Methods:
    worldToScreenPoint(point: Vector3): Vector2
      - Transforms a point from world space to screen space (pixels).
    screenToWorldPoint(point: Vector2, zDistance: number): Vector3
      - Transforms a point from screen space to world space at specified distance.
    worldToViewportPoint(point: Vector3): Vector3
      - Transforms a point from world space to viewport space (normalized 0-1).
    viewportToWorldPoint(point: Vector3): Vector3
      - Transforms a point from viewport space to world space.
    screenPointToRay(point: Vector2): Ray
      - Creates a Ray in world space from a 2D screen-space point.
    viewportPointToRay(point: Vector2): Ray
      - Creates a Ray in world space from a 2D viewport-space point.
    screenToViewportPoint(point: Vector2): Vector2
      - Converts screen coordinates to viewport coordinates.
    viewportToScreenPoint(point: Vector2): Vector2
      - Converts viewport coordinates to screen coordinates.
    render(): void
      - Manually triggers the camera to render a frame.
```
