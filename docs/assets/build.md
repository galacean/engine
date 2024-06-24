---
order: 2
title: 项目导出
type: 资产工作流
label: Resource
---

## HTML5 项目

Galacean Editor 项目导出功能可以将当前编辑器项目作为一个前端项目下载到本地。你可以在编辑器中配置项目导出的参数，如资产导出配置、渲染导出配置、物理导出配置等。基于这些配置，编辑器会生成出项目所需的代码、资产，生成对应的 `package.json`，并最终打包成一个 zip 包供你下载。

### 导出配置

#### 资产导出配置

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*h5VhR56vjZcAAAAAAAAAAAAADhuCAQ/original" alt="image-20231007201437362" style="zoom:50%;" />

资产导出配置可以用来控制导出的资源类型和质量等参数。在资产导出配置中，你可以选择导出的资源类型，例如模型、纹理、HDR 等等，以及选择每种类型的导出质量和格式等参数。在导出模型时，你可以选择是否导出模型的网格信息、骨骼信息、动画信息等。

| 配置          | 描述                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| glTF Quantize | glTF 压缩算法，详见[这里](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md)  |
| glTF Meshopt  | glTF 压缩算法，详见[这里](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md) |
| 纹理类型      | 勾选 [KTX2](https://www.khronos.org/ktx/) 开启[纹理压缩](/docs/graphics-texture-compression)优化选项                             |
| 纹理压缩格式  | 勾选 [KTX2](https://www.khronos.org/ktx/) 后可见，不同压缩格式会影响纹理的尺寸和渲染质量                                          |
| 纹理压缩质量  | 勾选 [KTX2](https://www.khronos.org/ktx/) 后可见，可以一定限度上调整纹理的尺寸和渲染质量                                          |
| 主场景        | 选择 **[资产面板](/docs/assets-interface)** 中的某个场景作为项目加载后的主场景                                                   |

#### 渲染导出配置

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*WZHzRYIpUzQAAAAAAAAAAAAADhuCAQ/original" style="zoom:50%;" />

渲染导出配置可以用来控制项目的渲染效果和性能等参数。

| 配置                                                                                                  | 描述                                                       |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| WebGL Mode                                                                                            | WebGL 的版本，`Auto` 值表示根据设备能力自动选择 WebGL 版本 |
| WebGL [Context](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext) 的配置 | Anti-Alias、Alpha、Preserve Drawing Buffer 等              |
| Device Pixel Ratio                                                                                    | [设备的像素比](/docs/core-canvas)，用来控制画布的尺寸     |

### 项目启动

在点击导出面板中的下载按钮后，你将得到一个项目的压缩包。解压缩后进入文件夹，目录结构（以 React 项目为例）如下：

```shell
├── example # 📁 示例目录
│   ├── main.tsx # 示例组件
├── public # 📁 公共资源目录
│		├── scene.json # 场景文件
│   └── ... # 其他
├── src # 📁 源代码目录
│   └── ... # 其他
├── index.tsx # ⚙️ 组件代码入口
├── index.html # ⚙️ 示例项目入口文件
├── project.json # ⚙️ 编辑器导出工程配置
|── tsconfig.json # ⚙️ TypeScript 配置文件
├── vite.config.ts # ⚙️ vite 配置文件
├── package.json # ⚙️ 项目配置文件
└── ... # 其他
```

### 项目调试

接下来就可以在本地进行项目的调试与预览了，依次在文件夹目录里的 Terminal 中运行以下命令，看看本地效果是否与编辑器中的效果一致吧：

```bash
npm install
npm run dev
```

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*jTKVR4LYseUAAAAAAAAAAAAADhuCAQ/original" alt="image-20231008163057689" style="zoom:50%;" />

### 项目构建与部署

一切准备完毕后就将项目构建并部署上去吧，在文件夹目录里的 Terminal 中运行以下命令：

```bash
npm run build
```

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*PXRURowEHRQAAAAAAAAAAAAADhuCAQ/original" alt="image-20231008163057689" style="zoom:50%;" />

可以发现，当 `build` 完毕后，文件目录（左上角）多出了一个 `dist` 文件夹，里面即包含了运行所需的所有代码与资源，接下来只需要将这个文件内的所有内容上传 CDN 即可。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*R9MEQahvjkUAAAAAAAAAAAAADhuCAQ/original" alt="image-20231008163057689" style="zoom:50%;" />

随后访问对应地址：

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Z4X6TKcFDaIAAAAAAAAAAAAADhuCAQ/original" alt="image-20231008163057689" style="zoom:50%;" />

> 导出项目为 vite 工程，更多部署方案参考 [vite 官网](https://vitejs.dev/guide/)

## 小程序项目

目前 Galacean 已经适配到支付宝和淘宝小程序。本教程默认开发者已经具备一定的小程序开发能力，如果没有，请阅读下面教程，下载小程序开发工具及申请 AppId：

- [支付宝小程序](https://opendocs.alipay.com/mini/developer)
- [淘宝小程序](https://miniapp.open.taobao.com/docV3.htm?docId=119114&docType=1&tag=dev)

小程序项目发布:

- [支付宝小程序发布](https://opendocs.alipay.com/mini/introduce/release)
- [淘宝小程序发布](https://developer.alibaba.com/docs/doc.htm?spm=a219a.7629140.0.0.258775fexQgSFj&treeId=635&articleId=117321&docType=1)

### 项目导出

Galacean 编辑器导出支付宝小程序的功能仍在开发中，交互方式和模板工程后续可能会有改动。

<img src="https://mdn.alipayobjects.com/rms/afts/img/A*ZIXuR7Bj5gEAAAAAAAAAAAAAARQnAQ/original/image-20231008163057689.png" alt="image-20231008163057689" style="zoom:50%;" />

### 项目启动

点击下载后会下载一个 zip 文件，解压文件目录结构如下：

```shell
.
├── mini # 📁 小程序执行目录
│   ├── dist # 📁 代码构建结果
│   ├── pages # 📁 小程序页面
│   ├── app.json # ⚙️ 项目配置文件
│   ├── app.js # 代码入口
├── public # 📁 公共资源目录
│		├── scene.json # 场景文件
│   └── ... # 其他
├── src # 📁 源代码目录
├── mini.project.json # ⚙️ 工程配置文件
├── project.json # ⚙️ 编辑器导出工程配置
└── ... # 其他
```

接下来就可以安装依赖和启动项目：

```shell
npm install
npm run dev
```

用小程序 IDE 打开可以看到：

![image-20230420111035524](https://mdn.alipayobjects.com/rms/afts/img/A*kEUkTbfSMIwAAAAAAAAAAAAAARQnAQ/original/image-20230420111035524.png)

### 本地资源处理

#### 蚂蚁集团内部用户

直接使用『上传到 CDN 』即可（在导出面板选项中，参考上图），使用集团默认 CDN 即可。若想使用自定义 CDN，参考非蚂蚁集团内部用户。

#### 非蚂蚁集团内部用户

1.  public 文件请自行上传 CDN
2.  修改 scene.json 文件或配置 baseUrl

### 包内文件加载（WIP）

目前还没有支持小程序的本地文件加载。

### 已知问题

- 小程序不支持 WebAssembly，目前无法使用 PhysX 作为物理后端
- 目前不支持本地文件加载，需要手动上传到 CDN

## 注意事项

在使用编辑器项目导出功能时，你需要注意以下事项：

1. 导出的项目需要在支持 WebGL 的环境中运行。
2. 导出的项目中可能包含大量的资源文件，你需要对项目进行优化和压缩，以提高项目的性能和加载速度。
3. 导出的项目中可能包含敏感信息和数据，你需要对项目进行安全性评估和保护，以防止信息泄漏和数据丢失等情况。

---

## 小程序的补充说明

### 小程序项目使用 OrbitControl

1. 引入二方库

```bash
npm install @galacean/engine-toolkit-controls -S
```

```typescript
import { OrbitControl } from "@galacean/engine-toolkit-controls/dist/miniprogram";
```

2. 添加组件

`OrbitControl` 组件需要添加到相机节点上。

```typescript
cameraEntity.addComponent(OrbitControl);
```

3. 事件模拟派发

因为小程序不支持 `addEventListener` 添加监听事件，得手动添加事件的模拟，并且小程序的 canvas 的多指触控存在 bug，所以添加一个和 canvas 大小和位置一样的 view 层去派发触摸事件：

```html
<view>
  <canvas
    onReady="onCanvasReady"
    style="width:{{cw}}px;height:{{ch}}px"
    type="webgl">
  </canvas>
  <view
    style="width:{{cw}}px;height:{{ch}}px;top:0px;position:absolute;"
    onTouchCancel="onTouchCancel"
    onTouchStart="onTouchStart"
    onTouchMove="onTouchMove"
    onTouchEnd="onTouchEnd"
  </view>
</view>
```

```typescript
import { dispatchPointerUp, dispatchPointerDown, dispatchPointerMove, dispatchPointerLeave, dispatchPointerCancel } from "@galacean/engine-miniprogram-adapter";

Page({
  ...
  onTouchEnd(e) {
    dispatchPointerUp(e);
    dispatchPointerLeave(e);
  },
  onTouchStart(e) {
    dispatchPointerDown(e);
  },
  onTouchMove(e) {
    dispatchPointerMove(e);
  },
  onTouchCancel(e) {
    dispatchPointerCancel(e);
  }
})
```

### Pro code 创建 Galacean 小程序项目

> 需要 Node.js 版本 >=12.0.0.

使用 yarn 创建

```bash
yarn create @galacean/galacean-app --template miniprogram
```

使用 npm **6.x** 版本创建

```
npm init @galacean/galacean-app --template miniprogram
```

使用 npm **7.x** 版本创建

```she
npm init @galacean/galacean-app -- --template miniprogram
```

**根据提示**完成后续步骤后，可以使用小程序开发工具打开项目：

![image-20210609164550721](https://gw.alipayobjects.com/zos/OasisHub/3e2df40f-6ccd-4442-85f8-69233d04b3b5/image-20210609164550721.png)

选择对应目录即可，顺利的话可以看到：

![image-20210609164816776](https://gw.alipayobjects.com/zos/OasisHub/04386e9c-b882-41f7-8aa6-a1bf990d578b/image-20210609164816776.png)

### 已有项目 Pro code 使用 Galacean

本教程假设你已经有一定开发能力，若不熟悉小程序开发，请详细阅读[小程序开发文档](https://opendocs.alipay.com/mini/developer)。

1. 在项目目录中打开 `Terminal`，安装依赖：

```bash
# 使用 npm
npm install @galacean/engine --save
npm install @galacean/engine-miniprogram-adapter --save
# 使用 yarn
yarn add @galacean/engine
yarn add @galacean/engine-miniprogram-adapter
```

2. 在小程序项目配置文件 `app.json` 里添加下面配置项：

```json
{
  ...
  "window": {
    ...
    "v8WorkerPlugins": "gcanvas_runtime",
    "v8Worker": 1,
    "enableSkia": "true"
  }
}
```

3. 在需要添加互动的 axml 页面里加入 canvas 标签

```html
<canvas onReady="onCanvasReady" id="canvas" type="webgl" />
```

使用 `onReady` 配置 `canvas` 初始化回调。需要设置 `canvas` 的 id，后面会用到。

4. 在页面的 `.js` 代码文件里添加回调函数，使用 `my._createCanvas` 创建所需的 canvas 上下文，之后在 `success` 回调里使用 galacean 即可.

注意：

1. 使用 `import * as GALACEAN from "@galacean/engine/dist/miniprogram"` 引入小程序依赖。
2. 需要使用『@galacean/engine-miniprogram-adapter』里的 `registerCanvas` 注册 `canvas`。

详情可以参考下面代码：

```js
import * as GALACEAN from "@galacean/engine/dist/miniprogram";
import { registerCanvas } from "@galacean/engine-miniprogram-adapter";

Page({
  onCanvasReady() {
		my._createCanvas({
			id: "canvas",
			success: (canvas) => {
        // 注册 canvas
				registerCanvas(canvas);
        // 适配 canvas 大小
        const info = my.getSystemInfoSync();
        const { windowWidth, windowHeight, pixelRatio, titleBarHeight } = info;
        canvas.width = windowWidth * pixelRatio;
        canvas.height = (windowHeight - titleBarHeight) * pixelRatio;

        // 创建引擎
        const engine = new GALACEAN.WebGLEngine(canvas);
        // 剩余代码和 Galacean Web 版本一致
        ...
			},
		});
	}
})
```
