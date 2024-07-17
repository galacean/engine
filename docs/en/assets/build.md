---
order: 2
title: Exporting Projects
type: Asset Workflow
label: Resource
---

## HTML5 Project

The Galacean Editor project export feature allows you to download the current editor project as a frontend project to your local machine. You can configure export parameters in the editor, such as asset export settings, rendering export settings, physics export settings, etc. Based on these configurations, the editor will generate the necessary code, assets, create the corresponding `package.json`, and finally package it into a zip file for you to download.

### Export Settings

#### Asset Export Settings

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*h5VhR56vjZcAAAAAAAAAAAAADhuCAQ/original" alt="image-20231007201437362" style="zoom:50%;" />

Asset export settings can be used to control parameters such as resource types and quality for export. In asset export settings, you can choose the types of resources to export, such as models, textures, HDR, etc., and select parameters like export quality and format for each type. When exporting models, you can choose whether to export mesh information, skeleton information, animation information, etc.

| Configuration  | Description                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| glTF Quantize  | glTF compression algorithm, see [here](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md) |
| glTF Meshopt   | glTF compression algorithm, see [here](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md) |
| Texture Type   | Check [KTX2](https://www.khronos.org/ktx/) to enable [texture compression](/en/docs/graphics-texture-compression) optimization options |
| Texture Format | Visible after checking [KTX2](https://www.khronos.org/ktx/), different compression formats will affect texture size and rendering quality |
| Texture Quality| Visible after checking [KTX2](https://www.khronos.org/ktx/), can adjust texture size and rendering quality to some extent |
| Main Scene     | Choose a scene from the **[Asset Panel](/en/docs/assets-interface)** to be the main scene when the project is loaded |

#### Rendering Export Settings

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*WZHzRYIpUzQAAAAAAAAAAAAADhuCAQ/original" style="zoom:50%;" />

Rendering export settings can be used to control parameters related to the project's rendering effects and performance.

| Configuration                                                                                         | Description                                                                 |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------|
| WebGL Mode                                                                                            | WebGL version, `Auto` means automatically select WebGL version based on device capabilities |
| WebGL [Context](https://developer.mozilla.org/en-US/en/docs/Web/API/HTMLCanvasElement/getContext) settings | Anti-Alias, Alpha, Preserve Drawing Buffer, etc.                           |
| Device Pixel Ratio                                                                                    | [Device pixel ratio](/en/docs/core-canvas) used to control canvas size        |

### Project Start

After clicking the download button in the export panel, you will receive a compressed package of the project. After decompression and entering the folder, the directory structure (using React project as an example) is as follows:

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

### Project Debug

Next, you can debug and preview the project locally. Run the following commands in the terminal in the folder directory one by one to see if the local effect matches the effect in the editor:

```bash
npm install
npm run dev
```

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*jTKVR4LYseUAAAAAAAAAAAAADhuCAQ/original" alt="image-20231008163057689" style="zoom:50%;" />

### Project Build and Deployment

After all preparations are done, it's time to build and deploy the project. Run the following command in the terminal in the folder directory:

```bash
npm run build
```

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*PXRURowEHRQAAAAAAAAAAAAADhuCAQ/original" alt="image-20231008163057689" style="zoom:50%;" />

You will notice that after the `build` is completed, a `dist` folder is added to the file directory (top left corner), which contains all the necessary code and resources for running. Next, you just need to upload all the contents of this folder to a CDN.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*R9MEQahvjkUAAAAAAAAAAAAADhuCAQ/original" alt="image-20231008163057689" style="zoom:50%;" />

Then visit the corresponding address:

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Z4X6TKcFDaIAAAAAAAAAAAAADhuCAQ/original" alt="image-20231008163057689" style="zoom:50%;" />

> Export the project as a Vite project. For more deployment solutions, refer to the [Vite official website](https://vitejs.dev/guide/)

## Mini Program Project

Currently, Galacean has been adapted to Alipay and Taobao Mini Programs. This tutorial assumes that developers already have a certain level of Mini Program development skills. If not, please read the following tutorials and download the Mini Program development tools and apply for an AppId:

- [Alipay Mini Program](https://opendocs.alipay.com/mini/developer)
- [Taobao Mini Program](https://miniapp.open.taobao.com/docV3.htm?docId=119114&docType=1&tag=dev)

Mini Program Project Publishing:

- [Alipay Mini Program Publishing](https://opendocs.alipay.com/mini/introduce/release)
- [Taobao Mini Program Publishing](https://developer.alibaba.com/en/docs/doc.htm?spm=a219a.7629140.0.0.258775fexQgSFj&treeId=635&articleId=117321&docType=1)

### Project Export

The export feature of Galacean editor for Alipay Mini Program is still under development, and the interaction method and template project may change in the future.

<img src="https://mdn.alipayobjects.com/rms/afts/img/A*ZIXuR7Bj5gEAAAAAAAAAAAAAARQnAQ/original/image-20231008163057689.png" alt="image-20231008163057689" style="zoom:50%;" />

### Project Start

After clicking download, a zip file will be downloaded. The directory structure after unzipping is as follows:

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

Next, you can install dependencies and start the project:

```shell
npm install
npm run dev
```

When opened in the Mini Program IDE, you will see:

![image-20230420111035524](https://mdn.alipayobjects.com/rms/afts/img/A*kEUkTbfSMIwAAAAAAAAAAAAAARQnAQ/original/image-20230420111035524.png)

### Local Resource Handling {/examples}

#### Ant Group Internal Users {/examples}

Simply use 'Upload to CDN' (refer to the export panel options in the figure above) and use the default CDN of the group. If you want to use a custom CDN, refer to Non-Ant Group Internal Users.

#### Non-Ant Group Internal Users {/examples}

1. Upload public files to CDN by yourself.
2. Modify the scene.json file or configure the baseUrl.

### Package File Loading (WIP) {/examples}

Currently, local file loading for mini-programs is not supported.

### Known Issues {/examples}

- Mini-programs do not support WebAssembly, so PhysX cannot be used as a physics backend at the moment.
- Local file loading is not supported currently; files need to be manually uploaded to CDN.

## Notes

When using the editor project export feature, you need to consider the following:

1. The exported project needs to run in an environment that supports WebGL.
2. The exported project may contain a large number of resource files, so you need to optimize and compress the project to improve performance and loading speed.
3. The exported project may contain sensitive information and data, so you need to assess and protect the security of the project to prevent information leakage and data loss.

---

## Supplementary Information for Mini-Programs {/examples}

### Using OrbitControl in Mini-Program Projects

1. Import the third-party library

```bash
npm install @galacean/engine-toolkit-controls -S
```

```typescript
import { OrbitControl } from "@galacean/engine-toolkit-controls/dist/miniprogram";
```

2. Add the component

The `OrbitControl` component needs to be added to the camera node.

```typescript
cameraEntity.addComponent(OrbitControl);
```

3. Event Simulation Dispatch

Since mini-programs do not support adding event listeners with `addEventListener`, you need to manually add event simulation. Also, there is a bug in multi-touch on the canvas of mini-programs, so add a view layer with the same size and position as the canvas to dispatch touch events:

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

### Creating Galacean Mini-Program Projects with Pro Code

> Requires Node.js version >=12.0.0.

Create using yarn

```bash
yarn create @galacean/galacean-app --template miniprogram
```

Create using npm **6.x** version

```
npm init @galacean/galacean-app --template miniprogram
```

Create using npm **7.x** version

```she
npm init @galacean/galacean-app -- --template miniprogram
```

After completing the subsequent steps as prompted, you can open the project using the mini-program development tool:

![image-20210609164550721](https://gw.alipayobjects.com/zos/OasisHub/3e2df40f-6ccd-4442-85f8-69233d04b3b5/image-20210609164550721.png)

Select the corresponding directory, and if everything goes smoothly, you should see:

![image-20210609164816776](https://gw.alipayobjects.com/zos/OasisHub/04386e9c-b882-41f7-8aa6-a1bf990d578b/image-20210609164816776.png)

### Using Galacean in Existing Projects with Pro Code

This tutorial assumes you already have some development skills. If you are not familiar with mini-program development, please read the [mini-program development documentation](https://opendocs.alipay.com/mini/developer) in detail.

1. Open the `Terminal` in the project directory and install dependencies:

```bash
# 使用 npm
npm install @galacean/engine --save
npm install @galacean/engine-miniprogram-adapter --save
# 使用 yarn
yarn add @galacean/engine
yarn add @galacean/engine-miniprogram-adapter
```

2. Add the following configuration in the app.json file of the mini-program project:

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

3. Add a canvas tag to the axml page where interaction is needed

```html
<canvas onReady="onCanvasReady" id="canvas" type="webgl" />
```

Configure the `onReady` to initialize the `canvas`. Set the id of the `canvas` for later use.

4. Add a callback function in the `.js` code file of the page, use `my._createCanvas` to create the required canvas context, and then you can use galacean in the `success` callback.

Note:

1. Import the small program dependency using `import * as GALACEAN from "@galacean/engine/dist/miniprogram"`.
2. Need to use `registerCanvas` from '@galacean/engine-miniprogram-adapter' to register the `canvas`.

For more details, refer to the code below:

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
