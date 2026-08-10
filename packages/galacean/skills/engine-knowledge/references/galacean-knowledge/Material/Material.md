# Galacean Material

## 它是什么
- 渲染外观定义，绑定 Shader 与渲染状态（Blend/Depth/Cull/RenderQueue），并存储参数(`shaderData`)。
- 常用内置材质：`PBRMaterial`/`PBRSpecularMaterial`、`UnlitMaterial`、`BlinnPhongMaterial`、2D 默认材质（Sprite/Text/Mask）、粒子材质等。

## 简述
- `Material` 绑定一个 Shader（内置或自定义），可通过 `shaderData` 设置纹理/向量/颜色/数值/宏。
- 渲染状态：`renderState` 内含 `blendState`、`depthState`、`rasterState`、`stencilState`、`renderQueueType`（Opaque/AlphaTest/Transparent）；透明材质需配合 `isTransparent`（或设置混合+RenderQueue）。
- 资源管理：材质可被多个渲染器共享；修改共享材质会影响所有使用者，需实例化时用 `renderer.getInstanceMaterial` 或 `material.clone()`。
- 与纹理/网格等资产配合使用；支持 KTX2/sRGB 等纹理设置。具体材质类实例可用其公开属性；通用 `Material` 通过 `shaderData` 设置 Shader 参数。编辑器 `.mat` 资产在运行脚本中按通用 `Material` 使用，不要从 Shader 名称推断 `PBRMaterial` 等具体类。

## 关联
- API：`shader`、`shaderData`（`setTexture/setFloat/setVector3/setColor/setMatrix` 等）、`enableMacro/disableMacro`、`renderState`、`clone`
- 组件：`Renderer.setMaterial/getMaterial`
- 枚举：`RenderQueueType`、`CullMode`、`BlendFactor`、`CompareFunction`

## 怎么用
1) 创建材质：`new PBRMaterial(engine)` 或自定义 `new Material(engine, Shader.find("xxx"))`。
2) 设置参数：通过 `shaderData` 绑定贴图/数值，必要时启用宏控制分支。
3) 配置渲染状态：设置透明/AlphaTest 时调整 `renderQueueType`、`blendState`、`depthState`。
4) 赋给渲染器；需要独立修改时克隆或实例化材质。

## Best Practices
- 共享材质用于相同外观，大量实例化时减少状态切换；需要个性化参数时克隆材质。
- 透明/半透明请设置正确 RenderQueue 与 BlendState，同时关闭深度写（`depthState.writeEnabled=false`）避免排序问题。
- 使用 sRGB 颜色贴图、线性数据贴图正确区分；与 Engine `colorSpace` 保持一致。
- 不再使用的材质从渲染器解绑，交给 `resourceManager.gc()` 回收。
- 2D/粒子材质默认配置了混合/裁剪参数，尽量复用内置材质模板。

## Few-shot（常见需求提示）
- “切换材质” → `renderer.setMaterial(slot, newMat);`
- “发光效果” → 使用 PBR 自发光贴图/颜色（`emissiveColor/emissiveTexture`），或自定义后处理。
- “描边/特效 shader” → 注册自定义 Shader，创建 `Material` 绑定并设置自定义宏/纹理。
- “调节透明度” → 对 `new PBRMaterial(engine)` 等确定的具体材质类使用 RGBA `baseColor`；对 Editor 注入的 `Material` 使用 `shaderData.setColor("material_BaseColor", color)`，再将材质 RenderQueue 设为 Transparent 并启用混合。

## Notes / Warning
- 修改共享材质会实时影响所有引用它的渲染器；谨慎在运行时写入。
- `baseColor/baseTexture` 是具体材质子类的 convenience API，不是 `Material`/`BaseMaterial` 的通用成员。`getMaterial/getInstanceMaterial` 返回 `Material | null`，`.mat` 资产即使使用 PBR Shader 也不能用未检查的 `as PBRMaterial` 取得这些成员；使用 `shaderData.setColor("material_BaseColor", ...)`、`shaderData.setTexture("material_BaseTexture", ...)`。
- RenderQueue 与 `priority`、相机层共同决定排序；错误配置会导致穿插/排序问题。
- Shader 属性名需与 shader 中定义匹配，否则不会生效；宏开关需与 shader 预编译宏保持一致。
