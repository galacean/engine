# UI System

Galacean's UI system provides a comprehensive framework for creating interactive user interfaces in 3D applications. Built on the Entity-Component-System architecture, the UI system supports canvas-based rendering, responsive layouts, interactive elements, and multiple render modes to seamlessly integrate 2D interfaces within 3D scenes.

## Overview

The UI system consists of several key components:
- **UICanvas**: Root container that manages render modes, resolution scaling, and coordinate systems
- **UITransform**: 2D positioning and anchoring within UI layouts
- **UIRenderer**: Base rendering component for UI elements
- **Interactive Components**: Button, Image, Text with built-in interaction support
- **Layout Management**: Responsive sizing and positioning with multiple adaptation modes

## Quick Start

```ts
import { WebGLEngine, Camera } from "@galacean/engine";
import { UICanvas, Text, Button, Image, CanvasRenderMode } from "@galacean/engine-ui";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;

// Create camera for UI rendering
const cameraEntity = scene.createRootEntity("UICamera");
const camera = cameraEntity.addComponent(Camera);

// Create UI Canvas
const canvasEntity = scene.createRootEntity("UICanvas");
const canvas = canvasEntity.addComponent(UICanvas);
canvas.renderCamera = camera;
canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;

// Create UI elements
const textEntity = canvasEntity.createChild("Text");
const text = textEntity.addComponent(Text);
text.text = "Hello UI!";
text.fontSize = 24;

const buttonEntity = canvasEntity.createChild("Button");
const button = buttonEntity.addComponent(Button);
button.onClick.addEventListener(() => {
  console.log("Button clicked!");
});

engine.run();
```

## Canvas Setup and Configuration

### UICanvas Render Modes

The UICanvas supports three primary render modes for different integration needs:

```ts
import { CanvasRenderMode } from "@galacean/engine-ui";

// World Space - UI exists in 3D world (default mode)
canvas.renderMode = CanvasRenderMode.WorldSpace; // Default
// Position using standard Transform component
canvasEntity.transform.setPosition(0, 2, 5);

// Screen Space Overlay - renders on top of 3D scene
canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
canvas.sortOrder = 1; // Higher values render on top (default: 0)

// Screen Space Camera - renders to specific camera
canvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
canvas.renderCamera = uiCamera; // Required for this mode
canvas.distance = 10; // Distance from camera (default: 10)
```

### Resolution and Scaling

Configure responsive behavior across different screen sizes:

```ts
import { ResolutionAdaptationMode } from "@galacean/engine-ui";
import { Vector2 } from "@galacean/engine-math";

// Set reference resolution for scaling calculations (default: 800x600)
canvas.referenceResolution = new Vector2(1920, 1080);

// Choose adaptation strategy (default: HeightAdaptation)
canvas.resolutionAdaptationMode = ResolutionAdaptationMode.WidthAdaptation;
// Options: WidthAdaptation, HeightAdaptation, MatchWidthOrHeight, Expand, Shrink

// Pixels per unit conversion (default: 100)
canvas.referenceResolutionPerUnit = 100;
```

## UI Transform and Layout

### Anchoring and Positioning

UITransform provides flexible positioning relative to parent containers:

```ts
import { UITransform } from "@galacean/engine-ui";
import { Vector2, Vector4 } from "@galacean/engine-math";

const uiTransform = textEntity.addComponent(UITransform);

// Anchor to specific positions (0-1 range)
uiTransform.anchorMin = new Vector2(0.5, 0.5); // Center anchor point
uiTransform.anchorMax = new Vector2(0.5, 0.5);

// Set size and position
uiTransform.sizeDelta = new Vector2(200, 50); // Width and height
uiTransform.anchoredPosition = new Vector2(0, 100); // Offset from anchor

// Margins for stretch anchoring
uiTransform.offsetMin = new Vector2(10, 10);    // Left, bottom margins
uiTransform.offsetMax = new Vector2(-10, -10);  // Right, top margins

// Pivot point for rotation and scaling (0-1 range)
uiTransform.pivot = new Vector2(0.5, 0.5); // Center pivot
```

### Layout Patterns

```ts
// Full screen overlay
uiTransform.anchorMin = new Vector2(0, 0);
uiTransform.anchorMax = new Vector2(1, 1);
uiTransform.offsetMin = new Vector2(0, 0);
uiTransform.offsetMax = new Vector2(0, 0);

// Top-right corner button
uiTransform.anchorMin = new Vector2(1, 1);
uiTransform.anchorMax = new Vector2(1, 1);
uiTransform.sizeDelta = new Vector2(80, 40);
uiTransform.anchoredPosition = new Vector2(-50, -30);

// Bottom panel stretched horizontally
uiTransform.anchorMin = new Vector2(0, 0);
uiTransform.anchorMax = new Vector2(1, 0);
uiTransform.sizeDelta = new Vector2(0, 100); // Height only
uiTransform.anchoredPosition = new Vector2(0, 50); // Half height offset
```

