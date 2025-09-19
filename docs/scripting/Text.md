# Text System - Galacean Engine LLM Documentation

## System Overview

The Text System provides comprehensive 2D text rendering capabilities with advanced typography features, dynamic font management, and high-performance character caching. It supports multi-language text layout, complex alignment modes, and sophisticated text wrapping algorithms.

### Core Architecture

```typescript
// Basic text rendering setup
const textRenderer = entity.addComponent(TextRenderer);
textRenderer.text = "Hello World";
textRenderer.font = Font.createFromOS(engine, "Arial");
textRenderer.fontSize = 24;
textRenderer.color = new Color(1, 1, 1, 1);
```

## Core Classes

### TextRenderer Component

The `TextRenderer` component handles all aspects of text rendering including layout calculation, alignment, wrapping, and visual styling.

#### Essential Properties

```typescript
// Text content and basic styling
textRenderer.text = "Multi-line text content";
textRenderer.font = Font.createFromOS(engine, "Arial");
textRenderer.fontSize = 32;
textRenderer.fontStyle = FontStyle.Bold | FontStyle.Italic;
textRenderer.color = new Color(0.2, 0.4, 0.8, 1.0);

// Size and layout control
textRenderer.width = 400;   // Text container width
textRenderer.height = 200;  // Text container height
textRenderer.lineSpacing = 5; // Additional spacing between lines

// Text alignment
textRenderer.horizontalAlignment = TextHorizontalAlignment.Center;
textRenderer.verticalAlignment = TextVerticalAlignment.Middle;

// Text wrapping and overflow
textRenderer.enableWrapping = true;
textRenderer.overflowMode = OverflowMode.Truncate;
```

#### Font Styling Options

```typescript
// Font style combinations
textRenderer.fontStyle = FontStyle.None;                    // Normal text
textRenderer.fontStyle = FontStyle.Bold;                    // Bold text
textRenderer.fontStyle = FontStyle.Italic;                  // Italic text
textRenderer.fontStyle = FontStyle.Bold | FontStyle.Italic; // Bold and italic

// Dynamic font size scaling
textRenderer.fontSize = 16;  // Small text
textRenderer.fontSize = 24;  // Regular text
textRenderer.fontSize = 48;  // Large headers
textRenderer.fontSize = 64;  // Display text
```

#### Text Alignment System

```typescript
// Horizontal alignment options
textRenderer.horizontalAlignment = TextHorizontalAlignment.Left;
textRenderer.horizontalAlignment = TextHorizontalAlignment.Center;
textRenderer.horizontalAlignment = TextHorizontalAlignment.Right;

// Vertical alignment options
textRenderer.verticalAlignment = TextVerticalAlignment.Top;
textRenderer.verticalAlignment = TextVerticalAlignment.Center;
textRenderer.verticalAlignment = TextVerticalAlignment.Bottom;

// Perfect center alignment
textRenderer.horizontalAlignment = TextHorizontalAlignment.Center;
textRenderer.verticalAlignment = TextVerticalAlignment.Center;
```

#### Text Wrapping and Overflow

```typescript
// Enable text wrapping within container bounds
textRenderer.enableWrapping = true;
textRenderer.width = 300; // Text will wrap at this width

// Overflow handling modes
textRenderer.overflowMode = OverflowMode.Overflow;  // Text extends beyond bounds
textRenderer.overflowMode = OverflowMode.Truncate; // Text clips at bounds

// Multi-line text with proper wrapping
textRenderer.text = `This is a long paragraph that will automatically wrap to multiple lines when it exceeds the specified width of the text container.`;
```

### Font Class

The `Font` class manages font resources with automatic caching and system font integration.

#### System Font Creation

