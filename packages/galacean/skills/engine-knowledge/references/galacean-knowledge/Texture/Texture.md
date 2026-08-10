# Galacean Texture

## 它是什么
- 贴图资源，支持 2D 纹理、立方体纹理、2D 纹理数组等，用于材质采样、天空盒、环境反射、UI/2D、RTT 等。
- 支持图片/视频/原始数据来源，内建 mipmap、过滤/循环模式、sRGB/线性切换与压缩格式（KTX2/basis）。

## 简述
- 类型：`Texture2D`（常规贴图）、`TextureCube`（天空盒/环境反射）、`Texture2DArray`（同尺寸图集）、RenderTarget 生成的纹理（RTT）。
- 关键属性：`isSRGBColorSpace`、`mipmap`/`generateMipmaps()`、过滤（`filterMode`）、循环（`wrapModeU/V`）、各向异性等级、尺寸。
- 加载：项目资产由 build manifest 的类型选择 Loader，逻辑路径无需暴露编码后缀；外部 URL 才按后缀推断或显式使用当前的 `AssetType.Texture`。可通过 `params` 控制 sRGB。`EditorTexture2D`、`Texture2D` 不是当前 `AssetType` 枚举成员。
- 设置：确定的 `PBRMaterial` 等具体材质类实例可用 `baseTexture` 等 convenience API；通用 `Material`（尤其 Editor `.mat` 注入脚本）使用 `shaderData.setTexture("material_BaseTexture", texture)`，或按当前 Shader 的 canonical property 写入。

## 关联
- 资产类型：2D 图片/HDR 使用 `AssetType.Texture`；立方体压缩纹理使用 `AssetType.KTXCube`（具体 loader 仍以当前项目声明和注册为准）
- 类：`Texture2D`、`TextureCube`、`Texture2DArray`
- 过滤/循环：`TextureFilterMode`、`TextureWrapMode`
- 相关系统：材质、背景（Texture/Sky）、后处理、RTT

## 怎么用
1) 加载纹理：用 build manifest 注册的稳定逻辑路径或外部 URL；项目内路径等于 Editor VFS 路径去掉前导 `/`，保留用户可见扩展名，不改写成 `.tex/.ktx2`。必要时配置 `isSRGBColorSpace=false`（法线/金属粗糙度等线性数据）。
2) 配置滤波/循环：根据需求设置 `filterMode`（Point/Bilinear/Trilinear）与 `wrapModeU/V`（Clamp/Repeat/Mirror）。
3) 赋值到确定的具体材质或通用材质：`material.baseTexture = tex;`（`material` 明确是 `PBRMaterial` 等具体类）或 `material.shaderData.setTexture("material_BaseTexture", tex)`；背景使用 `scene.background.texture = tex;`
4) 需要天空盒/环境反射时使用已导入的 `TextureCube` 资产；单张 `.hdr` 由当前 `AssetType.Texture` loader 解码为 `Texture2D`，不会自动变成立方体纹理。频繁切换同尺寸图集可用 `Texture2DArray`。

## Best Practices
- 颜色贴图使用 sRGB，数据贴图（法线、RMA、深度等）使用线性；自定义 RenderTarget 的颜色纹理 `isSRGBColorSpace` 也要与数据匹配。
- WebGL1 下需 2 的幂尺寸才能使用 mipmap/Repeat；WebGL2 支持任意尺寸但仍建议合理分辨率。
- 高分辨率贴图配合 mipmap/Trilinear 提高质量；性能敏感可用 Bilinear/Point。
- 使用压缩纹理（KTX2/basis）降低显存与下载体积；确保导出与引擎配置一致。
- 不再使用的纹理解除引用后 `resourceManager.gc()` 释放。

## Few-shot（常见需求提示）
- “图片有黑边” → 开启编辑器的色彩膨胀或使用 `Clamp`，检查 alpha 预乘。
- “UV 超出范围” → 设置 `wrapModeU/V = Repeat` 或 `Mirror`。
- “想用视频做纹理” → 创建 `Texture2D` 绑定视频源（需自定义更新）。
- “RTT 后处理” → 使用 `RenderTarget` 获取 `colorTexture` 并在材质中采样。

## Notes / Warning
- 过滤模式与 mipmap 需要与纹理尺寸兼容（WebGL1 非 2 次幂会自动禁用 mipmap）。
- 大尺寸/高各向异性会增加采样成本；移动端谨慎设置。
- 修改纹理尺寸或 `isSRGBColorSpace` 可能触发底层重建，避免频繁变更。
