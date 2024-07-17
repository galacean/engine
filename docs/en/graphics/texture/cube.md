---
order: 2
title: Cube Texture
type: Graphics
group: Texture
label: Graphics/Texture
---

The difference between a cube texture ([TextureCube](/apis/core/#TextureCube)) and a 2D texture is that it has 6 faces, which means a cube texture is composed of 6 2D textures.

![image.png](https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*Omw8Qo0WzfYAAAAAAAAAAAAAARQnAQ)

![image.png](https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*r-XPSaUTEnEAAAAAAAAAAAAAARQnAQ)

Cube textures and 2D textures have slightly different underlying sampling methods. Textures use 2D coordinates for sampling, while cube textures use 3D coordinates, specifically _direction vectors_ for sampling. Sampling a texture value from a cube texture using an orange direction vector would look like this:

![image.png](https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*X752S5pQSB0AAAAAAAAAAAAAARQnAQ)

Due to this sampling characteristic, cube textures can be used to achieve effects like skyboxes and environment reflections.

## Creation

> You can download free HDR textures from [Poly Haven](https://polyhaven.com/) or [BimAnt HDRI](http://hdri.bimant.com/)

After preparing the HDR, follow the steps **[Assets Panel](/en/docs/assets-interface)** -> **Right-click Upload** -> **Select TextureCube(.hdr)** -> **Choose the corresponding HDR texture** -> **Cube texture asset created** to complete the operation.

![image.png](https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Oi3FSLEEaYgAAAAAAAAAAAAADhuCAQ/original)

Similarly, in scripts, loading six corresponding textures in order can also generate the corresponding cube texture.

```typescript
const cubeTextureResource = {
  type: AssetType.TextureCube,
  urls: [
    "px - right 图片 url",
    "nx - left 图片 url",
    "py - top 图片 url",
    "ny - bottom 图片 url",
    "pz - front 图片 url",
    "nz - back 图片 url",
  ],
};

engine.resourceManager.load(cubeTextureResource).then((resource) => {
  // 引擎支持的立方纹理
  const cubeTexture = resource;
  // 接下来可以将纹理应用到材质上或者进行其他操作
});
```

## Usage

Cube textures are mainly used in skyboxes, for more details refer to [Sky Background](/en/docs/graphics-background-sky)