```typescript
// Create fonts from system fonts
const arialFont = Font.createFromOS(engine, "Arial");
const timesFont = Font.createFromOS(engine, "Times New Roman");
const courierFont = Font.createFromOS(engine, "Courier New");

// Generic font families (automatically available)
const serifFont = Font.createFromOS(engine, "serif");
const sansSerifFont = Font.createFromOS(engine, "sans-serif");
const monospaceFont = Font.createFromOS(engine, "monospace");

// Font reuse through automatic caching
const font1 = Font.createFromOS(engine, "Arial"); // Creates new font
const font2 = Font.createFromOS(engine, "Arial"); // Returns cached font
console.log(font1 === font2); // true - same font instance
```

#### Font Resource Management

```typescript
// Fonts are automatically reference-counted
textRenderer.font = Font.createFromOS(engine, "Arial"); // Increments reference
textRenderer.font = null; // Decrements reference, auto-cleanup when count reaches 0

// Multiple renderers can share the same font efficiently
const sharedFont = Font.createFromOS(engine, "Helvetica");
textRenderer1.font = sharedFont; // Reference count: 1
textRenderer2.font = sharedFont; // Reference count: 2
textRenderer3.font = sharedFont; // Reference count: 3
```

### TextUtils Utility Class

The `TextUtils` class provides advanced text measurement and layout calculation functions.

#### Text Measurement

```typescript
// Font size measurement for layout calculations
const fontString = TextUtils.getNativeFontString("Arial", 24, FontStyle.Bold);
const fontInfo = TextUtils.measureFont(fontString);
console.log(fontInfo.ascent, fontInfo.descent, fontInfo.size);

// Individual character measurement
const charInfo = TextUtils.measureChar("A", fontString);
console.log(charInfo.w, charInfo.h, charInfo.xAdvance);

// Native font string generation
const nativeFont = TextUtils.getNativeFontString("Times New Roman", 18, FontStyle.Italic);
// Returns: "italic 18px Times New Roman"
```

#### Advanced Layout Calculation

```typescript
// Text measurement with wrapping
const textMetrics = TextUtils.measureTextWithWrap(
  textRenderer,        // Text renderer instance
  400,                // Container width in pixels
  200,                // Container height in pixels
  5                   // Line spacing in pixels
);

console.log(textMetrics.width);      // Actual text width
console.log(textMetrics.height);     // Total text height
console.log(textMetrics.lines);      // Array of text lines
console.log(textMetrics.lineWidths); // Width of each line
console.log(textMetrics.lineHeight); // Height of each line

// Text measurement without wrapping
const singleLineMetrics = TextUtils.measureTextWithoutWrap(
  textRenderer,
  200,  // Container height
  5     // Line spacing
);
```

## Advanced Features

### Multi-Language Text Support

```typescript
// International text rendering
textRenderer.text = "Hello 世界";

// Chinese/Japanese text with proper word breaking
textRenderer.text = "这是一段中文文本，支持自动换行和字符断行处理。";
textRenderer.enableWrapping = true;

// Mixed content with different writing systems
textRenderer.text = `
English text with proper wrapping.
中文文本支持正确的字符换行。
العربية النص مع الدعم الصحيح.
`;
```

### Dynamic Text Animation

```typescript
// Text content animation
class TypewriterEffect {
  private fullText: string;
  private currentText: string = "";
  private charIndex: number = 0;
  
  constructor(private textRenderer: TextRenderer, text: string) {
    this.fullText = text;
  }
  
  update(deltaTime: number): void {
    const speed = 20; // Characters per second
    this.charIndex += speed * deltaTime;
    
    const targetLength = Math.floor(this.charIndex);
    this.currentText = this.fullText.substring(0, targetLength);
    this.textRenderer.text = this.currentText;
  }
}

// Color animation
class TextColorAnimator {
  private time: number = 0;
  
  constructor(private textRenderer: TextRenderer) {}
  
  update(deltaTime: number): void {
    this.time += deltaTime;
    const hue = (this.time * 0.5) % 1.0;
    this.textRenderer.color = Color.fromHSV(hue, 0.8, 1.0);
  }
}
```

### Text Layout Templates

