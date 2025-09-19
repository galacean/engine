# 2D Graphics

Galacean's 2D graphics system provides comprehensive sprite and text rendering capabilities for 2D games and UI elements. Built on efficient batching and atlas systems, it supports multiple draw modes, advanced text rendering with font management, and sprite masking for complex 2D scenes.

## Overview

The 2D graphics system consists of several key components:
- **SpriteRenderer**: Renders sprites with various draw modes and batching optimization
- **Sprite**: Resource that defines texture regions, borders, and atlas mapping
- **TextRenderer**: Advanced text rendering with font support and layout options
- **Font**: Font resource management with atlas generation and character mapping
- **SpriteAtlas**: Texture atlas management for efficient sprite batching
- **Masking System**: SpriteMask for clipping and visual effects

## Quick Start

```ts
import { WebGLEngine, Entity, AssetType } from "@galacean/engine";
import { SpriteRenderer, TextRenderer, Sprite, SpriteDrawMode } from "@galacean/engine";
import { Vector2, Color } from "@galacean/engine-math";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;

// Create sprite entity
const spriteEntity = scene.createRootEntity("Sprite");
const spriteRenderer = spriteEntity.addComponent(SpriteRenderer);

// Load texture and create sprite
const texture = await engine.resourceManager.load({
  url: "path/to/sprite.png",
  type: AssetType.Texture2D
});

const sprite = new Sprite(engine, texture);
spriteRenderer.sprite = sprite;
spriteRenderer.drawMode = SpriteDrawMode.Simple;

// Create text entity
const textEntity = scene.createRootEntity("Text");
const textRenderer = textEntity.addComponent(TextRenderer);
textRenderer.text = "Hello 2D Graphics!";
textRenderer.fontSize = 32;
textRenderer.color = new Color(1, 1, 1, 1);

engine.run();
```

## Sprite System

### Sprite Resource Management

Sprites define how textures are rendered with support for regions, pivots, and borders:

```ts
import { Sprite } from "@galacean/engine";
import { Rect, Vector2, Vector4 } from "@galacean/engine-math";

// Basic sprite creation
const sprite = new Sprite(engine, texture);

// Sprite with custom region (normalized coordinates)
const region = new Rect(0.25, 0.25, 0.5, 0.5); // Use center quarter of texture
const pivot = new Vector2(0.5, 0); // Bottom-center pivot
const sprite = new Sprite(engine, texture, region, pivot);

// Sprite dimensions
sprite.width = 100; // Custom width in world units
sprite.height = 100; // Custom height in world units

// Advanced sprite configuration
sprite.region = new Rect(0, 0, 1, 1); // Full texture region
sprite.pivot = new Vector2(0.5, 0.5); // Center pivot
sprite.border = new Vector4(10, 10, 10, 10); // 9-slice borders (left, bottom, right, top)

// Atlas sprite configuration
sprite.atlasRegion = new Rect(0.1, 0.1, 0.3, 0.3); // Region within atlas
sprite.atlasRegionOffset = new Vector4(0.05, 0.05, 0.05, 0.05); // Padding offset
sprite.atlasRotated = false; // Whether sprite is rotated in atlas
```

### SpriteRenderer Component

SpriteRenderer handles sprite display with various draw modes and optimization features:

```ts
import { SpriteRenderer, SpriteDrawMode, SpriteTileMode } from "@galacean/engine";
import { Color } from "@galacean/engine-math";

const spriteRenderer = entity.addComponent(SpriteRenderer);

// Basic sprite configuration
spriteRenderer.sprite = sprite;
spriteRenderer.color = new Color(1, 0.5, 0.5, 0.8); // Tinted red, semi-transparent

// Size control
spriteRenderer.width = 200; // Override sprite width
spriteRenderer.height = 150; // Override sprite height

// Flipping
spriteRenderer.flipX = true; // Flip horizontally
spriteRenderer.flipY = false; // No vertical flip

// Draw modes
spriteRenderer.drawMode = SpriteDrawMode.Simple; // Basic sprite rendering
spriteRenderer.drawMode = SpriteDrawMode.Sliced; // 9-slice scaling
spriteRenderer.drawMode = SpriteDrawMode.Tiled; // Tiled repetition

// Tiled mode configuration
spriteRenderer.tileMode = SpriteTileMode.Continuous; // Seamless tiling
spriteRenderer.tileMode = SpriteTileMode.Adaptive; // Adaptive tiling
spriteRenderer.tiledAdaptiveThreshold = 0.5; // Stretch threshold for adaptive mode
```

### Sprite Draw Modes

