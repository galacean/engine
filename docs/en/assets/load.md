---
order: 3
title: Loading Resources
type: Resource Workflow
label: Resource
---

In Galacean, loading resources is generally divided into three scenarios based on their usage:

- Resources are imported into the editor and used in a scene
- Resources are imported into the editor but not used in any scene
- Resources are not imported into the editor

> When loading a project using the project loader, only the resources used in the **main scene** will be loaded, other resources in the editor will not be loaded.

```typescript
await engine.resourceManager.load({
  type: AssetType.Project,
  url: "xxx.json",
});
```

> Similarly, when loading a specific scene using the scene loader, only the resources used in **that scene** will be loaded, other resources will not be loaded by default.

```typescript
const scene = await engine.resourceManager.load({
  type: AssetType.Scene,
  url: "xxx.json",
});
engine.sceneManager.activeScene = scene;
```

> For resources that are not used in any scene, you can load them using the [resourceManager.load](/apis/core/#Engine-resourceManager#load) method mounted on the Engine instance.

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

The following will specifically introduce loading resources at runtime:

- Resource Paths
- Loading Progress
- Canceling Loading
- Retrieving Loaded Assets

## Resource Paths

Resource URL paths support **relative paths**, **absolute paths**, and **virtual paths**:

- Relative paths are relative to the runtime root path. If there is an error in the path, adjustments can be made based on the loading error information in the developer tools.
- Absolute paths specify the complete file location, such as `https://xxxx.png`, and also include `blob` and `base64`.
- Virtual paths are paths in the editor's asset files, usually in the format `Assets/sprite.png`.

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

> In the editor, you can quickly copy the relative path of an asset by going to **[Asset Panel](/en/docs/assets-interface)** -> **Right-click Asset** -> **Copy relative path**.

### baseUrl

The `ResourceManger` now also supports setting a `baseUrl`:

```typescript
engine.resourceManager.baseUrl = "https://cdn.galacean.com";
```

If a `baseUrl` is set, the relative paths loaded will be combined with the `baseUrl`:

```typescript
engine.resourceManager.load("img/2d.png");
```

The actual loading path from the above code snippets would be `https://cdn.galacean.com/img/2d.png`.

## Loading Progress

By calling the load queue, you can obtain an [AssetPromise](/apis/core/#AssetPromise) object, and use [onProgress](/apis/core/#AssetPromise-onProgress) to get the loading progress.

```typescript
this.engine.resourceManager
  .load(["a.png", "b.gltf"])
  .onProgress((progress: number) => {
    console.log(`当前加载进度为 ${progress}`);
  });
```

## Canceling Loading

The _ResourceManager_ object has a method [cancelNotLoaded](/apis/core/#ResourceManager-cancelNotLoaded) that can be used to cancel the loading of unfinished resources by calling this method. Providing a URL will cancel the loading of a specific resource.

```typescript
// 取消所有未加载完的资源。
this.engine.resourceManager.cancelNotLoaded();
// 取消特定的 url 资源加载。
this.engine.resourceManager.cancelNotLoaded("test.gltf");
```

> Note: Currently, canceling the loading of unfinished resources will throw an exception.

## Retrieving Loaded Assets

Currently loaded assets are cached in the _ResourceManager_. To retrieve loaded assets, you can use the more secure `load` method, an **asynchronous method**, which will reload the corresponding resource even if it is not in the cache.

```typescript
const asset = await this.engine.resourceManager.load(assetItem);
```

If you are certain that the resource is currently in the cache, you can also use the `getFromCache` method, a **synchronous method**:

```typescript
// Get the asset corresponding to the URL provided
const asset = this.engine.resourceManager.getFromCache(url);
```
