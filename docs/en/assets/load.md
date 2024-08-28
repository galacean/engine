---
order: 3
title: Asset Loading
type: Asset Workflow
label: Resource
---

In Galacean, asset loading is generally divided into three situations based on its usage:

- The asset is imported into the editor and used in a scene
- The asset is imported into the editor but not used in a scene
- The asset is not imported into the editor

> If the project loader is used to load the project, only the resources used in the **main scene** will be loaded, and other resources in the editor will not be loaded.

```typescript
await engine.resourceManager.load({
  type: AssetType.Project,
  url: "xxx.json",
});
```

> Correspondingly, if the scene loader is used to load a scene, the scene loader will only load the resources used in **that scene**, and other resources will not be loaded by default.

```typescript
const scene = await engine.resourceManager.load({
  type: AssetType.Scene,
  url: "xxx.json",
});
engine.sceneManager.activeScene = scene;
```

> As for those assets that are not used in the scene, you can use [resourceManager.load](/apis/core/#Engine-resourceManager#load) mounted on the Engine instance to load the resources.

```typescript
// 若只传入 URL ，引擎会依据后缀推断加载的资产类型，如 `.png` 对应纹理， `.gltf` 则对应模型
const gltf1 = await this.engine.resourceManager.load<GLTFResource>(
  "test1.gltf"
);
// 也可以通过 `LoadItem` 定义加载的资产类型，重试次数，重试间隔等信息
const gltf2 = await this.engine.resourceManager.load<GLTFResource>({
  type: AssetType.GLTF,
  url: "test2.gltf",
  retryCount: 5,
  timeout: 500,
  retryInterval: 500,
});
// 也支持传入数组批量加载，返回按顺序排列的加载好的资源队列。
const [texture2D, glTFResource] = await this.engine.resourceManager.load([
  "a.png",
  "b.gltf",
]);
```

The following will specifically introduce how to load resources at runtime:

- Resource path
- Loading progress
- Cancel loading
- Get loaded assets

## Resource Path

The URL path of the resource supports **relative paths**, **absolute paths**, and **virtual paths**:

- Relative paths are relative to the runtime root path. If the path is incorrect, you can adjust it based on the loading error information in the developer tools.
- Absolute paths specify the complete file location, such as `https://xxxx.png`, and also include `blob` and `base64`.
- Virtual paths are the paths in the asset files of the editor, generally `Assets/sprite.png`.

```typescript
// 加载相对路径下的资源
this.engine.resourceManager.load("a.png");

// 加载绝对路径下的资源
this.engine.resourceManager.load("https://a.png");

// 加载 base64
this.engine.resourceManager.load<GLTFResource>({
  url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  type: AssetType.Texture2D,
});

// 加载编辑器虚拟路径下的资源
this.engine.resourceManager.load<GLTFResource>("Assets/texture.png");
```

> In the editor, you can quickly copy the relative path of the asset through **[Asset Panel](/en/docs/assets/interface)** -> **Right-click asset** -> **Copy relative path**.

![image-20240717180517517](https://mdn.alipayobjects.com/rms/afts/img/A*yft2SLLgIyQAAAAAAAAAAAAAARQnAQ/original/image-20240717180517517.png)

### baseUrl

`ResourceManger` currently also supports setting `baseUrl`:

```typescript
engine.resourceManager.baseUrl = "https://cdn.galacean.com";
```

If `baseUrl` is set, the relative path loaded will be combined with `baseUrl`:

```typescript
engine.resourceManager.load("img/2d.png");
```

The actual loading path from the above two lines of code will be `https://cdn.galacean.com/img/2d.png`.

## Loading Progress

Calling the loading queue can get an [AssetPromise](/apis/core/#AssetPromise) object, and you can use [onProgress](/apis/core/#AssetPromise-onProgress) to get the loading progress.

```typescript
this.engine.resourceManager
  .load(["a.png", "b.gltf"])
  .onProgress((progress: number) => {
    console.log(`当前加载进度为 ${progress}`);
  });
```

## Cancel Loading

The _ResourceManager_ object has a [cancelNotLoaded](/apis/core/#ResourceManager-cancelNotLoaded) method, which can be used to cancel resources that have not been loaded yet. Passing in a URL will cancel the resource loading for that specific URL.

```typescript
// 取消所有未加载完的资源。
this.engine.resourceManager.cancelNotLoaded();
// 取消特定的 url 资源加载。
this.engine.resourceManager.cancelNotLoaded("test.gltf");
```

> Note: Currently, canceling the loading of unfinished resources will throw an exception.

## Get Loaded Assets

Currently, loaded assets are cached in the _ResourceManager_. If you need to get loaded assets, you can use the more reliable `load` **asynchronous method**. **Even if the asset is not in the cache**, this interface will reload the corresponding resource.

```typescript
const asset = await this.engine.resourceManager.load(assetItem);
```

If you know for sure that this resource is now in the cache, you can also call the `getFromCache` **synchronous method**:

```typescript
// Get the asset corresponding to the passed URL
const asset = this.engine.resourceManager.getFromCache(url);
```

It looks like you haven't pasted any content yet. Please provide the Markdown content you want translated, and I'll help you with the translation while adhering to the rules you've specified.