Different draw modes provide various scaling and rendering behaviors:

```ts
// Simple Mode - Direct texture mapping
spriteRenderer.drawMode = SpriteDrawMode.Simple;
// - Stretches entire sprite to fit dimensions
// - Best for solid backgrounds, simple icons
// - Fastest rendering performance

// Sliced Mode - 9-slice scaling
spriteRenderer.drawMode = SpriteDrawMode.Sliced;
spriteRenderer.sprite.border = new Vector4(20, 20, 20, 20); // Border sizes in pixels
// - Corners remain unscaled
// - Edges stretch in one direction
// - Center scales in both directions
// - Perfect for UI panels, buttons

// Tiled Mode - Repetitive rendering
spriteRenderer.drawMode = SpriteDrawMode.Tiled;
spriteRenderer.tileMode = SpriteTileMode.Continuous;
// - Repeats sprite texture to fill area
// - Maintains sprite aspect ratio
// - Great for patterns, backgrounds

// Adaptive Tiled Mode
spriteRenderer.tileMode = SpriteTileMode.Adaptive;
spriteRenderer.tiledAdaptiveThreshold = 0.4; // 40% stretch threshold
// - Combines stretching and tiling
// - Stretches when close to perfect fit
// - Tiles when stretching would be too extreme
```

## Text Rendering System

### TextRenderer Component

TextRenderer provides advanced text rendering with layout, styling, and internationalization support:

```ts
import { TextRenderer, TextHorizontalAlignment, TextVerticalAlignment } from "@galacean/engine";
import { FontStyle, OverflowMode } from "@galacean/engine";
import { Color } from "@galacean/engine-math";

const textRenderer = entity.addComponent(TextRenderer);

// Basic text properties
textRenderer.text = "Hello World!";
textRenderer.fontSize = 24;
textRenderer.color = new Color(0, 0, 0, 1); // Black text

// Font and styling
textRenderer.font = customFont; // Custom font resource
textRenderer.fontStyle = FontStyle.Bold | FontStyle.Italic; // Combined styles

// Dimensions and layout
textRenderer.width = 300; // Text container width
textRenderer.height = 100; // Text container height

// Text alignment
textRenderer.horizontalAlignment = TextHorizontalAlignment.Center;
textRenderer.verticalAlignment = TextVerticalAlignment.Middle;

// Text wrapping and overflow
textRenderer.enableWrapping = true; // Wrap text to new lines
textRenderer.overflowMode = OverflowMode.Truncate; // Clip overflow text
textRenderer.lineSpacing = 5; // Additional space between lines (pixels)

// Advanced layout options
textRenderer.horizontalAlignment = TextHorizontalAlignment.Left;
textRenderer.verticalAlignment = TextVerticalAlignment.Top;
textRenderer.overflowMode = OverflowMode.Overflow; // Allow text to extend beyond bounds
```

### Font Management

Font resources manage character atlases and rendering metrics:

```ts
import { Font, AssetType } from "@galacean/engine";

// Load font resource
const font = await engine.resourceManager.load({
  url: "fonts/custom-font.ttf",
  type: AssetType.Font
});

// Apply to text renderer
textRenderer.font = font;

// Font supports automatic atlas generation for different sizes and styles
// Each font size/style combination creates a SubFont with its own texture atlas
```

### Text Alignment and Layout

Comprehensive text positioning and alignment options:

```ts
import { 
  TextHorizontalAlignment, 
  TextVerticalAlignment, 
  OverflowMode 
} from "@galacean/engine";

// Horizontal alignment options
textRenderer.horizontalAlignment = TextHorizontalAlignment.Left;   // Left-aligned
textRenderer.horizontalAlignment = TextHorizontalAlignment.Center; // Centered
textRenderer.horizontalAlignment = TextHorizontalAlignment.Right;  // Right-aligned

// Vertical alignment options
textRenderer.verticalAlignment = TextVerticalAlignment.Top;    // Top-aligned
textRenderer.verticalAlignment = TextVerticalAlignment.Center; // Vertically centered
textRenderer.verticalAlignment = TextVerticalAlignment.Bottom; // Bottom-aligned

// Overflow handling
textRenderer.overflowMode = OverflowMode.Overflow; // Allow text beyond bounds
textRenderer.overflowMode = OverflowMode.Truncate; // Clip text at bounds

// Wrapping behavior
textRenderer.enableWrapping = true; // Enable line wrapping
textRenderer.lineSpacing = 2; // Extra spacing between lines

// Dynamic text sizing
textRenderer.width = 0;  // Auto-width (no wrapping)
textRenderer.height = 0; // Auto-height (no truncation)
```

