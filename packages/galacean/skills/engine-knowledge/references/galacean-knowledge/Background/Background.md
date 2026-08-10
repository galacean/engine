# Galacean Background

## 它是什么
- 场景级背景设置，在相机渲染前清屏并绘制背景。支持纯色、纹理与天空三种模式。
- 通过 `scene.background` 管理；相机 `clearFlags` 为 Color/All 时会使用场景背景。

## 简述
- 模式：`BackgroundMode.SolidColor`（纯色，可设透明透出页面）、`Texture`（2D 纹理，提供填充模式）、`Sky`（天空盒或程序化天空，材质+网格可自定义）。
- 纹理填充：`textureFillMode` 提供 `AspectFitWidth` / `AspectFitHeight` / `Fill`。
- 天空：可用立方体纹理 + SkyBox 材质，或使用 `SkyProceduralMaterial` 生成大气散射天空；可自定义 mesh（默认立方体/球）。

## 关联
- 入口：`scene.background`
- 枚举/类型：`BackgroundMode`、`BackgroundTextureFillMode`
- 主要字段：`mode`、`solidColor`、`texture`、`textureFillMode`、`sky.material`、`sky.mesh`
- 相机：`Camera.clearFlags` 需包含 Color 才会显示背景；`Camera.isAlphaOutputRequired` 结合透明背景。

## 怎么用
1) 获取场景背景实例：`const bg = scene.background;`
2) 纯色：设 `mode = SolidColor`，调整 `solidColor`（可设 alpha 为 0 透出页面）。
3) 纹理：设 `mode = Texture`，加载 `Texture2D` 赋给 `texture`，根据需求设置 `textureFillMode`。
4) 天空：创建立方纹理 + SkyBox 材质或使用 `SkyProceduralMaterial`，设置 `mode = Sky`，赋值 `sky.material` 与 `sky.mesh`（常用立方体/球）。

## Best Practices
- 透明画布叠加网页时：纯色背景 alpha 设 0，并确保相机 `isAlphaOutputRequired = true`。
- 纹理模式优先使用 2 的幂或合适尺寸的贴图，避免超大贴图造成 GPU 压力；填充模式按 UI 比例选择。
- 天空盒使用 HDR 立方体贴图获取更好的环境光；PBR 环境光需配合光照烘焙/IBL 贴图。
- 多相机叠加时，高优先级相机如需覆盖背景，保持 `clearFlags` 包含 Color；否则可仅清深度。

## Few-shot（常见需求提示）
- “想透出网页背景” → SolidColor + `solidColor.a = 0`，相机开启透明输出。
- “背景图片拉伸” → 调整 `textureFillMode`（宽适配/高适配/填充）。
- “更换天空盒” → 替换 SkyBox 材质中的立方体纹理。
- “默认蓝天白云” → 使用 `SkyProceduralMaterial` + 球体 mesh。

## Notes / Warning
- 背景是场景级的；多场景渲染时每个场景有各自的背景。
- 纹理模式依赖已加载纹理；未加载完成时可能显示上一帧背景或空白。
- 天空 mesh 应包裹相机（通常单位球/立方体）；不要使用会与场景几何相交的小尺寸 mesh。