```typescript
// Responsive text layout system
class ResponsiveText {
  private baseWidth: number;
  private baseHeight: number;
  private baseFontSize: number;
  
  constructor(
    private textRenderer: TextRenderer,
    baseWidth: number,
    baseHeight: number,
    baseFontSize: number
  ) {
    this.baseWidth = baseWidth;
    this.baseHeight = baseHeight;
    this.baseFontSize = baseFontSize;
  }
  
  updateScale(scale: number): void {
    this.textRenderer.width = this.baseWidth * scale;
    this.textRenderer.height = this.baseHeight * scale;
    this.textRenderer.fontSize = this.baseFontSize * scale;
  }
  
  fitToContent(): void {
    // Temporarily disable wrapping to measure natural size
    const originalWrapping = this.textRenderer.enableWrapping;
    this.textRenderer.enableWrapping = false;
    
    const metrics = TextUtils.measureTextWithoutWrap(
      this.textRenderer,
      1000, // Large height
      this.textRenderer.lineSpacing
    );
    
    // Restore wrapping and set optimal size
    this.textRenderer.enableWrapping = originalWrapping;
    this.textRenderer.width = metrics.width + 20; // Add padding
    this.textRenderer.height = metrics.height + 10;
  }
}
```

### Performance Optimization

```typescript
// Character caching optimization
class OptimizedTextRenderer {
  private static characterCache = new Map<string, CharInfo>();
  
  static preloadCharacters(font: Font, characters: string): void {
    const fontString = TextUtils.getNativeFontString(
      font.name, 
      24, 
      FontStyle.None
    );
    
    for (const char of characters) {
      if (!this.characterCache.has(char)) {
        const charInfo = TextUtils.measureChar(char, fontString);
        this.characterCache.set(char, charInfo);
      }
    }
  }
  
  // Preload common characters for performance
  static preloadCommonChars(font: Font): void {
    const commonChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?-";
    this.preloadCharacters(font, commonChars);
  }
}

// Text batching for multiple renderers
class TextBatchManager {
  private textRenderers: TextRenderer[] = [];
  
  addRenderer(renderer: TextRenderer): void {
    this.textRenderers.push(renderer);
  }
  
  updateAllTexts(texts: string[]): void {
    // Batch update all renderers to minimize dirty flag operations
    this.textRenderers.forEach((renderer, index) => {
      if (texts[index]) {
        renderer.text = texts[index];
      }
    });
  }
}
```

## Integration Examples

### UI Text System

```typescript
class UITextSystem {
  private titleText: TextRenderer;
  private bodyText: TextRenderer;
  private buttonText: TextRenderer;
  
  constructor(engine: Engine, parentEntity: Entity) {
    this.setupTextElements(engine, parentEntity);
  }
  
  private setupTextElements(engine: Engine, parent: Entity): void {
    // Title text
    const titleEntity = parent.createChild("Title");
    this.titleText = titleEntity.addComponent(TextRenderer);
    this.titleText.font = Font.createFromOS(engine, "Arial");
    this.titleText.fontSize = 32;
    this.titleText.fontStyle = FontStyle.Bold;
    this.titleText.color = new Color(0.1, 0.1, 0.1, 1);
    this.titleText.horizontalAlignment = TextHorizontalAlignment.Center;
    this.titleText.verticalAlignment = TextVerticalAlignment.Top;
    
    // Body text with wrapping
    const bodyEntity = parent.createChild("Body");
    bodyEntity.transform.setPosition(0, -50, 0);
    this.bodyText = bodyEntity.addComponent(TextRenderer);
    this.bodyText.font = Font.createFromOS(engine, "serif");
    this.bodyText.fontSize = 16;
    this.bodyText.color = new Color(0.2, 0.2, 0.2, 1);
    this.bodyText.width = 400;
    this.bodyText.height = 200;
    this.bodyText.enableWrapping = true;
    this.bodyText.horizontalAlignment = TextHorizontalAlignment.Left;
    this.bodyText.verticalAlignment = TextVerticalAlignment.Top;
    this.bodyText.lineSpacing = 3;
    
    // Button text
    const buttonEntity = parent.createChild("Button");
    buttonEntity.transform.setPosition(0, -150, 0);
    this.buttonText = buttonEntity.addComponent(TextRenderer);
    this.buttonText.font = Font.createFromOS(engine, "sans-serif");
    this.buttonText.fontSize = 18;
    this.buttonText.fontStyle = FontStyle.Bold;
    this.buttonText.color = new Color(1, 1, 1, 1);
    this.buttonText.horizontalAlignment = TextHorizontalAlignment.Center;
    this.buttonText.verticalAlignment = TextVerticalAlignment.Center;
  }
  
  setContent(title: string, body: string, buttonLabel: string): void {
    this.titleText.text = title;
    this.bodyText.text = body;
    this.buttonText.text = buttonLabel;
  }
}
```

