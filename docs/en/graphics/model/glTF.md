---
order: 1
title: glTF
type: Graphics
group: Model
label: Graphics/Model
---

> For more details, please visit the [glTF official website](https://www.khronos.org/gltf/)

**glTF** (GL Transmission Format) is a specification released by [Khronos](https://www.khronos.org/) that efficiently transmits and loads 3D scenes. It is considered the "JPEG" format in the 3D field, covering features of traditional model formats like FBX and OBJ. Its plugin mechanism allows users to flexibly customize desired functionalities, as seen [here](https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos).

## Ecosystem

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*vx8bQKOiNdcAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112129853" style="zoom:50%;" />

## Export Products

The export products of glTF are generally divided into two types:

- **(.gltf + .bin + png)**: Suitable for scenes with large image sizes, separating images and models to asynchronously load models and textures.
- **(.glb)**: Suitable for scenes with large model files, saving all data in binary format. The model can only be displayed after all data is parsed. Galacean supports both types of products.

The choice of export type can be determined based on the actual project requirements.

## Galacean's Support for glTF

**glTF 2.0** is the recommended primary 3D scene transmission format by Galacean. Galacean provides excellent support for the core features and plugins of **glTF 2.0**:

- Supports meshes, materials, and texture information in glTF, compiling them into runtime mesh assets, material assets, and texture assets.
- Supports animations in glTF (including skeletal animations and BlendShapes).
- Supports node information in glTF (including pose information), compiling them into runtime entity objects while maintaining the original hierarchy.
- Supports glTF cameras, compiling them into runtime camera components.
- Supports some glTF plugins.

glTF has many features, and the official website offers numerous [examples](https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/2.0) for reference. Galacean also provides a replicated version for quick browsing. You can switch between different glTF models using the **glTF List** below.

<playground src="gltf-loader.ts"></playground>

### Plugin Support

Galacean currently supports the following glTF plugins. If a glTF file contains any of these plugins, the corresponding functionalities will be automatically loaded:

| Plugin                                                                                                                                                             | Functionality                                                                                                                          |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| [KHR_draco_mesh_compression](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_draco_mesh_compression.ts)                   | Supports Draco compressed models, saving memory.                                                                                      |
| [KHR_lights_punctual](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_lights_punctual.ts)                                 | Supports multiple light sources, parsed as engine light sources. See [Lighting Tutorial](/en/docs/graphics-light) for details.         |
| [KHR_materials_pbrSpecularGlossiness](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_materials_pbrSpecularGlossiness.ts) | Supports PBR [Specular-Glossiness Workflow](/apis/core/#PBRSpecularMaterial).                                                           |
| [KHR_materials_unlit](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_materials_unlit.ts)                                 | Supports [Unlit Materials](/en/docs/graphics-shader-unlit).                                                                              |
| [KHR_materials_variants](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_materials_variants.ts)                           | Allows multiple materials for a renderer, then switches materials using the [setMaterial](/apis/core/#Renderer-setMaterial) interface. |
| [KHR_mesh_quantization](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_mesh_quantization.ts)                             | Supports [vertex data compression](https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization#extending-mesh-attributes), saving memory by converting vertex data to integers. |
| [KHR_texture_transform](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_texture_transform.ts)                             | Supports texture scaling and offset transformations. Refer to the [TilingOffset](https://oasisengine.cn/#/examples/latest/tiling-offset) example. |
| [KHR_materials_clearcoat](https://github.com/ant-galaxy/oasis-engine/blob/main/packages/loader/src/gltf/extensions/KHR_materials_clearcoat.ts)                     | Supports clearcoat extension for materials. Refer to the [Clearcoat](https://oasisengine.cn/#/examples/latest/pbr-clearcoat) example.   |
| [GALACEAN_materials_remap](https://github.com/ant-galaxy/oasis-engine/blob/main/packages/loader/src/gltf/extensions/GALACEAN_materials_remap.ts)                   | Supports editor material mapping.                                                                                                    |

### Plugin Extension

If the built-in plugins provided by the official cannot meet your needs, we also offer a way to extend plugins.

For example, if Unity exports the following glTF plugin and wants to extend `Unity_Material_Plugin` based on materials to generate new custom materials, and then wants to add a light on a node based on the light plugin `Unity_Light_Plugin`:

```json
{
  ...
  materials:[{
    extensions:{
      Unity_Material_Plugin:{
        color: [1,1,1],
        ...
      }
    }
  }],
  nodes:[{
    extensions:{
      Unity_Light_Plugin:{
        type:"point",
        ...
      }
    }
  }]

}
```

#### 1. Custom Creation and Parsing

Following the example above, we register a material plugin, where the second parameter `GLTFExtensionMode.CreateAndParse` indicates that this plugin is used for creating instances and parsing:

```ts
@registerGLTFExtension("Unity_Material_Plugin", GLTFExtensionMode.CreateAndParse)
class UnityMaterialPluginParser extends GLTFExtensionParser {
  createAndParse(context: GLTFParserContext, schema: {color,...other}}): Promise<Material> {
    const { engine } = context.glTFResource;
    const yourCustomMaterial = new Material(engine,customShader);
    ...
    return yourCustomMaterial;
  }
}
```

#### 2. Incremental Parsing

Following the example above, we register a light plugin, where the second parameter `GLTFExtensionMode.AdditiveParse` indicates that this plugin performs incremental parsing based on the original instance, such as adding a light source to this entity:

```ts
@registerGLTFExtension("Unity_Light_Plugin", GLTFExtensionMode.AdditiveParse)
class UnityLightPlugin extends GLTFExtensionParser {
  additiveParse(context: GLTFParserContext, entity: Entity, extensionSchema: {type,...other}): void {
    entity.addComponent(type==="point"?PointLight:DirectLight);
    ...
  }
}
```

#### 3. Custom Pipeline

If the above methods still do not meet your needs, you can completely customize the parsing pipeline to rewrite the parsing logic:

```ts
@registerGLTFParser(GLTFParserType.Material)
class CustomMaterialParser extends GLTFParser{
  parse(context: GLTFParserContext, index: number): Promise<Material> {
      const materialInfo = context.glTF.materials[index];
      ...
      return materialPromise;
   }
}

engine.resourceManager
    .load<GLTFResource>({
      type: AssetType.GLTF,
      url: "https://gw.alipayobjects.com/os/bmw-prod/150e44f6-7810-4c45-8029-3575d36aff30.gltf"
    })
    .then((gltf) => {
      const entity = rootEntity.createChild();
      entity.addChild(gltf.defaultSceneRoot);
    })
```
