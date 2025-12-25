# Sprite System - Galacean Engine LLM Documentation

## System Overview

The Sprite System is Galacean Engine's comprehensive 2D graphics rendering solution, providing advanced sprite management, texture atlas support, and multiple rendering modes for efficient 2D content creation.

### Core Architecture

```typescript
// Basic sprite creation and setup
const sprite = new Sprite(engine, texture2D);
const spriteRenderer = entity.addComponent(SpriteRenderer);
spriteRenderer.sprite = sprite;
spriteRenderer.drawMode = SpriteDrawMode.Simple;
```

## Core Classes

### Sprite Class

The `Sprite` class manages 2D sprite data including texture regions, atlas configurations, and positioning parameters.

#### Key Properties

```typescript
// Texture and atlas configuration
sprite.texture = texture2D;                    // Source texture
sprite.atlasRegion = new Rect(0, 0, 0.5, 0.5); // Normalized atlas region
sprite.atlasRotated = false;                   // 90-degree rotation flag
sprite.atlasRegionOffset = new Vector4(0, 0, 0, 0); // Atlas padding

// Size and positioning
sprite.width = 100;                            // Custom width (optional)
sprite.height = 100;                           // Custom height (optional)
sprite.pivot = new Vector2(0.5, 0.5);         // Center pivot point
sprite.region = new Rect(0, 0, 1, 1);         // Texture sampling region

// Nine-slice borders (for sliced mode)
sprite.border = new Vector4(10, 10, 10, 10);  // Left, bottom, right, top
```

#### Automatic Size Calculation

```typescript
// Sprites automatically calculate size from texture dimensions
const sprite = new Sprite(engine, texture2D);
// sprite.width automatically calculated from texture atlas settings
console.log(sprite.width);  // Returns calculated width based on texture and atlas

// Override with custom dimensions
sprite.width = 200;   // Now returns custom width
sprite.height = 150;  // Custom height
```

### SpriteRenderer Component

The `SpriteRenderer` component handles sprite rendering with multiple draw modes and rendering optimizations.

#### Draw Modes

```typescript
// Simple mode - single quad rendering
spriteRenderer.drawMode = SpriteDrawMode.Simple;

// Sliced mode - nine-slice rendering for UI elements
spriteRenderer.drawMode = SpriteDrawMode.Sliced;
sprite.border = new Vector4(20, 20, 20, 20); // Define slice borders

// Tiled mode - repeating texture pattern
spriteRenderer.drawMode = SpriteDrawMode.Tiled;
spriteRenderer.tileMode = SpriteTileMode.Continuous;
spriteRenderer.tiledAdaptiveThreshold = 0.5;
```

#### Rendering Properties

```typescript
// Color and transparency
spriteRenderer.color = new Color(1, 0.5, 0.5, 0.8); // Tinted red with alpha

// Size override
spriteRenderer.width = 300;   // Override sprite size for rendering
spriteRenderer.height = 200;

// Flipping
spriteRenderer.flipX = true;  // Horizontal flip
spriteRenderer.flipY = false; // No vertical flip

// Masking
spriteRenderer.maskLayer = SpriteMaskLayer.UI;
spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
```

### SpriteMask Component

The `SpriteMask` component provides stencil-based masking for controlling sprite visibility.

```typescript
// Create mask component
const spriteMask = entity.addComponent(SpriteMask);
spriteMask.sprite = maskSprite;
spriteMask.alphaCutoff = 0.5;                    // Alpha threshold
spriteMask.influenceLayers = SpriteMaskLayer.UI; // Affected layers

// Mask positioning and sizing
spriteMask.width = 200;
spriteMask.height = 150;
spriteMask.flipX = false;
spriteMask.flipY = false;
```

## Advanced Features

### Texture Atlas Integration

```typescript
// Atlas sprite creation from SpriteAtlas
const spriteAtlas = await engine.resourceManager.load("atlas.json");
const sprite = spriteAtlas.getSprite("character_idle");

// Manual atlas configuration
const sprite = new Sprite(engine, atlasTexture);
sprite.atlasRegion = new Rect(0.25, 0.25, 0.5, 0.5); // Use quarter of texture
sprite.atlasRegionOffset = new Vector4(0.1, 0.1, 0.1, 0.1); // 10% padding
sprite.atlasRotated = true; // Sprite was rotated 90° during packing
```

### Nine-Slice Sprites (UI Elements)

```typescript
// Perfect for scalable UI elements
const buttonSprite = new Sprite(engine, buttonTexture);
buttonSprite.border = new Vector4(15, 15, 15, 15); // 15px borders on all sides

const buttonRenderer = entity.addComponent(SpriteRenderer);
buttonRenderer.sprite = buttonSprite;
buttonRenderer.drawMode = SpriteDrawMode.Sliced;
buttonRenderer.width = 300;  // Scales properly with borders intact
buttonRenderer.height = 80;
```

### Tiled Sprites (Patterns)

