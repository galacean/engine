---
order: 3
title: 资产的加载
type: 资产工作流
label: Resource
---

在 Galacean 中，资产加载一般由使用它的情形分为三种情况：

- 资产被导入到编辑器中，且在某个场景中使用
- 资产被导入到编辑器中，但没有在场景中使用
- 资产没有被导入到编辑器中

> 若使用项目加载器加载项目，项目只会加载**主场景**中使用到的资源，编辑器里的其他资源不会被加载。

```typescript
await engine.resourceManager.load({
  type: AssetType.Project,
  url: "xxx.json",
});
```

> 对应地，若使用场景加载器加载某个场景，场景加载器只会加载**该场景**中使用到的资源，其他资源默认不会被加载。

```typescript
const scene = await engine.resourceManager.load({
  type: AssetType.Scene,
  url: "xxx.json",
});
engine.sceneManager.activeScene = scene;
```

> 至于那些没有在场景中使用的资产，可以使用挂载在 Engine 实例中的 [resourceManager.load](/apis/core/#Engine-resourceManager#load) 加载资源。

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

下面将具体介绍在运行时加载资源的：

- 资源路径
- 加载进度
- 取消加载
- 获取加载过的资产

## 资源路径

资源的 url 路径支持**相对路径**，**绝对路径**与**虚拟路径**：

- 相对路径是针对运行时根路径而言的，若路径有误，可在开发者工具中根据加载报错信息进行调整
- 绝对路径是完整指定文件位置的路径，如 `https://xxxx.png`，也包含 `blob` 与 `base64`
- 虚拟路径是在编辑器的资产文件中的路径，一般为 `Assets/sprite.png`

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

> 在编辑器中可以通过 **[资产面板](/docs/assets-interface)** -> **右键资产** -> **Copy relative path** 快速复制资产的相对路径

### baseUrl

`ResourceManger` 目前也支持了 `baseUrl` 的设置：

```typescript
engine.resourceManager.baseUrl = "https://cdn.galacean.com";
```

如果设置了 `baseUrl`，加载的相对路径会和 `baseUrl` 组合：

```typescript
engine.resourceManager.load("img/2d.png");
```

上面两段代码可以得出实际的加载路径是`https://cdn.galacean.com/img/2d.png`。

## 加载进度

调用加载队列可以得到一个 [AssetPromise](/apis/core/#AssetPromise) 对象，可以使用 [onProgress](/apis/core/#AssetPromise-onProgress) 获取加载进度。

```typescript
this.engine.resourceManager
  .load(["a.png", "b.gltf"])
  .onProgress((progress: number) => {
    console.log(`当前加载进度为 ${progress}`);
  });
```

## 取消加载

_ResourceManager_ 对象中有 [cancelNotLoaded](/apis/core/#ResourceManager-cancelNotLoaded) 方法，可以通过调用此方法取消未加载完成的资源。传入 url 会取消特定的 url 的资源加载。

```typescript
// 取消所有未加载完的资源。
this.engine.resourceManager.cancelNotLoaded();
// 取消特定的 url 资源加载。
this.engine.resourceManager.cancelNotLoaded("test.gltf");
```

> 注意：目前取消加载未完成资源会抛出异常。

## 获取加载过的资产

目前加载过的资产会缓存在 _ResourceManager_ 中，如需获取加载过的资产，可以通过较为保险的 `load` 这个**异步方法**，**即使资产没有在缓存中**，该接口也会重新加载对应资源。

```typescript
const asset = await this.engine.resourceManager.load(assetItem);
```

若明确地知道这个资源现在在缓存中，也可以调用 `getFromCache` 这个**同步方法**：

```typescript
// 获取传入的 URL 对应的资产
const asset = this.engine.resourceManager.getFromCache(url);
```
