---
order: 2
title: 立方纹理
type: 图形
group: 纹理
label: Graphics/Texture
---

立方纹理（[TextureCube](/apis/core/#TextureCube)）和 2D 纹理的区别是它有 6 个面，即用 6 张 2D 纹理组成了一个立方纹理。

![image.png](https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*Omw8Qo0WzfYAAAAAAAAAAAAAARQnAQ)

![image.png](https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*r-XPSaUTEnEAAAAAAAAAAAAAARQnAQ)

立方纹理和 2D 纹理的底层采样方式略有不同，纹理使用二维坐标进行采样，而立方纹理使用三维坐标，即 _方向向量_ 进行采样，如使用一个橘黄色的方向向量来从立方纹理上采样一个纹理值会像是这样：

![image.png](https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*X752S5pQSB0AAAAAAAAAAAAAARQnAQ)

正因为这种采样特性，所以立方纹理可以用来实现天空盒、环境反射等特效。

## 创建

> 可以在 [Poly Haven](https://polyhaven.com/) 或 [BimAnt HDRI](http://hdri.bimant.com/) 下载免费的 HDR 贴图

在准备好 HDR 后，依照路径 **[资产面板](/docs/assets-interface)** -> **右键上传** -> **选择 TextureCube(.hdr)** -> **选择对应 HDR 贴图** -> **立方纹理资产创建完毕** 操作即可。

![image.png](https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Oi3FSLEEaYgAAAAAAAAAAAAADhuCAQ/original)

同样的，在脚本中可以通过加载六张对应顺序的纹理也能得到相应的立方纹理。

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

## 使用

立方纹理主要在天空盒中使用，详情可参考[天空背景](/docs/graphics-background-sky)
