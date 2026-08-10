# Galacean Input

## 它是什么
- 跨端输入系统，支持触控/鼠标（Pointer）、键盘、滚轮，并提供帧缓冲拾取用于精准命中检测。
- 初始化时可指定事件监听源，运行时通过 `inputManager` 或组件事件获取输入。

## 简述
- Pointer：统一鼠标/触摸，支持按键状态、移动、按压/抬起、点击、拖拽；拾取依赖画布与物理射线。
- Keyboard：键盘按键按下/抬起状态；监听目标需可聚焦（`tabIndex`）。
- Wheel：滚轮滚动信息。
- 配置：`WebGLEngine.create({ input: { pointerTarget, keyboardTarget, wheelTarget } })`；避免使用 `window` 作为 pointer 目标。
- 帧缓冲拾取：`FrameBufferPicker` 在渲染后通过像素读取返回实体，适合自定义拾取需求。

## 关联
- 管理器：`engine.inputManager`
- 事件：`Pointer`/`Keyboard`/`Wheel` 相关 API；脚本中可覆写 `onPointerDown/Up/Click/BeginDrag/...`
- 拾取：`FrameBufferPicker`
- 枚举：`PointerButton`（Primary/Secondary/Middle 等）、`Keys`（如 `Keys.KeyW/KeyA/Space/Enter/ShiftLeft`）

## 怎么用
1) 创建引擎时设置输入目标（通常 pointer 设为 canvas 或 document）。
2) 在脚本中使用 `this.engine.inputManager` 读取输入状态，或实现 `Script` 的指针事件回调。
3) 对于精确拾取需求，使用 `FrameBufferPicker` 获取指向实体。

## Best Practices
- pointerTarget 不要设为 `window`，其缺少 Pointer Level 事件会导致触控异常。
- Keyboard 目标需可聚焦，设置 `tabIndex` 并在需要时调用 `focus()`。
- 移动端/多指操作建议使用 Pointer API，而非传统 mouse 事件。
- 拾取性能：避免每帧大量拾取，必要时节流或使用物理射线代替。
- 监听触控：全局触控可在脚本的 `onUpdate` 中轮询 `inputManager.isPointerDown/isPointerUp/isPointerHeldDown`（不传参数表示任意按键，传入 `PointerButton` 枚举指定按键）；需要命中具体实体时，在脚本中实现 `onPointerClick/Down/Up/Drag` 等回调处理逻辑（需为目标实体预先添加碰撞体组件）。若用原生事件，需在 `pointerTarget` 绑定并转换坐标。
- 监听按键：在 `onUpdate` 中使用 `inputManager.isKeyDown/isKeyUp/isKeyHeldDown`（不传参数表示任意键，传入 `Keys` 枚举指定键）轮询；或在 `keyboardTarget` 上绑定原生键盘事件，确保元素 `tabIndex` 可聚焦。
- 使用帧缓冲拾取需引入 `@galacean/engine-toolkit-framebuffer-picker`，适合低频、需要像素级精度的场景。
- 屏幕坐标转换：需要将触控点转为世界坐标或射线时，使用相机的 `screenToWorldPoint` / `screenPointToRay`，注意传入的 z 为距离相机的世界单位。

## Few-shot（常见需求提示）
- “键盘 WASD” → 在脚本 `onUpdate` 读取 `inputManager.isKeyDown(Keys.KeyW)`。
- “拖拽模型” → 组合 `onPointerBeginDrag/Drag/EndDrag` 与射线交互。
- “鼠标滚轮缩放” → 监听 `wheel` 事件或 `inputManager.wheelDelta`。

## Notes / Warning
- 浏览器安全策略可能阻止部分事件（如未聚焦的键盘输入），确保焦点管理正确。
- 帧缓冲拾取需要额外渲染 pass，性能敏感场景谨慎使用。
- Pointer/Keys 相关 API 必须使用对应枚举成员（如 `PointerButton.Primary`、`Keys.KeyW/Space/Enter`），不要臆造枚举值或省略前缀。
