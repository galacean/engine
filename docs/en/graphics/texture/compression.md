---
order: 4
title: Texture Compression
type: Graphics
group: Texture
label: Graphics/Texture
---

**[KTX2](https://www.khronos.org/ktx/)** (Khronos Texture Container version 2.0) is the latest texture compression scheme launched by Khronos, supported by Galacean since version 1.1. KTX2 will transcode to the corresponding format of compressed texture (BC/PVRTC/ETC/ASTC) based on the device platform support at runtime.

## Usage

In the engine, simply use `resourceManager` to load:

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

Using ktx2 in glTF requires including the [KHR_texture_basisu](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md) extension.

KTX2 can be generated using:

- toktx
- basisu

### Editor

When packaging the project, the editor can configure options to generate KTX2. Refer to the '[Project Release](/en/docs/platform/platform/)' document. The project export is a global configuration, and different compression formats can be configured independently for different texture resources. Check overwrite in the texture panel of the editor to override the global configuration:

<img src="https://mdn.alipayobjects.com/rms/afts/img/A*fmURSZ4HwKUAAAAAAAAAAAAAARQnAQ/original/image-20240705112419249.png" alt="image-20240705112419249" style="zoom:50%;" />

- ETC1S has a small size and minimal memory usage but lower quality, suitable for albedo, specular, and other maps.
- UASTC has a larger size and higher quality, suitable for normal maps and similar textures.

## Compatibility

KTX2 transcoding uses WebAssembly technology, requiring Chrome 57+ and iOS 11.3+ (WebAssembly in versions 11.0 ~ 11.2 has a [bug](https://bugs.webkit.org/show_bug.cgi?id=181781)).
