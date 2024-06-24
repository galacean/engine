---
order: 1
title: 资产的类型
type: 资产工作流
label: Resource
---

Galacean 定义了一系列开箱即用的内置资产，同时也提供了灵活的定制加载能力。

## 内置资源类型

| 资源        | 加载类型              | 参考                                                                       |
| ----------- | --------------------- | -------------------------------------------------------------------------- |
| Texture2D   | AssetType.Texture2D   | [示例](https://galacean.antgroup.com/#/examples/latest/wrap-mode)          |
| TextureCube | AssetType.HDR         | [示例](https://galacean.antgroup.com/#/examples/latest/hdr-loader)         |
| glTF        | AssetType.GLTF        | [示例](https://galacean.antgroup.com/#/examples/latest/gltf-basic)         |
| 压缩纹理    | AssetType.KTX2        | [示例](https://galacean.antgroup.com/#/examples/latest/compressed-texture) |
| 环境光      | AssetType.Env         | [示例](https://galacean.antgroup.com/#/examples/latest/ambient-light)      |
| 图集        | AssetType.SpriteAtlas | [示例](https://galacean.antgroup.com/#/examples/latest/sprite-atlas)       |
| 字体        | AssetType.Font        | [示例](https://galacean.antgroup.com/#/examples/latest/text-renderer-font) |

> 注意：环境光烘焙产物来自编辑器，或者使用 glTF Viewer，参考下图：

![gltf viewer](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*9mGbSpQ4HngAAAAAAAAAAAAAARQnAQ)

## 自定义资产加载器

用户也可以自定义加载器来加载自定义的资源：

```typescript
@resourceLoader(FBX, ["fbx"])
export class FBXLoader extends Loader<FBXResource> {
	load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<FBXResource> {
  	return new AssetPromise((resolve, reject)=> {
    	...
    })
  }
}
```

1. 通过 [@resourceLoader](/apis/core/#resourceLoader) 装饰器标注为 _ResourceLoader_，传入类型枚举和被解析的资源后缀名。上面的例子 `FBX` 是类型枚举， `["fbx"]`  是被解析资源的后缀名。
2. 重写 [load](/apis/core/#ResourceManager-load) 方法， `load`  方法会传入 `loadItem` 和 `resourceManager` ， `loadItem`  包含了加载的基信息， `resourceManager`  可以帮助加载其他引用资源。
3. 返回 [AssetPromise](/apis/core/#AssetPromise)  对象， `resolve`  解析后的资源结果，例如 FBX 返回特定的 `FBXResource` 。
4. 若报错则 `reject`  错误。
