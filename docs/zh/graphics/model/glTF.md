---
order: 1
title: glTF
type: 图形
group: 模型
label: Graphics/Model
---

> 更多详情可跳转 [glTF 官方网站](https://www.khronos.org/gltf/)

**glTF**（GL Transmission Format）是 [khronos ](https://www.khronos.org/)发布的一种能高效传输和加载 3D 场景的规范，是 3D 领域中的 "JPEG" 格式，其功能涵盖了 FBX、OBJ 等传统模型格式，基本支持 3D 场景中的所有特性，其[插件机制](https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos)也使用户可以灵活地自定义实现想要的功能。

## 生态

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*vx8bQKOiNdcAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112129853" style="zoom:50%;" />

## 导出产物

glTF 的导出产物一般分为两种：

- **(.gltf + .bin + png)**：适合图片体积大的场景，所以将图片和模型拆分开来，可以异步加载模型和纹理
- **(.glb)**：适合模型文件较大的场景，会将所有数据进行二进制保存，需要等所有数据解析完毕才能展示模型，Galacean 对这两种产物

以上两种产物在 Galacean 中都已支持，如何选择产物的导出类型可以按照项目实际情况决定。

## Galacean 对 glTF 的支持

**glTF2.0** 是目前 Galacean 推荐的首选 3D 场景传输格式，Galacean 对 **glTF2.0** 的核心功能和插件都做了很好的支持：

- 支持 glTF 中的网格，材质和纹理信息，并将它编译为运行时的网格资产，材质资产与纹理资产。
- 支持 glTF 中的动画（包含骨骼动画和 BlendShape ）
- 支持 glTF 中的节点信息（包含姿态信息），它们会被编译为运行时的 entity 对象，并保持原先的层级结构。
- 支持 glTF 的相机，并将它编译为运行时的相机组件
- 支持 glTF 的部分插件。

glTF 拥有非常多的特性，官网提供了大量的[示例](https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/2.0)进行参考，Galacean 也提供了一份复刻版本进行快速浏览，可以通过以下 **glTF List** 切换不同的 glTF 模型。

<playground src="gltf-loader.ts"></playground>

### 插件支持

Galacean 目前支持以下 glTF 插件，若 glTF 文件中包含相应插件，则会自动加载相应功能：

| 插件                                                                                                                                                               | 功能                                                                                                                                                                                                  |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [KHR_draco_mesh_compression](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_draco_mesh_compression.ts)                   | 支持 Draco 压缩模型，节省显存                                                                                                                                                                         |
| [KHR_lights_punctual](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_lights_punctual.ts)                                 | 支持多光源组合，会解析成引擎的光源，详见[光照教程](/docs/graphics/light/light/)                                                                                                                             |
| [KHR_materials_pbrSpecularGlossiness](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_materials_pbrSpecularGlossiness.ts) | 支持 PBR [高光-光泽度工作流](/apis/core/#PBRSpecularMaterial)                                                                                                                                          |
| [KHR_materials_unlit](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_materials_unlit.ts)                                 | 支持 [Unlit 材质](/docs/graphics/shader/builtins/unlit/)                                                                                                                                                       |
| [KHR_materials_variants](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_materials_variants.ts)                           | 允许渲染器存在多个材质，然后通过 [setMaterial](/apis/core/#Renderer-setMaterial) 接口进行材质切换                                                                                                      |
| [KHR_mesh_quantization](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_mesh_quantization.ts)                             | 支持[顶点数据压缩](https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization#extending-mesh-attributes)，节省显存，如顶点数据一般都是浮点数，此插件可以保存为整型 |
| [KHR_texture_transform](https://github.com/oasis-engine/engine/blob/main/packages/loader/src/gltf/extensions/KHR_texture_transform.ts)                             | 支持纹理的缩放位移变换，可以参考 [TilingOffset](https://galacean.antgroup.com/engine-archive/examples/latest/tiling-offset) 案例                                                                                          |
| [KHR_materials_clearcoat](https://github.com/ant-galaxy/oasis-engine/blob/main/packages/loader/src/gltf/extensions/KHR_materials_clearcoat.ts)                     | 支持材质的透明清漆度拓展，可以参考 [Clearcoat](https://galacean.antgroup.com/engine-archive/examples/latest/pbr-clearcoat) 案例                                                                                           |
| [GALACEAN_materials_remap](https://github.com/ant-galaxy/oasis-engine/blob/main/packages/loader/src/gltf/extensions/GALACEAN_materials_remap.ts)                   | 支持编辑器材质映射                                                                                                                                                                                    |

### 插件拓展

如果官方内置的插件不能满足您的需求，我们还提供了拓展插件的方法。

举个例子，如果 Unity 导出了以下 glTF 插件，希望能根据材质拓展 `Unity_Material_Plugin` 生成新的自定义材质，然后根据灯光插件 `Unity_Light_Plugin` 表示想在某个节点上面加一个灯光：

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

#### 1. 自定义创建解析

按照上面的例子，我们注册一个材质插件，第二个参数 `GLTFExtensionMode.CreateAndParse` 表示这个插件是用来创建实例和解析的：

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

#### 2. 增量解析

按照上面的例子，我们注册一个灯光插件，第二个参数 `GLTFExtensionMode.AdditiveParse` 表示这个插件是在原来实例的基础上进行一些增量解析的,比如在这个实体上添加一个光源：

```ts
@registerGLTFExtension("Unity_Light_Plugin", GLTFExtensionMode.AdditiveParse)
class UnityLightPlugin extends GLTFExtensionParser {
  additiveParse(context: GLTFParserContext, entity: Entity, extensionSchema: {type,...other}): void {
    entity.addComponent(type==="point"?PointLight:DirectLight);
    ...
  }
}
```

#### 3. 自定义管线

如果上面的方法还不能满足您的需求，还可以完全自定义解析管线，用来重写解析的逻辑：

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
