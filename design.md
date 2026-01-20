# Text 与 pixelPerUnit 关系检查 + 文本描边设计

## 问题 1：TextRenderer / Text 与 pixel-per-unit 的关系

### Unity 行为（对齐认知）
- TextRenderer（TextMesh / 3D/2D world text）是世界空间文字，大小由字体尺寸 + Transform 缩放决定，不受 UI Canvas 影响。
- UI Text 会读取 CanvasScaler.referencePixelsPerUnit（或 Canvas 的对应值），该值会影响 Text.pixelsPerUnit，从而改变文字最终显示大小。
- 结论：在 Unity 中，修改 referencePixelsPerUnit 会影响 UI Text 的大小，这是预期行为。

### 当前引擎实现（代码现状）
- TextRenderer（`packages/core/src/2d/text/TextRenderer.ts`）：
  - 布局全部基于 `Engine._pixelsPerUnit`。
  - 公式：worldSize = pixelSize / Engine._pixelsPerUnit。
  - 不依赖 UICanvas。
- UI Text（`packages/ui/src/component/advanced/Text.ts`）：
  - 使用 `pixelsPerResolution = Engine._pixelsPerUnit / rootCanvas.referenceResolutionPerUnit`。
  - 文字本地尺寸约为：`uiUnits = pixelSize / pixelsPerResolution = pixelSize * referenceResolutionPerUnit / Engine._pixelsPerUnit`。
  - 所以 referenceResolutionPerUnit 越大，UI 文字越大。
- UI Image（Sliced/Tiled）也使用相同的参考换算（`referenceResolutionPerUnit`），与 UI Text 保持一致。

### 是否有问题？
结论：从“UI 像素密度控制”角度看，当前实现是自洽的。  
`referenceResolutionPerUnit` 本质上就是 UI 的“pixels-per-unit”，修改它会改变 UI 元素（包括文字）尺寸，这是合理行为，且与 Unity 一致。

注意点：
- 该值同时依赖 `Engine._pixelsPerUnit`，所以如果未来改变 `Engine._pixelsPerUnit`，UI 文字也会同步缩放。
- 如果期望“分辨率适配”但不改变文字像素密度，请调整 `referenceResolution` / `resolutionAdaptationMode`，而保持 `referenceResolutionPerUnit` 不变。

## 问题 2：Canvas 技术方案下的文字描边（性能最优方案）

### 目标
- 运行时 1 次采样、1 次绘制（尽量保持批处理）。
- 描边与填充可分别着色。
- 尽量不增加 draw call 或顶点数量。

### 推荐方案：双通道字体 Atlas（一次采样完成描边 + 填充）

#### 核心思路
用 Canvas 生成字形时同时渲染“填充”和“描边”，并将二者打包到同一张纹理的不同通道中。  
渲染阶段用单次采样拆出 fillMask / strokeMask，组合出最终颜色。

#### 数据结构与缓存策略
- SubFont key 扩展：
  - `fontSize-fontStyle-outlineWidthPx`
  - outlineWidth 变化会产生新的 SubFont / Atlas。
- Atlas 通道打包建议：
  - R 通道：strokeMask（包含填充）
  - A 通道：fillMask
  - outlineMask = max(R - A, 0)
- outlineWidth = 0 时沿用现有逻辑（不产生额外 atlas）。

#### 字形生成流程（Canvas）
1. 基于当前 `fontSize/fontStyle` 得到原始度量（measureText）。
2. 计算 `padding = ceil(outlineWidthPx)`，扩展字形宽高与基线。
3. Canvas 上先 `strokeText`，再 `fillText`。
4. 分别取 stroke/fill 的 alpha，打包进 RGBA：
   - `strokeMask -> R`
   - `fillMask -> A`
5. CharInfo 调整策略：
   - `w/h` 增加 `padding * 2`
   - `offsetX -= padding`，`ascent/descent += padding`
   - `xAdvance` 保持原值，确保排版宽度不被描边影响

#### Shader（单 pass）
示意：
```
vec4 tex = texture2DSRGB(renderElement_TextTexture, v_uv);
float fill = tex.a;
float stroke = tex.r;
float outline = max(stroke - fill, 0.0);
vec4 color = v_color * fill + renderer_OutlineColor * outline;
gl_FragColor = color;
```

#### 批处理与性能
- 仍是一次采样、一次绘制，最优。
- outlineColor 若作为 uniform，会导致不同描边色的文本无法合批；
  - 若业务描边色一致，可保持批处理。
  - 若需要多色描边，可按颜色分组或接受拆批。

### 备选方案（简单但性能较差）
- 多次偏移绘制（8 方向 + 中心）：无需改 atlas，但会显著增加顶点数和 draw call。

### 长期优化方向
- SDF / MSDF 字体：质量更高、可调描边厚度，但需要额外字体管线支持（不适合纯 Canvas 即时生成）。

### 建议 API
- Text / TextRenderer：
  - `outlineWidth`（px）
  - `outlineColor`（Color）
  - `outlineEnabled`（bool）
- UI 中 outlineWidth 以“参考像素”为单位，内部乘以 `pixelsPerResolution` 转换。