```typescript
// Repeating background patterns
const patternSprite = new Sprite(engine, patternTexture);
const patternRenderer = entity.addComponent(SpriteRenderer);
patternRenderer.sprite = patternSprite;
patternRenderer.drawMode = SpriteDrawMode.Tiled;
patternRenderer.tileMode = SpriteTileMode.Continuous;
patternRenderer.width = 1000;  // Large area filled with repeating pattern
patternRenderer.height = 600;

// Adaptive tiling for crisp edges
patternRenderer.tileMode = SpriteTileMode.Adaptive;
patternRenderer.tiledAdaptiveThreshold = 0.5; // Stretch threshold
```

### Sprite Masking System

```typescript
// Layer-based masking setup
enum CustomMaskLayer {
  Background = 1 << 0,
  Characters = 1 << 1,
  UI = 1 << 2,
  Effects = 1 << 3
}

// Create mask for UI elements
const uiMask = uiMaskEntity.addComponent(SpriteMask);
uiMask.sprite = circleMaskSprite;
uiMask.influenceLayers = CustomMaskLayer.UI;
uiMask.alphaCutoff = 0.1; // Very transparent threshold

// Apply mask to sprite renderers
const uiElement = uiEntity.addComponent(SpriteRenderer);
uiElement.maskLayer = CustomMaskLayer.UI;
uiElement.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
```

## Performance Optimization

### Sprite Batching

```typescript
// Sprites with same material and texture automatically batch
// Use same texture atlas for multiple sprites to enable batching
const atlasTexture = await engine.resourceManager.load("characters.png");

const sprite1 = new Sprite(engine, atlasTexture);
sprite1.atlasRegion = new Rect(0, 0, 0.25, 0.5);    // Character 1

const sprite2 = new Sprite(engine, atlasTexture);
sprite2.atlasRegion = new Rect(0.25, 0, 0.25, 0.5); // Character 2

// Both sprites will be batched together in rendering
```

### Memory Management

```typescript
// Sprites are reference-counted resources
const sprite = new Sprite(engine, texture);
spriteRenderer.sprite = sprite; // Increments reference count

// Cleanup
spriteRenderer.sprite = null;   // Decrements reference count
// Sprite automatically destroyed when reference count reaches 0
```

## Integration Examples

### 2D Character System

```typescript
class Character2D {
  private spriteRenderer: SpriteRenderer;
  private animations: Map<string, Sprite[]> = new Map();
  
  constructor(entity: Entity, atlasTexture: Texture2D) {
    this.spriteRenderer = entity.addComponent(SpriteRenderer);
    this.spriteRenderer.drawMode = SpriteDrawMode.Simple;
    
    // Setup animation frames from atlas
    this.setupAnimations(atlasTexture);
  }
  
  private setupAnimations(atlasTexture: Texture2D): void {
    // Idle animation frames
    const idleFrames: Sprite[] = [];
    for (let i = 0; i < 4; i++) {
      const frame = new Sprite(this.spriteRenderer.entity.engine, atlasTexture);
      frame.atlasRegion = new Rect(i * 0.25, 0, 0.25, 0.5);
      idleFrames.push(frame);
    }
    this.animations.set("idle", idleFrames);
  }
  
  playAnimation(name: string, frameIndex: number): void {
    const frames = this.animations.get(name);
    if (frames && frames[frameIndex]) {
      this.spriteRenderer.sprite = frames[frameIndex];
    }
  }
}
```

### UI System with Masking

```typescript
class UIPanel {
  private panelEntity: Entity;
  private maskEntity: Entity;
  private contentEntities: Entity[] = [];
  
  constructor(engine: Engine, panelTexture: Texture2D, maskTexture: Texture2D) {
    // Create panel background
    this.panelEntity = engine.sceneManager.activeScene.createRootEntity("Panel");
    const panelRenderer = this.panelEntity.addComponent(SpriteRenderer);
    panelRenderer.sprite = new Sprite(engine, panelTexture);
    panelRenderer.drawMode = SpriteDrawMode.Sliced;
    
    // Create mask for content clipping
    this.maskEntity = this.panelEntity.createChild("Mask");
    const mask = this.maskEntity.addComponent(SpriteMask);
    mask.sprite = new Sprite(engine, maskTexture);
    mask.influenceLayers = SpriteMaskLayer.UI;
    
    this.setupContentArea();
  }
  
  private setupContentArea(): void {
    // Content sprites will be clipped by the mask
    const contentEntity = this.panelEntity.createChild("Content");
    const contentRenderer = contentEntity.addComponent(SpriteRenderer);
    contentRenderer.maskLayer = SpriteMaskLayer.UI;
    contentRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    
    this.contentEntities.push(contentEntity);
  }
}
```

### Tiled Background System