## Sprite Atlas System

### SpriteAtlas Management

Sprite atlases optimize rendering by combining multiple sprites into single textures:

```ts
import { SpriteAtlas, AssetType } from "@galacean/engine";

// Load sprite atlas
const atlas = await engine.resourceManager.load({
  url: "atlases/game-sprites.json",
  type: AssetType.SpriteAtlas
});

// Get sprites from atlas
const playerSprite = atlas.getSprite("player");
const enemySprite = atlas.getSprite("enemy");
const bulletSprite = atlas.getSprite("bullet");

// Use atlas sprites
spriteRenderer.sprite = playerSprite;

// Atlas sprites automatically have correct regions and offsets configured
// This enables efficient batching when multiple atlas sprites are rendered together
```

### Font Atlas System

Font atlases efficiently pack character glyphs for text rendering:

```ts
import { FontAtlas } from "@galacean/engine";

// Font atlases are automatically managed by the Font system
// Each font size/style combination generates a FontAtlas
// Character glyphs are dynamically added to atlases as needed

// Font atlas management is automatic—each font/size/style builds atlases on demand.
// Use the engine's debugging overlay or custom instrumentation to inspect atlas pages
// when optimizing memory usage (e.g., track `textRenderer.fontAtlas.texture` during development).
```

## Masking and Clipping

### SpriteMask Component

SpriteMask enables clipping and visual effects for 2D graphics:

```ts
import { SpriteMask, SpriteMaskInteraction } from "@galacean/engine";

// Create mask entity
const maskEntity = scene.createRootEntity("Mask");
const spriteMask = maskEntity.addComponent(SpriteMask);
spriteMask.sprite = maskSprite; // Sprite defining mask shape

// Configure masked content
const maskedEntity = scene.createRootEntity("MaskedContent");
const maskedRenderer = maskedEntity.addComponent(SpriteRenderer);
maskedRenderer.sprite = contentSprite;
maskedRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;

// Mask interaction modes
maskedRenderer.maskInteraction = SpriteMaskInteraction.None; // No masking
maskedRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask; // Show inside mask
maskedRenderer.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask; // Show outside mask

// Mask layers for complex masking setups
spriteMask.maskLayer = SpriteMaskLayer.Layer0;
maskedRenderer.maskLayer = SpriteMaskLayer.Layer0; // Must match for masking to apply
```

## Performance Optimization

### Batching and Draw Calls

Optimize 2D rendering performance through intelligent batching:

```ts
// Batching is automatic but can be optimized through:

// 1. Use same materials for multiple sprites
const sharedMaterial = new Material(engine, spriteShader);
spriteRenderer1.setMaterial(sharedMaterial);
spriteRenderer2.setMaterial(sharedMaterial);
spriteRenderer3.setMaterial(sharedMaterial);

// 2. Use sprite atlases to combine textures
const atlas = await engine.resourceManager.load({
  url: "game-atlas.json",
  type: AssetType.SpriteAtlas
});

// All sprites from same atlas can batch together
sprite1 = atlas.getSprite("player");
sprite2 = atlas.getSprite("enemy");
sprite3 = atlas.getSprite("powerup");

// 3. Group similar 2D objects in the scene hierarchy
const uiGroup = scene.createRootEntity("UI");
const gameObjectGroup = scene.createRootEntity("GameObjects");
const backgroundGroup = scene.createRootEntity("Backgrounds");

// 4. Use appropriate draw modes for different content
spriteRenderer.drawMode = SpriteDrawMode.Simple; // Fastest for simple sprites
spriteRenderer.drawMode = SpriteDrawMode.Sliced; // Good for UI with borders
spriteRenderer.drawMode = SpriteDrawMode.Tiled; // Efficient for repeating patterns
```

### Memory Management

Efficient resource usage for 2D graphics:

```ts
// Sprite and font resource pooling
class SpritePool {
  private pool: Sprite[] = [];
  
  getSprite(texture: Texture2D): Sprite {
    if (this.pool.length > 0) {
      const sprite = this.pool.pop()!;
      sprite.texture = texture;
      return sprite;
    }
    return new Sprite(engine, texture);
  }
  
  returnSprite(sprite: Sprite): void {
    sprite.texture = null;
    this.pool.push(sprite);
  }
}

// Minimize texture memory usage
// - Use power-of-2 texture dimensions when possible
// - Compress textures appropriately for platform
// - Use sprite atlases to reduce texture count
// - Dispose unused textures promptly

// Font optimization
// - Preload commonly used character sets
// - Use appropriate font sizes (avoid extreme scaling)
// - Share fonts between text renderers when possible
```

