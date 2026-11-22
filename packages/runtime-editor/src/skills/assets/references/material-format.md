# 材质格式

纯色 Unlit 材质的写法如下，修改 r/g/b/a 选择颜色：

    { "name": "Solid", "shader": "Unlit", "shaderData": { "material_BaseColor": { "type": "Color", "value": { "r": 1, "g": 1, "b": 1, "a": 1 } } }, "macros": [] }

这个格式由 Engine 的 MaterialLoader 和 [IMaterialSchema](declare/engine/node_modules/@galacean/engine-loader/types/schema/MaterialSchema.d.ts) 定义。

- `material_BaseColor` 是 BaseMaterial、Unlit 和 PBR 共用的基础色属性；PBR 常用属性还有 `material_Metal`（`Float`，0–1）、`material_Roughness`（`Float`，0–1）、`material_EmissiveColor`（`Color`）、`material_BaseTexture` 与 `material_NormalTexture`（`Texture`）。
- `shaderData` 每项必须是 `{ "type": "<类型>", "value": <值> }`，支持的类型为 `Color`、`Float`、`Integer`、`Boolean`、`Vector2`、`Vector3`、`Vector4`、`Texture`。
- MaterialLoader 创建通用 Material，不运行 UnlitMaterial / PBRMaterial 的构造函数，也不提供它们的默认值。要写上需要的 shaderData 值和 macros 数组，数组为空也要写。
- Shader 名称区分大小写。内置已注册 Shader 包括 `"Unlit"`、`"PBR"`、`"BlinnPhong"`，不需要额外 Shader 资产。
- 材质贴图的 shaderData 项写成 type `"Texture"`，值为 `{ "url": "<资产虚拟路径>" }`。
- Scene 和 Prefab 资产使用已链接的 Editor 源数据结构。
