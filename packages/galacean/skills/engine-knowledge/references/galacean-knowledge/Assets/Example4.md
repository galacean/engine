# 自定义加载器 示例

## Summary
- 展示自定义加载器的用法。
- 关键 API：resourceLoader, Loader, AssetPromise, ResourceManager, LoadItem

## Code
```ts
import { AssetPromise, EngineObject, LoadItem, Loader, ResourceManager, resourceLoader } from "@galacean/engine";

enum CustomAssetType { FBX = "FBX" }
class FBXResource extends EngineObject {}

@resourceLoader(CustomAssetType.FBX, ["fbx"])
class FBXLoader extends Loader<FBXResource> {
  load(item: LoadItem, rm: ResourceManager): AssetPromise<FBXResource> {
    return new AssetPromise((resolve) => {
      // 解析文件，必要时用 rm.load 加载依赖
      resolve(new FBXResource(rm.engine));
    });
  }
}
```