### Localization System

```typescript
interface LocalizedText {
  [key: string]: {
    [language: string]: string;
  };
}

class LocalizationManager {
  private currentLanguage: string = "en";
  private textDatabase: LocalizedText = {
    "welcome": {
      "en": "Welcome to our game!",
      "zh": "欢迎来到我们的游戏！",
      "ja": "ゲームへようこそ！",
      "es": "¡Bienvenido a nuestro juego!"
    },
    "instructions": {
      "en": "Use WASD keys to move your character around the world.",
      "zh": "使用WASD键移动您的角色在世界中移动。",
      "ja": "WASDキーを使ってキャラクターを世界中で移動させてください。",
      "es": "Usa las teclas WASD para mover tu personaje por el mundo."
    }
  };
  
  private textRenderers: Map<string, TextRenderer> = new Map();
  
  registerText(key: string, renderer: TextRenderer): void {
    this.textRenderers.set(key, renderer);
    this.updateText(key);
  }
  
  setLanguage(language: string): void {
    this.currentLanguage = language;
    this.updateAllTexts();
  }
  
  private updateText(key: string): void {
    const renderer = this.textRenderers.get(key);
    const textData = this.textDatabase[key];
    
    if (renderer && textData) {
      const localizedText = textData[this.currentLanguage] || textData["en"];
      renderer.text = localizedText;
      
      // Adjust font for different languages
      this.adjustFontForLanguage(renderer, this.currentLanguage);
    }
  }
  
  private adjustFontForLanguage(renderer: TextRenderer, language: string): void {
    switch (language) {
      case "zh":
      case "ja":
        // Use fonts that support CJK characters
        renderer.font = Font.createFromOS(renderer.entity.engine, "Arial Unicode MS");
        break;
      case "ar":
        // Right-to-left languages
        renderer.horizontalAlignment = TextHorizontalAlignment.Right;
        break;
      default:
        renderer.font = Font.createFromOS(renderer.entity.engine, "Arial");
        renderer.horizontalAlignment = TextHorizontalAlignment.Left;
        break;
    }
  }
  
  private updateAllTexts(): void {
    for (const key of this.textRenderers.keys()) {
      this.updateText(key);
    }
  }
}
```

### Text Effects System