## Interactive Components

### Button Component

Create interactive buttons with click handling:

```ts
import { Button } from "@galacean/engine-ui";

const button = buttonEntity.addComponent(Button);

// Configure interaction states
button.interactive = true;

// Handle click events - use addClicked method
button.addClicked((event) => {
  console.log("Button pressed", event);
});

// Remove click handler when needed
const clickHandler = (event) => {
  console.log("Button clicked");
};
button.addClicked(clickHandler);
button.removeClicked(clickHandler); // Remove specific handler

// Access transition effects (if added separately)
const transitions = button.transitions;
```

### Text Component

Display and style text with rich formatting options:

```ts
import { Text, FontStyle, TextHorizontalAlignment, TextVerticalAlignment, OverflowMode } from "@galacean/engine-ui";
import { Color, Font } from "@galacean/engine";

const text = textEntity.addComponent(Text);

// Basic text properties
text.text = "Game Title";
text.fontSize = 32;
text.color = new Color(1, 1, 1, 1); // White text

// Alignment options
text.horizontalAlignment = TextHorizontalAlignment.Center;
text.verticalAlignment = TextVerticalAlignment.Middle;

// Font styling
text.fontStyle = FontStyle.Bold;
// Combine styles: text.fontStyle = FontStyle.Bold | FontStyle.Italic;

// Text boundaries and wrapping
text.enableWrapping = true;
text.overflowMode = OverflowMode.Truncate; // or OverflowMode.Overflow

// Line spacing
text.lineSpacing = 1.2;

// Load custom fonts
const customFont = await engine.resourceManager.load({
  url: "fonts/custom-font.ttf"
});
text.font = customFont;

// Or use system font
text.font = Font.createFromOS(engine, "Arial");
```

### Image Component

Display textures and sprites with various draw modes:

```ts
import { Image, SpriteDrawMode, SpriteTileMode } from "@galacean/engine-ui";
import { AssetType, Sprite, Texture2D, Color } from "@galacean/engine";

const image = imageEntity.addComponent(Image);

// Load texture and create sprite
const texture = await engine.resourceManager.load({
  url: "images/ui-background.png",
  type: AssetType.Texture2D
});
image.sprite = new Sprite(engine, texture as Texture2D);

// Configure appearance
image.color = new Color(1, 1, 1, 0.8); // Semi-transparent tint

// Configure draw modes
image.drawMode = SpriteDrawMode.Simple;   // Normal rendering
// image.drawMode = SpriteDrawMode.Sliced;  // 9-slice scaling
// image.drawMode = SpriteDrawMode.Tiled;   // Tiled pattern

// Tiled mode configuration
if (image.drawMode === SpriteDrawMode.Tiled) {
  image.tileMode = SpriteTileMode.Continuous;
  image.tiledAdaptiveThreshold = 0.5;
}

// Raycast configuration for interaction
image.raycastTarget = true; // Enable click detection
```

## Layout Groups and Management

### UI Groups

Organize and batch UI elements for efficient rendering and shared properties:

```ts
import { UIGroup } from "@galacean/engine-ui";

const groupEntity = canvasEntity.createChild("UIGroup");
const group = groupEntity.addComponent(UIGroup);

// Add child elements to group
const child1 = groupEntity.createChild("Child1");
const child2 = groupEntity.createChild("Child2");

// Group properties affect all children
group.alpha = 0.8; // Semi-transparent group (0.0 to 1.0)
group.interactive = false; // Disable all interactions for children

// Control parent group inheritance
group.ignoreParentGroup = true; // Ignore parent UIGroup settings

// All child UI elements inherit these properties unless overridden
```

### Event System Integration

Handle UI events with proper propagation:

```ts
import { UIPointerEventEmitter } from "@galacean/engine-ui";

// Custom interactive component
class CustomUIElement extends UIRenderer {
  onAwake(): void {
    const emitter = this.entity.addComponent(UIPointerEventEmitter);
    
    emitter.onPointerDown.addEventListener((eventData) => {
      console.log("Custom element clicked at:", eventData.position);
      
      // Stop event propagation if needed
      eventData.stopPropagation();
    });
    
    emitter.onPointerDrag.addEventListener((eventData) => {
      // Handle drag operations
      this.entity.transform.position = eventData.worldPosition;
    });
  }
}
```

