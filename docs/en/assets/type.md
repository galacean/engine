---
order: 1
title: Types of Assets
type: Asset Workflow
label: Resource
---

Galacean defines a series of out-of-the-box built-in assets and also provides flexible custom loading capabilities.

## Built-in Resource Types

| Resource     | Loading Type           | Reference                                                                  |
| ------------ | ----------------------- | -------------------------------------------------------------------------- |
| Texture2D    | AssetType.Texture2D    | [Example](https://galacean.antgroup.com/#/examples/latest/wrap-mode)       |
| TextureCube  | AssetType.HDR          | [Example](https://galacean.antgroup.com/#/examples/latest/hdr-loader)      |
| glTF         | AssetType.GLTF         | [Example](https://galacean.antgroup.com/#/examples/latest/gltf-basic)      |
| Compressed Texture | AssetType.KTX2   | [Example](https://galacean.antgroup.com/#/examples/latest/compressed-texture) |
| Ambient Light | AssetType.Env          | [Example](https://galacean.antgroup.com/#/examples/latest/ambient-light)   |
| Sprite Atlas | AssetType.SpriteAtlas  | [Example](https://galacean.antgroup.com/#/examples/latest/sprite-atlas)    |
| Font         | AssetType.Font         | [Example](https://galacean.antgroup.com/#/examples/latest/text-renderer-font) |

> Note: The ambient light baking product comes from the editor or using glTF Viewer, see the image below:

![gltf viewer](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*9mGbSpQ4HngAAAAAAAAAAAAAARQnAQ)

## Custom Asset Loaders

Users can also create custom loaders to load custom resources:

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

1. Mark it as a _ResourceLoader_ using the [@resourceLoader](/apis/core/#resourceLoader) decorator, passing in the type enum and the parsed resource extension. In the example above, `FBX` is the type enum, and `["fbx"]` is the parsed resource extension.
2. Override the [load](/apis/core/#ResourceManager-load) method. The `load` method will receive `loadItem` and `resourceManager`, where `loadItem` contains the basic loading information, and `resourceManager` can help load other referenced resources.
3. Return an [AssetPromise](/apis/core/#AssetPromise) object. `resolve` the resolved resource result, for example, FBX returns a specific `FBXResource`.
4. If there is an error, `reject` it.
