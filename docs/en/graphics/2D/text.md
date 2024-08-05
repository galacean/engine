---
order: 4
title: Text Renderer
type: Graphics
group: 2D
label: Graphics/2D
---

[TextRenderer](/apis/core/#TextRenderer) component is used to display text in 3D/2D scenes.

## Editor Usage

### Adding Text Component

When you need to display text, you first need to add a text component to an entity, as shown below:

![Adding Text Component](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*3d5AQYTtcNkAAAAAAAAAAAAADjCHAQ/original)

### Parameter Description

Select an entity with a TextRenderer component, you can set all related properties in the right-side inspector to configure the text component:
![Adding Text Component](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*9XKjSYHZQWsAAAAAAAAAAAAADjCHAQ/original)

The properties are described as follows:
| Property | Description |
| :--- | :--- |
| `Text` | Text to be displayed |
| `Color` | Text color |
| `FontSize` | Font size of the text |
| `Font` | Custom font |
| `Width` | Width of the text in 3D space, used for bounding box calculation and determining line breaks when displaying multiline text |
| `Height` | Height of the text in 3D space, used for bounding box calculation and determining line breaks when displaying multiline text |
| `LineSpacing` | Spacing between lines |
| `FontStyle` | Font style settings: bold/italic |
| `HorizontalAlignment` | Horizontal alignment, options are: Left/Center/Right |
| `VerticalAlignment` | Vertical alignment, options are: Top/Center/Bottom |
| `EnableWrapping` | Enable wrapping mode, when enabled, text will wrap based on the set width. If width is set to 0, the text will not be rendered |
| `OverflowMode` | Handling method when the total height of the text exceeds the set height, options are: Overflow/Truncate. Overflow means direct overflow display, Truncate means only content within the set height will be displayed, the specific display content also depends on the vertical alignment of the text |
| `Mask Interaction` | Mask type, used to determine if the text needs masking, and if masking is required, whether to display content inside or outside the mask |
| `Mask Layer` | Mask layer to which the text belongs, used for matching with SpriteMask, default is Everything, indicating it can be masked with any SpriteMask |
| `priority` | Rendering priority, the smaller the value, the higher the rendering priority, and will be rendered first |

### Setting Displayed Text

After adding the text component, you can set the Text property to display the desired text, as shown below:

![Setting Displayed Text](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*J6nKTJOOm4kAAAAAAAAAAAAADjCHAQ/original)

### Setting Custom Font

To make the text display more diverse, developers can upload their own font files. The editor currently supports font file formats: **.ttf**, **.otf**, **.woff**

![Setting Font](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*CgA5S5vneeMAAAAAAAAAAAAADjCHAQ/original)

## Script Usage

<playground src="text-renderer.ts"></playground>

1. Create a [TextRenderer](/apis/core/#TextRenderer) component to display text
2. Set a [Font](/apis/core/#Font) object through the font property
3. Set the text to be displayed through the text property
4. Set the font size through the fontSize property
5. Set the text color through the color property

```typescript
import {
  Camera,
  Color,
  Font,
  FontStyle,
  TextRenderer,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

const textEntity = rootEntity.createChild("text");
// Add a TextRenderer component to the entity.
const textRenderer = textEntity.addComponent(TextRenderer);
// Set the Font object via font.
textRenderer.font = Font.createFromOS(engine, "Arial");
// Set the text to be displayed through text.
textRenderer.text = "Galacean 会写字了！";
// Set the font size via fontSize.
textRenderer.fontSize = 36;
// Set the text color via color.
textRenderer.color.set(1, 0, 0, 1);
```

### Setting Width and Height

You can set the size of the text in 3D space using width/height, mainly for the following purposes:
1. Used for bounding box calculation
2. Used to determine line break rules when displaying multiline text

```typescript
// Set width.
textRenderer.width = 10;
// Set height.
textRenderer.height = 10;
```

### Setting Line Spacing

When displaying multiline text, you can set the vertical spacing between two lines using lineSpacing.

```typescript
// Set line spacing
textRenderer.lineSpacing = 0.1;
```

### Multi-line Text Display

When the text is too long, you may want the text to be displayed on multiple lines. In this case, you can enable wrapping by setting the `enableWrapping` field to true. Once wrapping is enabled, the text will wrap based on the width set earlier. If the width is set to 0, the text will not be rendered.

```typescript
// Enable wrapping mode
textRenderer.enableWrapping = true;
```

### Text Truncation

When displaying multi-line text, there may be too many lines of text. In this case, you can use the `overflowMode` field to determine whether to truncate and only display content within the set height. The specific content displayed also depends on the vertical alignment of the text (see: Text Alignment), as shown below:

```typescript
// Set text support overflow.
textRenderer.overflowMode = OverflowMode.Overflow;
// Set text support truncate.
textRenderer.overflowMode = OverflowMode.Truncate;
```

### Text Alignment

Text alignment is used to determine how text should be displayed within a specified width and height. The following attributes are available:

| Attribute                                                          | Type                                                           | Description                                                                     |
| :----------------------------------------------------------------- | :------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| [horizontalAlignment](/apis/core/#TextRenderer-horizontalAlignment) | [TextHorizontalAlignment](/apis/core/#TextHorizontalAlignment)   | Horizontal alignment: Left/Center/Right represent left/center/right alignment     |
| [verticalAlignment](/apis/core/#TextRenderer-horizontalAlignment)   | [TextVerticalAlignment](/apis/core/#TextVerticalAlignment)     | Vertical alignment: Top/Center/Bottom represent top/center/bottom alignment       |

### Text Font Styles

Text font styles are used to set whether the text should be displayed in bold or italic. The following attributes are available:

| Attribute                                         | Type                               | Description                                     |
| :------------------------------------------------ | :--------------------------------- | :---------------------------------------------- |
| [fontStyle](/apis/core/#TextRenderer-fontStyle)    | [FontStyle](/apis/core/#FontStyle) | Font style: None/Bold/Italic represent normal/bold/italic display |

Usage:

```typescript
// Normal display.
textRenderer.fontStyle = FontStyle.None;
// Bold display.
textRenderer.fontStyle = FontStyle.Bold;
// Italic display.
textRenderer.fontStyle = FontStyle.Italic;
// Display in both bold and italic.
textRenderer.fontStyle = FontStyle.Bold | FontStyle.Italic;
```

### Multi-line Text

<playground src="text-wrap-alignment.ts"></playground>

### Custom Fonts

[Font](/apis/core/#Font) is a font resource used to represent the font used for text.

| Attribute                         | Type     | Description                                                                 |
| :-------------------------------- | :------- | :-------------------------------------------------------------------------- |
| [name](/apis/core/#Sprite-name)    | string   | Font resource name, used to uniquely identify a font resource, currently used to indicate the required system font |
```

```typescript
const font = Font.createFromOS(engine, "Arial");
```

Currently supported formats: ttf/otf/woff

```typescript
const font = await engine.resourceManager.load({
  url: "https://lg-2fw0hhsc-1256786476.cos.ap-shanghai.myqcloud.com/Avelia.otf",
});
```

<playground src="text-renderer-font.ts"></playground>
```
