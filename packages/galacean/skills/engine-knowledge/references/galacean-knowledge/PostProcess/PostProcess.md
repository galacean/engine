# Galacean Post Process

## 它是什么
- 后处理系统在相机渲染结果上叠加特效（Bloom、ToneMapping、ColorGrading 等）。
- 通过 `PostProcess` 组件配置，全局/局部模式可叠加；相机需开启后处理/HDR 才生效相关效果。

## 简述
- 模式：`isGlobal=true` 影响所有相机；局部模式需配碰撞体与 `blendDistance`，相机靠近范围时混合。
- 属性：`priority`（覆盖顺序，越大越后混合）、`layer`（配合相机 `postProcessMask` 过滤）、`blendDistance`、`addEffect/getEffect` 管理特效实例。
- 相机配合：`enablePostProcess` 开关、`postProcessMask`、`enableHDR`（HDR 特效如 Bloom 需开启）、`msaaSamples`。
- 特效列表：Bloom、ToneMapping、ColorGrading、Vignette、DepthOfField 等；也可自定义后处理 Pass。

## 关联
- 组件：`PostProcess`（场景实体上添加）
- 相机：`Camera.enablePostProcess`、`Camera.enableHDR`、`Camera.postProcessMask`、`Camera.msaaSamples`
- 特效：`BloomEffect` 等（位于 postProcess/effects）
- 自定义：自定义 Pass（继承 Effect/Pass，挂到 PostProcess 管线）

## 怎么用
1) 在场景中添加 `PostProcess` 组件（可用全局或局部预设），根据需求设置 `isGlobal/priority/layer/blendDistance`。
2) 为组件添加特效：`addEffect(BloomEffect)` 并配置参数；相机开启 `enablePostProcess`，需要 HDR 的效果同时开启 `enableHDR`。
3) 局部模式：在实体上添加碰撞体定义范围，相机进入范围时按 `blendDistance` 混合。

## Best Practices
- HDR 仅在需要时开启，尤其是 Bloom/ColorGrading 超范围使用；开启会增加一次 RT 渲染成本。
- 多个后处理叠加按 `priority` 排序，混合逻辑为后者覆盖；合理划分 `layer + postProcessMask` 控制生效范围。
- 移动端优先降低 DownScale（如 Bloom 用 Quarter），减少采样；避免过多重量级特效叠加。
- 视图窗口后处理开关仅影响编辑器预览，不影响导出效果。
- 自定义效果应实现专用 Pass，注意输入输出纹理格式与混合顺序。

## Few-shot（常见需求提示）
- “只让 HUD 受后处理” → HUD 相机 `postProcessMask` 匹配特定 `layer` 的 PostProcess 组件。
- “局部区域色调变化” → 局部 PostProcess + 碰撞体范围 + ToneMapping/ColorGrading。
- “关闭后处理” → `camera.enablePostProcess = false` 或禁用 PostProcess 组件。
- “性能差” → 关闭 HDR、降低 DownScale、减少特效数量或降低分辨率。

## Notes / Warning
- 后处理依赖相机输出 RT；透明/多相机叠加时留意顺序与遮罩，否则效果可能叠加异常。
- 某些特效需要深度/不透明纹理，确保相机启用对应选项（如 `opaqueTextureEnabled` 或深度前传）。
- 局部模式需要碰撞体，否则相机无法计算混合距离。
