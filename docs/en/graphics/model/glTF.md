---
order: 1
title: glTF
type: Graphics
group: Model
label: Graphics/Model
---

> For more details, please visit the [glTF official website](https://www.khronos.org/gltf/)

**glTF** (GL Transmission Format) is a specification released by [khronos](https://www.khronos.org/) that enables efficient transmission and loading of 3D scenes. It is the "JPEG" format in the 3D field, covering the functionalities of traditional model formats like FBX and OBJ. It supports almost all features in 3D scenes, and its [plugin mechanism](https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos) allows users to flexibly customize and implement desired functionalities.

## Ecosystem

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*vx8bQKOiNdcAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112129853" style="zoom:50%;" />

## Exported Products

The exported products of glTF are generally divided into two types:

- **(.gltf + .bin + png)**: Suitable for scenarios with large image sizes, so images and models are separated, allowing asynchronous loading of models and textures.
- **(.glb)**: Suitable for scenarios with large model files, where all data is saved in binary format. The model can only be displayed after all data is parsed. Galacean supports both types of products.

Both types of products are supported in Galacean. The choice of export type can be decided based on the actual project requirements.

## Galacean's Support for glTF

**glTF2.0** is currently the recommended 3D scene transmission format for Galacean. Galacean provides good support for the core functionalities and plugins of **glTF2.0**:

- Supports meshes, materials, and texture information in glTF, compiling them into runtime mesh assets, material assets, and texture assets.
- Supports animations in glTF (including skeletal animations and BlendShape).
- Supports node information in glTF (including pose information), which will be compiled into runtime entity objects while maintaining the original hierarchy.
- Supports cameras in glTF, compiling them into runtime camera components.
- Supports some plugins of glTF.

glTF has many features, and the official website provides a large number of [examples](https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/2.0) for reference. Galacean also provides a replicated version for quick browsing. You can switch between different glTF models through the following **glTF List**.

<playground src="gltf-loader.ts"></playground>

### Plugin Support

Galacean currently supports the following glTF plugins. If the glTF file contains the corresponding plugins, the respective functionalities will be automatically loaded:

| Plugin | Functionality |
| :-- | :-- |
| [KHR_draco_mesh_compression](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_draco_mesh_compression) | Supports Draco compressed models, saving video memory |
| [KHR_texture_basisu](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu) | Supports KTX2 texture compression, saving video memory |
| [KHR_lights_punctual](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_lights_punctual) | Supports multiple light sources, parsed into engine light sources. See [Lighting Tutorial](/en/docs/graphics/light/light/) for details |
| [KHR_materials_pbrSpecularGlossiness](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Archived/KHR_materials_pbrSpecularGlossiness) | Supports PBR [Specular-Glossiness Workflow](/apis/core/#PBRSpecularMaterial) |
| [KHR_materials_unlit](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_unlit) | Supports [Unlit Materials](/en/docs/graphics/shader/builtins/unlit/) |
| [KHR_materials_variants](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_variants) | Allows multiple materials in the renderer, with material switching via the [setMaterial](/apis/core/#Renderer-setMaterial) interface |
| [KHR_mesh_quantization](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_mesh_quantization) | Supports [vertex data compression](https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization#extending-mesh-attributes), saving video memory. For example, vertex data is usually floating-point numbers, but this plugin can save it as integers |
| [KHR_texture_transform](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_transform) | Supports texture scaling and offset transformations. See the [TilingOffset](/en/embed/tiling-offset) example for reference |
| [KHR_materials_clearcoat](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_clearcoat) | Supports the clear coat extension of materials. See the [Clearcoat](/en/embed/pbr-clearcoat) example for reference |
| [KHR_materials_ior](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_ior) | Supports setting the index of refraction for materials |
| [KHR_materials_anisotropy](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_anisotropy) | Supports setting anisotropy for materials. See the [Anisotropy](/en/embed/pbr-anisotropy) example for reference |
| [GALACEAN_materials_remap](https://github.com/galacean/engine/blob/main/packages/loader/src/gltf/extensions/GALACEAN_materials_remap.ts) | Supports editor material mapping |

### Plugin Extensions

If the built-in plugins do not meet your needs, we also provide a method to extend plugins.

For example, if Unity exports the following glTF plugin and you want to extend the `Unity_Material_Plugin` to generate a new custom material based on the material, and then use the `Unity_Light_Plugin` to add a light to a node:

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

Following the example above, we register a material plugin. The second parameter `GLTFExtensionMode.CreateAndParse` indicates that this plugin is used for creating instances and parsing:

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

Following the example above, we register a light plugin. The second parameter `GLTFExtensionMode.AdditiveParse` indicates that this plugin performs incremental parsing on the original instance, such as adding a light source to this entity:

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
