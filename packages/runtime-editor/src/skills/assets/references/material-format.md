# 材质格式

纯色 Unlit 材质的写法如下，修改 r/g/b/a 选择颜色：

    { "name": "Solid", "shader": "Unlit", "shaderData": { "material_BaseColor": { "type": "Color", "value": { "r": 1, "g": 1, "b": 1, "a": 1 } } }, "macros": [] }

这个格式由 Engine 的 MaterialLoader 和 [IMaterialSchema](declare/engine/node_modules/@galacean/engine-loader/types/schema/MaterialSchema.d.ts) 定义。

- `material_BaseColor` 是 BaseMaterial 和 UnlitMaterial 使用的属性。
- MaterialLoader 创建通用 Material，不运行 UnlitMaterial 的构造函数，也不提供它的默认值。要写上需要的 shaderData 值和 macros 数组，数组为空也要写。
- Shader 名称区分大小写。Unlit 由 Engine 注册，不需要 Shader 资产或 UnlitShader 类。
- 材质贴图的 shaderData 项写成 type `"Texture"`，值为 `{ "url": "<资产虚拟路径>" }`。
- Scene 和 Prefab 资产使用已链接的 Editor 源数据结构。