## Animation and Effects

### Sprite Animation

Animate sprites through property changes and atlas switching:

```ts
// Property-based animation
class SpriteAnimator extends Script {
  private time: number = 0;
  private spriteRenderer: SpriteRenderer;
  
  onAwake(): void {
    this.spriteRenderer = this.entity.getComponent(SpriteRenderer);
  }
  
  onUpdate(deltaTime: number): void {
    this.time += deltaTime;
    
    // Animate color
    const pulse = Math.sin(this.time * 2) * 0.5 + 0.5;
    this.spriteRenderer.color.set(1, pulse, pulse, 1);
    
    // Animate scale
    const scale = 1 + Math.sin(this.time) * 0.1;
    this.entity.transform.setScale(scale, scale, 1);
    
    // Animate rotation
    this.entity.transform.rotate(0, 0, deltaTime * 45);
  }
}

// Atlas-based sprite animation
class SpriteSequenceAnimator extends Script {
  public sprites: Sprite[] = [];
  public frameRate: number = 10;
  
  private currentFrame: number = 0;
  private frameTime: number = 0;
  private spriteRenderer: SpriteRenderer;
  
  onAwake(): void {
    this.spriteRenderer = this.entity.getComponent(SpriteRenderer);
  }
  
  onUpdate(deltaTime: number): void {
    this.frameTime += deltaTime;
    const frameDuration = 1 / this.frameRate;
    
    if (this.frameTime >= frameDuration) {
      this.frameTime -= frameDuration;
      this.currentFrame = (this.currentFrame + 1) % this.sprites.length;
      this.spriteRenderer.sprite = this.sprites[this.currentFrame];
    }
  }
}
```

### Text Effects

Create dynamic text effects and animations:

```ts
// Text typing effect
class TypewriterEffect extends Script {
  public fullText: string = "";
  public typingSpeed: number = 50; // Characters per second
  
  private textRenderer: TextRenderer;
  private currentLength: number = 0;
  private timer: number = 0;
  
  onAwake(): void {
    this.textRenderer = this.entity.getComponent(TextRenderer);
    this.fullText = this.textRenderer.text;
    this.textRenderer.text = "";
  }
  
  onUpdate(deltaTime: number): void {
    if (this.currentLength < this.fullText.length) {
      this.timer += deltaTime;
      const charactersToShow = Math.floor(this.timer * this.typingSpeed);
      this.currentLength = Math.min(charactersToShow, this.fullText.length);
      this.textRenderer.text = this.fullText.substring(0, this.currentLength);
    }
  }
}

// Text color wave effect
class TextWaveEffect extends Script {
  private textRenderer: TextRenderer;
  private time: number = 0;
  
  onAwake(): void {
    this.textRenderer = this.entity.getComponent(TextRenderer);
  }
  
  onUpdate(deltaTime: number): void {
    this.time += deltaTime;
    
    // Create wave effect with color
    const hue = (Math.sin(this.time * 2) + 1) * 0.5;
    this.textRenderer.color.set(hue, 1 - hue, 0.5, 1);
    
    // Oscillate font size
    const sizeVariation = Math.sin(this.time * 3) * 2;
    this.textRenderer.fontSize = 24 + sizeVariation;
  }
}
```

## API Reference

