# TextRenderer 示例

## Summary
- 创建文本实体并挂载 `TextRenderer`。
- 设置文本内容、字号、颜色与布局宽度以控制换行。
- 水平/垂直对齐到居中，适合标题或标签。

## Code
```ts
import { Color, Entity, TextHorizontalAlignment, TextRenderer, TextVerticalAlignment } from "@galacean/engine";

declare const root: Entity;

const textEntity = root.createChild("Title");
const text = textEntity.addComponent(TextRenderer);
text.text = "Hello Galacean";
text.fontSize = 32;
text.color = new Color(1, 0.9, 0.6, 1);
text.width = 4; // 影响换行
text.horizontalAlignment = TextHorizontalAlignment.Center;
text.verticalAlignment = TextVerticalAlignment.Center;
```
