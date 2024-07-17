---
order: 5
title: 精灵图集
type: 图形
group: 2D
label: Graphics/2D
---

[SpriteAtlas](/apis/core/#SpriteAtlas) 是一种精灵集合资源，通过将多个精灵纹理打包成一张精灵图集从而在绘制时合并绘制指令，它拥有以下优势：

- 更好的性能（合并绘制指令）；
- 更少的显存（打包算法降低纹理尺寸）；
- 更少的请求次数（通过减少碎片文件来减少加载的请求次数）；

下图精灵图集例子里每帧只调用了一次绘制指令：

<playground src="sprite-atlas.ts"></playground>

## 编辑器使用

### 创建精灵图集

在 **[资产面板](/docs/assets-interface)** 内右键，选择`功能列表`中的`创建`，并选中`精灵图集`，此时，一个空白的精灵图集资产就创建成功了。

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*W-HZSrvAiG8AAAAAAAAAAAAADjCHAQ/original" alt="buildBox" style="zoom: 67%;" />

选中`精灵图集`资产，可以在 **[检查器面板](/docs/interface-inspector)** 查看资产的详细信息。

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*LW0JS7v5dP8AAAAAAAAAAAAADjCHAQ/original" alt="buildBox" style="zoom: 67%;" />

### 添加精灵

在确定`精灵图集`与`精灵`之间的包含关系后，需要将`精灵`添加至对应的`精灵图集`，此步骤即可通过操作`精灵`资产实现，也可通过操作`精灵图集`资产实现，接下来就分别实践两种方式。

#### 方式一：操作精灵

左键选中需要添加的`精灵`资产，可以在 **[检查器面板](/docs/interface-inspector)** 找到精灵的`从属关系`，选择`打包进图集`就可以选取希望打包进的`精灵图集`资产了。

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*G_utQZfPYPoAAAAAAAAAAAAADjCHAQ/original" alt="buildBox" style="zoom: 67%;" />

#### 方式二：操作精灵图集

左键选中目标`精灵图集`资产，可以在 **[检查器面板](/docs/interface-inspector)** 找到图集打包的精灵列表，选择`添加精灵`就可以选取希望打包的`精灵`资产了。（若选取文件夹，则会添加文件夹目录下的所有精灵）

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*6unHT7e-S-8AAAAAAAAAAAAADjCHAQ/original" alt="buildBox" style="zoom: 67%;" />

### 移除精灵

#### 方式一：操作精灵

左键选中需要从图集中移除的的`精灵`资产，可以在 **[检查器面板](/docs/interface-inspector)** 找到精灵的`从属关系`（注意需确认目标图集的路径是否匹配），点击移除按钮就可以从目标图集中移除该精灵。

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*dQ_CT5qjHacAAAAAAAAAAAAADleLAQ/original" alt="buildBox" style="zoom: 67%;" />

#### 方式二：操作精灵图集

左键选中需要操作的`精灵图集`资产，可以在 **[检查器面板](/docs/interface-inspector)** 找到图集的精灵列表，找到要移除的精灵对象并点击移除按钮即可。

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*aZcoS6ISXAoAAAAAAAAAAAAADjCHAQ/original" alt="buildBox" style="zoom: 67%;" />

### 快速操作精灵

`精灵`资产被加入`精灵图集`后，可以在`精灵图集`的 **[检查器面板](/docs/interface-inspector)** 中快速操作精灵，他的属性会同步修改到`精灵`资产中

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*WxzIS5If7NsAAAAAAAAAAAAADjCHAQ/original" alt="buildBox"  />

### 设置

#### 打包设置

<img src="https://gw.alipayobjects.com/zos/OasisHub/81a2044b-c1b7-449d-96cf-1e098b72a1be/image-20231208165843716.png" alt="image-20231208165843716" style="zoom:50%;" />

| 设置名称           | 释义                                     |
| ------------------ | ---------------------------------------- |
| 纹理最大宽度       | 打包得到纹理的最大限制宽度               |
| 纹理最大高度       | 打包得到纹理的最大限制高度               |
| 边缘填充           | 打包精灵的边缘填充宽度                   |
| 允许旋转（未启用） | 是否通过旋转提高图集打包的空间利用率     |
| 空白裁减（未启用） | 是否通过空白裁减提高图集打包的空间利用率 |

#### 导出设置

<img src="https://gw.alipayobjects.com/zos/OasisHub/1f4302b8-d485-4d3e-b508-36b570f5a883/image-20231208165430415.png" alt="image-20231208165430415" style="zoom:50%;" />

| 属性                                                            | 值                                                                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 循环模式 U（[wrapModeU](/apis/core/#Texture-wrapModeU)）         | 截取模式（[Clamp](/apis/core/#TextureWrapMode-Clamp)）、 重复模式（[Repeat](/apis/core/#TextureWrapMode-Repeat)）、镜像重复模式（[Mirror](/apis/core/#TextureWrapMode-Mirror)）               |
| 循环模式 V（[wrapModeV](/apis/core/#Texture-wrapModeV)）         | 截取模式（[Clamp](/apis/core/#TextureWrapMode-Clamp)）、重复模式（[Repeat](/apis/core/#TextureWrapMode-Repeat)）、 镜像重复模式（[Mirror](/apis/core/#TextureWrapMode-Mirror)）               |
| 过滤模式（[filterMode](/apis/core/#Texture-filterMode)）         | 点过滤（[Point](/apis/core/#TextureFilterMode-Point)）、双线性过滤（[Bilinear](/apis/core/#TextureFilterMode-Bilinear)）、 三线性过滤（[Trilinear](/apis/core/#TextureFilterMode-Trilinear)） |
| 各向异性过滤等级（[anisoLevel](/apis/core/#Texture-anisoLevel)） | 向向异性等级，1 ~ 16                                                                                                                                                                       |
| 纹理映射([Mipmap](/apis/core/#Texture-generateMipmaps)）         | true , false                                                                                                                                                                               |

### 最佳实践

点击`精灵图集`资产，通过调整`打包设置`的`纹理最大宽度`与`纹理最大高度`，同时调用`打包对象`中的`打包并预览`，可以保证图集利用率在一个较高的水平。

![image-20210901171947471](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*lyhRSY63HJgAAAAAAAAAAAAADjCHAQ/original)

预览图中左侧表示导出图片的大小信息，右侧表示图集利用率信息（代表所有散图面积的和占用最终大图的面积百分比），可依据此值调整打包设置以达到较佳的结果。

## 脚本使用

### 图集生成

Galacean 为精灵图集提供了命令行工具，开发者可以按照以下步骤生成图集：

1. 安装包

```bash
npm i @galacean/tools-atlas -g
```

2. 执行打包命令

```bash
galacean-tool-atlas p inputPath -o outputName
```

其中 `inputPath` 表示需要打包的文件夹路径，而 `outputName` 则表示打包输出的精灵图集文件名，如果你得到下图所示结果，那么说明打包成功了。

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*UhLBRpt9SwAAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:75%;" />

| 属性           | 解释                                         |
| -------------- | -------------------------------------------- |
| f/format       | 打包输出的精灵图集格式 (默认: "galacean")    |
| o/output       | 打包输出的精灵图集文件名 (默认: "galacean")  |
| a/algorithm    | 打包精灵图集的算法 (默认: "maxrects")        |
| ar/allowRotate | 打包精灵图集是否支持旋转 (默认: false)       |
| p/padding      | 图集中每个精灵和这个精灵边框的距离 (默认: 1) |
| mw/maxWidth    | 最后打包出的精灵图集的最大宽度 (默认: 1024)  |
| mh/maxHeight   | 最后打包出的精灵图集的最大高度 (默认: 1024)  |
| s/square       | 强制打包成正方形 (默认: false)               |
| pot            | 宽高强制打包成 2 的幂 (默认: false)          |

更多请参照[图集打包工具](https://github.com/galacean/tools/blob/main/packages/atlas/README.md)。

### 使用

1. 上传图集图片和图集文件至 CDN 同一目录下，例如文件和图片的地址应分别为 `https://*cdnDir*/*atlasName*.atlas` 和 `https://*cdnDir*/*atlasName*.png`。

2. 加载与使用

```typescript
engine.resourceManager
  .load<SpriteAtlas>({
    url: "https://*cdnDir*/*atlasName*.atlas",
    type: AssetType.SpriteAtlas,
  })
  .then((atlas) => {
    // Get all sprites.
    const allSprites = atlas.sprites;
    // Get sprite by spriteName.
    atlas.getSprite("spriteName");
    // If multiple sprites have the same name, we can get all like this.
    const allSpritesWithSameName = atlas.getSprites("spriteName", []);
  });
```

## 注意事项

1. 请将绘制时序相连的精灵打包进同一图集，可显著提升性能（降低绘制指令的调用次数）；
2. 清理精灵图集时，需要确保图集内的所有精灵都已不使用；
3. 打包精灵图集是需要统筹精灵数目与尺寸，避免一次打包生成多张精灵图集；
