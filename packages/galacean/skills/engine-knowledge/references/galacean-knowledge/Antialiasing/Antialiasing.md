# Galacean Anti-Aliasing

## 它是什么
- 抗锯齿选项包含屏幕后处理 FXAA 与硬件 MSAA，减少几何和纹理边缘的锯齿。
- 在相机组件上配置：`antiAliasing`（FXAA）与 `msaaSamples`（MSAA）。

## 简述
- FXAA：屏幕空间抗锯齿，在最终输出前做边缘检测与柔化，可作用于透明裁剪/高光等所有像素。默认关闭。
- MSAA：硬件多重采样，主要平滑几何边缘，对 alphaCutoff/透明无效。默认 4x（视平台支持）。
- 组合：可同时开启，先用 MSAA 平滑几何，再用 FXAA 处理剩余锯齿。
- 依赖：FXAA 与相机后处理开关无关，只需将 `antiAliasing` 设为 FXAA；MSAA 需要渲染目标支持（默认主画布支持 4x，移动端过高倍率有性能成本）。

## 关联
- 相机属性：`Camera.antiAliasing`（`AntiAliasing.None/FXAA`）、`Camera.msaaSamples`（枚举 `MSAASamples.None/TwoX/FourX/EightX`）

## 怎么用
1) 在相机上设置 FXAA：`camera.antiAliasing = AntiAliasing.FXAA;`
2) 设置 MSAA 采样：`camera.msaaSamples = MSAASamples.FourX;`（需兼容设备，过高采样谨慎）。
3) 根据场景需求组合或单独启用。

## Best Practices
- 对透明裁剪/特效明显锯齿的场景启用 FXAA；仅几何锯齿明显且性能敏感时可只用 MSAA。
- 移动端谨慎提升 MSAA 倍率，通常 2x/4x 即可；性能不足时关闭或降低 FXAA。
- 后处理链中如有重采样（Bloom 等）可能影响 FXAA 效果，必要时调整顺序/参数。

## Few-shot（常见需求提示）
- “叶片透明边缘锯齿” → 开启 FXAA（MSAA 对透明无效）。
- “几何边缘锯齿但性能 OK” → 开启 MSAA 4x，必要时叠加 FXAA。
- “性能掉帧” → 降低 `msaaSamples` 或关闭 FXAA。

## Notes / Warning
- FXAA 不依赖相机后处理开关；只要 `antiAliasing` 为 FXAA 就会在最终输出阶段生效。
- MSAA 支持取决于设备与渲染目标；后处理链中过高 MSAA 可能需要额外 resolve 步骤，增加开销。
- 透明排序与后处理可能仍导致部分边缘伪影，需结合材质与贴图处理。