```apidoc
SpriteRenderer:
  Properties:
    sprite: Sprite
      - The sprite resource to render.
    drawMode: SpriteDrawMode
      - Simple, Sliced, or Tiled rendering mode.
    color: Color
      - Tint color and transparency for the sprite.
    width: number
      - Render width in world coordinates. Overrides sprite width if set.
    height: number
      - Render height in world coordinates. Overrides sprite height if set.
    flipX: boolean
      - Flip sprite horizontally.
    flipY: boolean
      - Flip sprite vertically.
    tileMode: SpriteTileMode
      - Continuous or Adaptive tiling mode (for Tiled draw mode).
    tiledAdaptiveThreshold: number
      - Stretch threshold for adaptive tiling (0-1 range).
    maskInteraction: SpriteMaskInteraction
      - How sprite interacts with sprite masks.
    maskLayer: SpriteMaskLayer
      - Mask layer for sprite mask interactions.

Sprite:
  Properties:
    texture: Texture2D
      - Source texture for the sprite.
    width: number
      - Sprite width in world coordinates.
    height: number
      - Sprite height in world coordinates.
    region: Rect
      - Texture region in normalized coordinates (0-1).
    pivot: Vector2
      - Pivot point in normalized coordinates (0-1).
    border: Vector4
      - 9-slice borders (left, bottom, right, top) in normalized coordinates.
    atlasRegion: Rect
      - Region within atlas texture in normalized coordinates.
    atlasRegionOffset: Vector4
      - Padding offset within atlas region.
    atlasRotated: boolean
      - Whether sprite is rotated 90° in atlas.

  Methods:
    clone(): Sprite
      - Create a copy of the sprite.

TextRenderer:
  Properties:
    text: string
      - Text content to display.
    font: Font
      - Font resource for text rendering.
    fontSize: number
      - Font size in points.
    fontStyle: FontStyle
      - Font style flags (Bold, Italic, etc.).
    color: Color
      - Text color and transparency.
    width: number
      - Text container width in world coordinates.
    height: number
      - Text container height in world coordinates.
    horizontalAlignment: TextHorizontalAlignment
      - Left, Center, or Right alignment.
    verticalAlignment: TextVerticalAlignment
      - Top, Center, or Bottom alignment.
    enableWrapping: boolean
      - Whether text wraps to new lines.
    overflowMode: OverflowMode
      - How to handle text exceeding bounds.
    lineSpacing: number
      - Additional spacing between lines in pixels.
    maskInteraction: SpriteMaskInteraction
      - How text interacts with sprite masks.
    maskLayer: SpriteMaskLayer
      - Mask layer for sprite mask interactions.

SpriteMask:
  Properties:
    sprite: Sprite
      - Sprite defining the mask shape.
    maskLayer: SpriteMaskLayer
      - Layer this mask operates on.

Font:
  Properties:
    name: string
      - Font family name.
    fontAtlas: FontAtlas
      - Current atlas used for rendering. Inspect for debugging or preloading glyphs.
```

## Best Practices

- **Atlas Usage**: Use sprite atlases to minimize draw calls and improve batching efficiency
- **Draw Mode Selection**: Choose appropriate draw modes - Simple for performance, Sliced for UI, Tiled for patterns
- **Font Management**: Limit font sizes and styles to reduce memory usage and atlas generation
- **Masking Performance**: Use sprite masks sparingly as they can break batching
- **Color Optimization**: Avoid frequent color changes that might break batching
- **Text Layout**: Pre-calculate text dimensions when possible rather than relying on auto-sizing
- **Resource Cleanup**: Properly dispose of sprites and fonts when no longer needed
- **Texture Formats**: Use appropriate texture compression for sprites and font atlases

## Common Patterns

### Animated Sprite Button

```ts
class AnimatedButton extends Script {
  private spriteRenderer: SpriteRenderer;
  private originalScale: Vector3;
  private isPressed: boolean = false;
  
  onAwake(): void {
    this.spriteRenderer = this.entity.getComponent(SpriteRenderer);
    this.originalScale = this.entity.transform.scale.clone();
  }
  
  onPointerDown(): void {
    this.isPressed = true;
    this.entity.transform.setScale(
      this.originalScale.x * 0.95,
      this.originalScale.y * 0.95,
      this.originalScale.z
    );
    this.spriteRenderer.color.set(0.8, 0.8, 0.8, 1);
  }
  
  onPointerUp(): void {
    this.isPressed = false;
    this.entity.transform.scale = this.originalScale;
    this.spriteRenderer.color.set(1, 1, 1, 1);
  }
}
```

### Multi-Language Text System

```ts
class LocalizedText extends Script {
  public textKey: string = "";
  private textRenderer: TextRenderer;
  
  onAwake(): void {
    this.textRenderer = this.entity.getComponent(TextRenderer);
    this.updateText();
  }
  
  updateText(): void {
    const localizedString = Localization.getString(this.textKey);
    this.textRenderer.text = localizedString;
    
    // Adjust font if needed for different languages
    const currentLanguage = Localization.getCurrentLanguage();
    if (currentLanguage === "chinese") {
      this.textRenderer.font = chineseFont;
    } else {
      this.textRenderer.font = englishFont;
    }
  }
}
```

### Dynamic Sprite Loading

```ts
class DynamicSpriteLoader extends Script {
  public spriteUrl: string = "";
  private spriteRenderer: SpriteRenderer;
  
  onAwake(): void {
    this.spriteRenderer = this.entity.getComponent(SpriteRenderer);
  }
  
  async loadSprite(url: string): Promise<void> {
    try {
      const texture = await this.engine.resourceManager.load({
        url: url,
        type: AssetType.Texture2D
      });
      
      const sprite = new Sprite(this.engine, texture);
      this.spriteRenderer.sprite = sprite;
    } catch (error) {
      console.error("Failed to load sprite:", error);
    }
  }
}
```
