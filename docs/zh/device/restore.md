---
order: 0
title: 设备恢复
type: 资源
label: Device
---

由于 GPU 是一种共享资源，在某些情况 GPU 可能会回收控制权，导致你的程序 GPU 设备丢失，例如以下几种情况可能会发生设备丢失：

- 某个页面卡住时间过长
- 多个页面占用过多的 GPU 资源，所有页面丢失上下文，并只恢复前台页面
- PC 设备切换显卡或者更新显卡驱动

设备丢失后引擎在合适的时机会自动恢复程序所有内容，用户通常无需关心，在必要时用户可以通过以下机制编码处理设备丢失和恢复逻辑。

### 丢失和恢复处理

当 GPU 设备丢失时，`Engine` 会派发 `devicelost` 事件，用户可以做一些用户提示或保存配置之类的逻辑：

```typescript
engine.on("devicelost", () => {
  // Do some device lost logic here
  // For example，prompt user or save configuration etc
});
```

引擎支持自动 GPU 设备自动恢复，当程序可以恢复时，`Engine` 会派发 `devicerestored` 事件，引擎内部会自动重建纹理、缓冲、着色器等低级 GPU 资源，并且会尝试自动恢复其数据内容。通常通过引擎提供的 Loader 和 PrimitiveMesh 等方式创建的资源可以完全自动恢复其内容，开发者无需做任何处理。只有当开发者自行修改资源内容时需要手动处理，比如手动修改了纹理的像素内容。

```typescript
engine.on("devicerestored", () => {
  // Do some device restore logic here
  // For example，restore user-modified texture content
  texture.setPixelBuffer(pixels, 0, offsetX, offsetY, width, height);
});
```

### 自定义恢复器

还有一种情况是资源完全由开发者自行创建，比如自定义 [Loader](/docs/assets-type) 或程序化生成资源。除了可以通过上面的方式在 `devicerestored` 事件中处理，也可以通过自定义内容恢复器实现，以下案例是为用户自行创建的纹理注册一个自定义恢复器并注册到 `ResourceManager` 中。当设备需要恢复时，`restoreContent` 方法会自动触发并恢复其内容。

```typescript
// Step 1: Define content restorer
export class CustomTextureContentRestorer extends ContentRestorer<Texture2D> {
  /**
   * Constructor of CustomTextureContentRestorer.
   * @param resource - Texture2D resource
   * @param url - Texture2D content source url
   */
  constructor(resource: Texture2D, public url: string) {
    super(resource);
  }

  /**
   * @override
   */
  restoreContent(): AssetPromise<Texture2D> | void {
    return request<HTMLImageElement>(this.url).then((image) => {
      const resource = this.resource;
      resource.setImageSource(image);
      resource.generateMipmaps();
      return resource;
    });
  }
}

// Step 2: Register Content Restorer
resourceManager.addContentRestorer(
  new CustomTextureContentRestorer(texture, url)
);
```

> 注意：恢复器实现不建议依赖和占用大量 CPU 内存

### 模拟设备丢失和恢复

实际项目中触发设备丢失和恢复的概率较小，为了方便开发者测试设备丢失和恢复后的程序表现和逻辑处理，`Engine` 提供了内置方法模拟设备丢失和恢复。

| 方法                                                       | 解释         |
| ---------------------------------------------------------- | ------------ |
| [forceLoseDevice](/apis/core/#Engine-forceLoseDevice)       | 强制丢失设备 |
| [forceRestoreDevice](/apis/core/#Engine-forceRestoreDevice) | 强制恢复设备 |

### 参考

- 《WebGL 处理上下文丢失》：https://www.khronos.org/webgl/wiki/HandlingContextLost
