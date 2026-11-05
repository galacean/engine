# 材质格式

A solid-color Unlit material is (change r/g/b/a to choose the color):

    { "name": "Solid", "shader": "Unlit", "shaderData": { "material_BaseColor": { "type": "Color", "value": { "r": 1, "g": 1, "b": 1, "a": 1 } } }, "macros": [] }

The format is implemented by Engine MaterialLoader and [IMaterialSchema](declare/engine/node_modules/@galacean/engine-loader/types/schema/MaterialSchema.d.ts). material_BaseColor is the property used by BaseMaterial/UnlitMaterial. MaterialLoader creates a generic Material; it does not run the UnlitMaterial constructor or supply its defaults. Include shaderData values you need and the macros array, even when empty. Shader names are case-sensitive; Unlit is registered by Engine, so it needs no shader asset or UnlitShader class. Material textures use shaderData entries with type "Texture" and value { "url": "<asset virtualPath>" }. Scene/Prefab assets use the linked Editor source schema.