```typescript
class ScrollingBackground {
  private backgroundRenderers: SpriteRenderer[] = [];
  private scrollSpeed: number = 50;
  
  constructor(engine: Engine, backgroundTexture: Texture2D, layers: number = 3) {
    for (let i = 0; i < layers; i++) {
      const entity = engine.sceneManager.activeScene.createRootEntity(`Background_${i}`);
      entity.transform.setPosition(0, 0, -i); // Layer depth
      
      const renderer = entity.addComponent(SpriteRenderer);
      renderer.sprite = new Sprite(engine, backgroundTexture);
      renderer.drawMode = SpriteDrawMode.Tiled;
      renderer.tileMode = SpriteTileMode.Continuous;
      renderer.width = 2000;  // Large repeating area
      renderer.height = 1000;
      
      // Parallax effect - further layers move slower
      const parallaxFactor = 1 - (i * 0.3);
      this.backgroundRenderers.push(renderer);
    }
  }
  
  update(deltaTime: number): void {
    this.backgroundRenderers.forEach((renderer, index) => {
      const parallaxFactor = 1 - (index * 0.3);
      const entity = renderer.entity;
      const currentPos = entity.transform.position;
      entity.transform.setPosition(
        currentPos.x - this.scrollSpeed * parallaxFactor * deltaTime,
        currentPos.y,
        currentPos.z
      );
    });
  }
}
```

## Best Practices

### Texture Atlas Organization

```typescript
// Use power-of-2 textures for optimal performance
// Organize related sprites in same atlas for batching
// Example atlas layout:
// - Characters: 512x512 atlas with 8x8 grid of 64x64 sprites
// - UI Elements: 256x256 atlas with variable-sized elements
// - Effects: 1024x512 atlas with animation sequences

const characterAtlas = await engine.resourceManager.load("characters_512.png");
const uiAtlas = await engine.resourceManager.load("ui_256.png");
const effectsAtlas = await engine.resourceManager.load("effects_1024.png");
```

### Memory Optimization

```typescript
// Share sprites between multiple renderers when possible
const sharedSprite = new Sprite(engine, texture);

const renderer1 = entity1.addComponent(SpriteRenderer);
const renderer2 = entity2.addComponent(SpriteRenderer);
renderer1.sprite = sharedSprite; // Reference count: 1
renderer2.sprite = sharedSprite; // Reference count: 2

// Use object pooling for frequently created/destroyed sprites
class SpritePool {
  private pool: Sprite[] = [];
  
  getSprite(texture: Texture2D): Sprite {
    return this.pool.pop() || new Sprite(this.engine, texture);
  }
  
  returnSprite(sprite: Sprite): void {
    sprite.texture = null; // Clear reference
    this.pool.push(sprite);
  }
}
```

### Performance Guidelines

```typescript
// Batch sprites by material and texture
// Minimize draw calls by using texture atlases
// Use appropriate draw modes:
// - Simple: For most 2D sprites
// - Sliced: For scalable UI elements only
// - Tiled: For repeating patterns only

// Avoid frequent sprite swapping in renderers
// Instead, create multiple renderers and enable/disable as needed
class OptimizedSpriteManager {
  private renderers: Map<string, SpriteRenderer> = new Map();
  
  setupSprites(entity: Entity, sprites: Map<string, Sprite>): void {
    sprites.forEach((sprite, name) => {
      const renderer = entity.addComponent(SpriteRenderer);
      renderer.sprite = sprite;
      renderer.enabled = false; // Start disabled
      this.renderers.set(name, renderer);
    });
  }
  
  showSprite(name: string): void {
    // Disable all others
    this.renderers.forEach(renderer => renderer.enabled = false);
    // Enable target
    const target = this.renderers.get(name);
    if (target) target.enabled = true;
  }
}
```

## Common Patterns

### Animated Sprites

```typescript
// Frame-based animation using sprite swapping
class SpriteAnimator {
  private frames: Sprite[];
  private currentFrame: number = 0;
  private frameTime: number = 0;
  private frameDuration: number = 0.1; // 10 FPS
  
  constructor(private renderer: SpriteRenderer, frames: Sprite[]) {
    this.frames = frames;
    this.renderer.sprite = frames[0];
  }
  
  update(deltaTime: number): void {
    this.frameTime += deltaTime;
    if (this.frameTime >= this.frameDuration) {
      this.frameTime = 0;
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      this.renderer.sprite = this.frames[this.currentFrame];
    }
  }
}
```

### Dynamic UI Scaling

```typescript
// Responsive UI using sliced sprites
class ResponsiveButton {
  private renderer: SpriteRenderer;
  private baseSize: Vector2;
  
  constructor(entity: Entity, buttonSprite: Sprite, baseWidth: number, baseHeight: number) {
    this.renderer = entity.addComponent(SpriteRenderer);
    this.renderer.sprite = buttonSprite;
    this.renderer.drawMode = SpriteDrawMode.Sliced;
    this.baseSize = new Vector2(baseWidth, baseHeight);
    this.updateSize(1.0); // Default scale
  }
  
  updateSize(scale: number): void {
    this.renderer.width = this.baseSize.x * scale;
    this.renderer.height = this.baseSize.y * scale;
  }
  
  // Adapt to text content
  adaptToText(textWidth: number, textHeight: number, padding: number = 20): void {
    this.renderer.width = textWidth + padding;
    this.renderer.height = textHeight + padding;
  }
}
```

The Sprite System provides a comprehensive foundation for 2D graphics in Galacean Engine, supporting everything from simple 2D games to complex UI systems with advanced features like texture atlasing, nine-slice rendering, and sophisticated masking capabilities.