```typescript
class TextEffectsSystem {
  private effects: Map<TextRenderer, TextEffect[]> = new Map();
  
  addEffect(renderer: TextRenderer, effect: TextEffect): void {
    if (!this.effects.has(renderer)) {
      this.effects.set(renderer, []);
    }
    this.effects.get(renderer).push(effect);
  }
  
  removeEffect(renderer: TextRenderer, effect: TextEffect): void {
    const effects = this.effects.get(renderer);
    if (effects) {
      const index = effects.indexOf(effect);
      if (index >= 0) {
        effects.splice(index, 1);
      }
    }
  }
  
  update(deltaTime: number): void {
    for (const [renderer, effects] of this.effects) {
      for (const effect of effects) {
        effect.update(renderer, deltaTime);
      }
    }
  }
}

// Text effect implementations
class FadeInEffect implements TextEffect {
  private elapsed: number = 0;
  private duration: number;
  private originalAlpha: number;
  
  constructor(duration: number = 1.0) {
    this.duration = duration;
  }
  
  update(renderer: TextRenderer, deltaTime: number): void {
    if (this.originalAlpha === undefined) {
      this.originalAlpha = renderer.color.a;
      renderer.color.a = 0;
    }
    
    this.elapsed += deltaTime;
    const progress = Math.min(this.elapsed / this.duration, 1.0);
    renderer.color.a = this.originalAlpha * progress;
  }
}

class WaveEffect implements TextEffect {
  private time: number = 0;
  private amplitude: number;
  private frequency: number;
  private originalY: number;
  
  constructor(amplitude: number = 10, frequency: number = 2) {
    this.amplitude = amplitude;
    this.frequency = frequency;
  }
  
  update(renderer: TextRenderer, deltaTime: number): void {
    if (this.originalY === undefined) {
      this.originalY = renderer.entity.transform.position.y;
    }
    
    this.time += deltaTime;
    const offset = Math.sin(this.time * this.frequency) * this.amplitude;
    renderer.entity.transform.setPosition(
      renderer.entity.transform.position.x,
      this.originalY + offset,
      renderer.entity.transform.position.z
    );
  }
}

interface TextEffect {
  update(renderer: TextRenderer, deltaTime: number): void;
}
```

## Best Practices

### Font Management

```typescript
// Create a centralized font manager
class FontManager {
  private static fonts: Map<string, Font> = new Map();
  
  static getFont(engine: Engine, name: string): Font {
    if (!this.fonts.has(name)) {
      const font = Font.createFromOS(engine, name);
      this.fonts.set(name, font);
    }
    return this.fonts.get(name);
  }
  
  // Preload commonly used fonts
  static preloadFonts(engine: Engine): void {
    const commonFonts = ["Arial", "serif", "sans-serif", "monospace"];
    for (const fontName of commonFonts) {
      this.getFont(engine, fontName);
    }
  }
}

// Use consistent font hierarchies
enum FontWeight {
  Light = FontStyle.None,
  Regular = FontStyle.None,
  Bold = FontStyle.Bold,
  BoldItalic = FontStyle.Bold | FontStyle.Italic
}

enum FontSize {
  Caption = 12,
  Body = 16,
  Subheading = 18,
  Heading = 24,
  Display = 32,
  Banner = 48
}
```

### Performance Guidelines

```typescript
// Minimize text updates for better performance
class EfficientTextUpdater {
  private lastText: string = "";
  
  updateTextIfChanged(renderer: TextRenderer, newText: string): void {
    if (this.lastText !== newText) {
      renderer.text = newText;
      this.lastText = newText;
    }
  }
}

// Use object pooling for dynamic text
class TextRendererPool {
  private pool: TextRenderer[] = [];
  private activeRenderers: Set<TextRenderer> = new Set();
  
  getRenderer(entity: Entity): TextRenderer {
    let renderer = this.pool.pop();
    if (!renderer) {
      renderer = entity.addComponent(TextRenderer);
    }
    this.activeRenderers.add(renderer);
    return renderer;
  }
  
  returnRenderer(renderer: TextRenderer): void {
    if (this.activeRenderers.has(renderer)) {
      renderer.text = "";
      renderer.enabled = false;
      this.activeRenderers.delete(renderer);
      this.pool.push(renderer);
    }
  }
}

// Batch text operations
class TextBatcher {
  private pendingUpdates: Array<{renderer: TextRenderer, text: string}> = [];
  
  queueTextUpdate(renderer: TextRenderer, text: string): void {
    this.pendingUpdates.push({renderer, text});
  }
  
  flushUpdates(): void {
    // Apply all text updates in a single frame
    for (const update of this.pendingUpdates) {
      update.renderer.text = update.text;
    }
    this.pendingUpdates.length = 0;
  }
}
```

### Layout Best Practices

