---
order: 4
title: Texture Compression
type: Graphics
group: Texture
label: Graphics/Texture
---

**[KTX2](https://www.khronos.org/ktx/)** (Khronos Texture Container version 2.0) is the latest texture compression solution introduced by Khronos, supported by Galacean since version 1.1. KTX2 will transcode to the corresponding format of compressed textures (BC/PVRTC/ETC/ASTC) based on the device platform support at runtime.

## Usage

In the engine, simply load using `resourceManager`:

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

To use KTX2 in glTF, the [KHR_texture_basisu](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md) extension must be included.

KTX2 generation can be done using:

- toktx
- basisu
- Editor packaging, refer to the '[Project Deployment](/en/docs/assets-build)' document.

## Compatibility

KTX2 transcoding utilizes WebAssembly technology, requiring Chrome 57+ and iOS 11.3+ (WebAssembly in 11.0 ~ 11.2 has a [bug](https://bugs.webkit.org/show_bug.cgi?id=181781)).

For systems below iOS 16, there is a chance of no return when loading the necessary KTX2 parsing wasm file through a worker, especially when loading wasm for the first time. This can be bypassed by not using a worker on iOS:

```typescript
WebGLEngine.create({ canvas: "canvas", ktx2Loader: { workerCount: 0 } });
```