## Advanced Rendering Features

### UI Materials and Shaders

Customize UI rendering with materials:

```ts
import { Material, Shader } from "@galacean/engine";

// Create custom UI shader
const customUIShader = Shader.create("custom-ui", vertexSource, fragmentSource);

// Apply to UI renderer
const customMaterial = new Material(engine, customUIShader);
customMaterial.setColor("_BaseColor", new Color(1, 0.5, 0, 1));

const renderer = imageEntity.getComponent(Image);
renderer.setMaterial(customMaterial);
```

### Masking and Clipping

Implement UI clipping and masking:

```ts
import { SpriteMask, SpriteMaskInteraction } from "@galacean/engine";

// Create mask
const maskEntity = canvasEntity.createChild("Mask");
const mask = maskEntity.addComponent(SpriteMask);
mask.sprite = maskSprite;

// Configure clipped content
const clippedImage = maskEntity.createChild("ClippedContent");
const image = clippedImage.addComponent(Image);
image.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
```

## Performance Optimization

### Batching and Draw Calls

Optimize UI rendering performance:

```ts
// Group similar UI elements for batching
const uiGroup = canvasEntity.createChild("BatchedElements");

// Use consistent materials to enable batching
const sharedMaterial = new Material(engine, uiShader);

// Apply to multiple elements
for (let i = 0; i < elements.length; i++) {
  const element = elements[i].getComponent(Image);
  element.setMaterial(sharedMaterial);
}

// Disable ray casting for non-interactive elements
const backgroundImage = backgroundEntity.getComponent(Image);
backgroundImage.raycastTarget = false;
```

### Memory Management

```ts
// Pool UI elements for dynamic content
class UIElementPool {
  private pool: Entity[] = [];
  
  getElement(): Entity {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    
    const element = canvasEntity.createChild("PooledElement");
    element.addComponent(Text);
    return element;
  }
  
  returnElement(element: Entity): void {
    element.isActive = false;
    this.pool.push(element);
  }
}
```

## World Space UI Integration

### 3D UI Panels

Create UI elements that exist in 3D space:

```ts
// World space canvas setup
canvas.renderMode = CanvasRenderMode.WorldSpace;

// Position in 3D world
canvasEntity.transform.setPosition(0, 2, 5);
canvasEntity.transform.setRotation(0, 180, 0); // Face the camera

// Scale appropriately for world space
canvasEntity.transform.setScale(0.01, 0.01, 0.01);

// Configure canvas for world space
canvas.referenceResolutionPerUnit = 100;
```

### VR/AR UI Considerations

```ts
// Curved UI for VR
const curvedCanvas = canvasEntity.addComponent(UICanvas);
curvedCanvas.renderMode = CanvasRenderMode.WorldSpace;

// Position relative to XR camera
if (engine.xrManager) {
  const xrCamera = engine.xrManager.camera;
  const offset = new Vector3(0, 0, -2);
  
  engine.on("update", () => {
    if (xrCamera) {
      const targetPos = xrCamera.entity.transform.worldPosition.clone();
      targetPos.add(offset);
      canvasEntity.transform.worldPosition = targetPos;
    }
  });
}
```

## API Reference