```typescript
// Responsive text sizing
class ResponsiveTextLayout {
  static setupResponsiveText(
    renderer: TextRenderer,
    baseSize: number,
    minSize: number,
    maxSize: number
  ): void {
    const screenWidth = renderer.entity.engine.canvas.width;
    const scale = screenWidth / 1920; // Base resolution
    const clampedScale = Math.max(0.5, Math.min(2.0, scale));
    
    const fontSize = Math.max(minSize, Math.min(maxSize, baseSize * clampedScale));
    renderer.fontSize = fontSize;
  }
  
  // Auto-fit text to container
  static autoFitText(renderer: TextRenderer, maxWidth: number): void {
    let fontSize = renderer.fontSize;
    const minFontSize = 8;
    
    while (fontSize > minFontSize) {
      renderer.fontSize = fontSize;
      const metrics = TextUtils.measureTextWithoutWrap(
        renderer,
        1000, // Large height
        renderer.lineSpacing
      );
      
      if (metrics.width <= maxWidth) {
        break;
      }
      
      fontSize--;
    }
  }
}

// Text container management
class TextContainer {
  private padding: { top: number, right: number, bottom: number, left: number };
  
  constructor(
    private renderer: TextRenderer,
    padding = { top: 10, right: 10, bottom: 10, left: 10 }
  ) {
    this.padding = padding;
  }
  
  setContainerSize(width: number, height: number): void {
    this.renderer.width = width - this.padding.left - this.padding.right;
    this.renderer.height = height - this.padding.top - this.padding.bottom;
  }
  
  updateAlignment(horizontal: TextHorizontalAlignment, vertical: TextVerticalAlignment): void {
    this.renderer.horizontalAlignment = horizontal;
    this.renderer.verticalAlignment = vertical;
  }
}
```

## Common Patterns

### Text Input Simulation

```typescript
// Simulated text input field
class TextInputField {
  private cursor: string = "|";
  private cursorVisible: boolean = true;
  private cursorTime: number = 0;
  private inputText: string = "";
  
  constructor(private renderer: TextRenderer) {
    this.updateDisplay();
  }
  
  addCharacter(char: string): void {
    this.inputText += char;
    this.updateDisplay();
  }
  
  removeCharacter(): void {
    this.inputText = this.inputText.slice(0, -1);
    this.updateDisplay();
  }
  
  update(deltaTime: number): void {
    // Animate cursor blinking
    this.cursorTime += deltaTime;
    if (this.cursorTime >= 0.5) {
      this.cursorVisible = !this.cursorVisible;
      this.cursorTime = 0;
      this.updateDisplay();
    }
  }
  
  private updateDisplay(): void {
    const displayText = this.inputText + (this.cursorVisible ? this.cursor : " ");
    this.renderer.text = displayText;
  }
}
```

### Scrolling Text Display

```typescript
// Scrolling text for long content
class ScrollingTextDisplay {
  private fullText: string;
  private visibleLines: number;
  private currentLine: number = 0;
  
  constructor(
    private renderer: TextRenderer,
    text: string,
    visibleLines: number = 5
  ) {
    this.fullText = text;
    this.visibleLines = visibleLines;
    this.updateDisplay();
  }
  
  scrollUp(): void {
    if (this.currentLine > 0) {
      this.currentLine--;
      this.updateDisplay();
    }
  }
  
  scrollDown(): void {
    const lines = this.fullText.split('\n');
    if (this.currentLine < lines.length - this.visibleLines) {
      this.currentLine++;
      this.updateDisplay();
    }
  }
  
  private updateDisplay(): void {
    const lines = this.fullText.split('\n');
    const visibleText = lines
      .slice(this.currentLine, this.currentLine + this.visibleLines)
      .join('\n');
    this.renderer.text = visibleText;
  }
}
```

The Text System provides a powerful foundation for all text rendering needs in Galacean Engine, from simple labels to complex multi-language interfaces with advanced typography and layout capabilities.
