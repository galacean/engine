---
order: 4
title: 纹理压缩
type: 图形
group: 纹理
label: Graphics/Texture
---

**[KTX2](https://www.khronos.org/ktx/)**(Khronos Texture Container version 2.0) 是 Khronos 推出最新的纹理压缩方案，Galacean 自 1.1 版本开始已经支持。KTX2 会根据设备平台支持运行时转码到对应格式的压缩纹理(BC/PVRTC/ETC/ASTC)。

## 使用

在引擎中，直接使用 `resourceManager` 加载即可：

```typescript
engine.resourceManager.load("xxx.ktx2");
// 或
engine.resourceManager.load<Texture2D>({
  type: AssetType.KTX2,
  url: "xxx.ktx2",
}).then(tex=>{
  material.baseTexture = tex;
})
```

<playground src="compressed-texture.ts"></playground>

glTF 中使用 ktx2 需要包含 [KHR_texture_basisu](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md) 扩展。

KTX2 的生成可以使用：

- toktx
- basisu
- 编辑器打包，可以参考『[项目发布](/docs/assets-build)』文档。

## 兼容性

KTX2 转码使用到了 WebAssembly 技术，需要使用 Chrome 57+，和 iOS 11.3+（11.0 ~ 11.2.以下的 WebAssembly 存在 [bug](https://bugs.webkit.org/show_bug.cgi?id=181781)）

iOS 16 以下系统，在通过 worker 加载必要的 KTX2 解析 wasm 文件时会概率发生无返回的情况，尤其是在 wasm 首次加载时概率较大。可以通过 iOS 不走 worker 来绕过去: 

```typescript
WebGLEngine.create({ canvas: "canvas", ktx2Loader: { workerCount: 0 } });
```