```apidoc
UICanvas:
  Properties:
    renderMode: CanvasRenderMode
      - Screen space overlay, camera space, or world space rendering.
    renderCamera: Camera
      - Camera used for screen space camera mode rendering.
    sortOrder: number
      - Render order for overlay canvases (higher = front).
    distance: number
      - Distance from camera in camera space mode.
    referenceResolution: Vector2
      - Design resolution for scaling calculations.
    resolutionAdaptationMode: ResolutionAdaptationMode
      - How UI scales across different screen sizes.
    referenceResolutionPerUnit: number
      - Pixels per world unit conversion factor.

  Methods:
    _raycast(ray: Ray, out: UIHitResult): boolean
      - Perform ray casting against UI elements.

UITransform:
  Properties:
    anchorMin: Vector2
      - Bottom-left anchor point (0-1 range).
    anchorMax: Vector2
      - Top-right anchor point (0-1 range).
    anchoredPosition: Vector2
      - Position offset from anchor point.
    sizeDelta: Vector2
      - Size when not stretched by anchors.
    offsetMin: Vector2
      - Left and bottom margins for stretched anchoring.
    offsetMax: Vector2
      - Right and top margins for stretched anchoring.
    pivot: Vector2
      - Pivot point for rotation and scaling (0-1 range).

Button:
  Methods:
    addClicked(listener: (event: PointerEventData) => void): void
      - Add a click event listener to the button.
    removeClicked(listener: (event: PointerEventData) => void): void
      - Remove a specific click event listener from the button.

  Properties:
    interactive: boolean
      - Whether button responds to interactions (inherited from UIInteractive).
    transitions: Transition[]
      - Array of transition effects applied to the button.

  Inherited from UIInteractive:
    onPointerClick(event: PointerEventData): void
      - Override this method to handle pointer click events.

Text:
  Properties:
    text: string
      - Text content to display.
    font: Font
      - Font resource for rendering.
    fontSize: number
      - Size of text in points.
    color: Color
      - Text color and transparency.
    horizontalAlignment: TextHorizontalAlignment
      - Horizontal text alignment (Left, Center, Right).
    verticalAlignment: TextVerticalAlignment
      - Vertical text alignment (Top, Middle, Bottom).
    fontStyle: FontStyle
      - Font style flags (None, Bold, Italic, or combined with |).
    enableWrapping: boolean
      - Whether text wraps at boundaries.
    overflowMode: OverflowMode
      - How to handle text overflow (Overflow, Truncate).
    lineSpacing: number
      - Line spacing multiplier for multi-line text.

Image:
  Properties:
    sprite: Sprite
      - Sprite resource to display.
    color: Color
      - Tint color and transparency.
    drawMode: SpriteDrawMode
      - Drawing mode (Simple, Sliced, Tiled).
    tileMode: SpriteTileMode
      - Tiling behavior when drawMode is Tiled (Continuous, Adaptive).
    tiledAdaptiveThreshold: number
      - Threshold for adaptive tiling (default: 0.5).
    raycastTarget: boolean
      - Whether image responds to pointer events (default: true).

UIGroup:
  Properties:
    alpha: number
      - Opacity level for the group and its children (0.0 to 1.0).
    interactive: boolean
      - Whether UI elements in this group are interactive.
    ignoreParentGroup: boolean
      - If true, ignores settings from parent UIGroup components.
```

## Best Practices

- **Canvas Organization**: Use separate canvases for different UI layers (HUD, menus, tooltips)
- **Anchoring Strategy**: Design with multiple resolutions in mind using appropriate anchor configurations
- **Performance**: Minimize draw calls by batching similar elements and using atlased textures
- **Interaction Design**: Provide clear visual feedback for interactive elements
- **Memory Management**: Pool dynamic UI elements to avoid garbage collection spikes
- **Accessibility**: Use consistent sizing and contrast for text elements
- **Testing**: Test UI across different aspect ratios and input methods

## Common Patterns

### Modal Dialog

```ts
class ModalDialog {
  private overlay: Entity;
  private dialog: Entity;
  
  constructor(canvas: Entity) {
    // Semi-transparent overlay
    this.overlay = canvas.createChild("Overlay");
    const overlayTransform = this.overlay.addComponent(UITransform);
    overlayTransform.anchorMin = new Vector2(0, 0);
    overlayTransform.anchorMax = new Vector2(1, 1);
    
    const overlayImage = this.overlay.addComponent(Image);
    overlayImage.color = new Color(0, 0, 0, 0.5);
    
    // Centered dialog
    this.dialog = this.overlay.createChild("Dialog");
    const dialogTransform = this.dialog.addComponent(UITransform);
    dialogTransform.anchorMin = new Vector2(0.5, 0.5);
    dialogTransform.anchorMax = new Vector2(0.5, 0.5);
    dialogTransform.sizeDelta = new Vector2(400, 300);
  }
  
  show(): void {
    this.overlay.isActive = true;
  }
  
  hide(): void {
    this.overlay.isActive = false;
  }
}
```

### Health Bar

```ts
class HealthBar {
  private fillImage: Image;
  
  constructor(parent: Entity) {
    const background = parent.createChild("HealthBarBG");
    const bgTransform = background.addComponent(UITransform);
    bgTransform.sizeDelta = new Vector2(200, 20);
    
    const fill = background.createChild("HealthBarFill");
    const fillTransform = fill.addComponent(UITransform);
    fillTransform.anchorMin = new Vector2(0, 0);
    fillTransform.anchorMax = new Vector2(1, 1);
    
    this.fillImage = fill.addComponent(Image);
    this.fillImage.color = new Color(1, 0, 0, 1); // Red
    this.fillImage.drawMode = SpriteDrawMode.Filled;
  }
  
  setHealth(percentage: number): void {
    this.fillImage.fillAmount = Math.max(0, Math.min(1, percentage));
  }
}
```
