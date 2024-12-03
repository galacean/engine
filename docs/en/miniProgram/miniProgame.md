---
order: 0
title: MiniProgram Project
type: MiniProgram
label: MiniProgram
---

Currently, Galacean has been adapted to Alipay and Taobao Mini Programs. This tutorial assumes that developers already have some Mini Program development skills. If not, please read the following tutorials, download the Mini Program development tools, and apply for an AppId:

- [Alipay Mini Program](https://opendocs.alipay.com/mini/developer)
- [Taobao Mini Program](https://miniapp.open.taobao.com/docV3.htm?docId=119114&docType=1&tag=dev)

Mini Program project release:

- [Alipay Mini Program Release](https://opendocs.alipay.com/mini/introduce/release)
- [Taobao Mini Program Release](https://developer.alibaba.com/docs/doc.htm?spm=a219a.7629140.0.0.258775fexQgSFj&treeId=635&articleId=117321&docType=1)

## Project Export

The feature to export Alipay Mini Programs from the Galacean editor is still under development, and the interaction methods and template projects may change in the future.

<img src="https://mdn.alipayobjects.com/rms/afts/img/A*ZIXuR7Bj5gEAAAAAAAAAAAAAARQnAQ/original/image-20231008163057689.png" alt="image-20231008163057689" style="zoom:50%;" />

## Project Startup

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

Opening it with the Mini Program IDE, you can see:

![image-20230420111035524](https://mdn.alipayobjects.com/rms/afts/img/A*kEUkTbfSMIwAAAAAAAAAAAAAARQnAQ/original/image-20230420111035524.png)

## Local Resource Handling

### Ant Group Internal Users

Directly use "Upload to CDN" (in the export panel options, refer to the image above), using the default CDN of the group. If you want to use a custom CDN, refer to the instructions for non-Ant Group internal users.

### Non-Ant Group Internal Users

1. Upload the public files to the CDN yourself.
2. Modify the scene.json file or configure the baseUrl.

## In-Package File Loading (WIP)

Currently, local file loading for Mini Programs is not supported.

## Known Issues

- Mini Programs do not support WebAssembly, so PhysX cannot be used as the physics backend.
- Local file loading is not supported yet, and files need to be manually uploaded to the CDN.

## Additional Notes

### Using OrbitControl in Mini Program Projects

1. Import the library

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

3. Simulate event dispatch

Since Mini Programs do not support `addEventListener` for adding event listeners, you need to manually add event simulation. Additionally, there is a bug with multi-touch on the Mini Program canvas, so add a view layer of the same size and position as the canvas to dispatch touch events:

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

### Creating a Galacean Mini Program Project with Pro Code

> Requires Node.js version >=12.0.0.

Using yarn to create

```bash
yarn create @galacean/galacean-app --template miniprogram
```

Using npm **6.x** version to create

```
npm init @galacean/galacean-app --template miniprogram
```

Using npm **7.x** version to create

```she
npm init @galacean/galacean-app -- --template miniprogram
```

**Follow the prompts** to complete the subsequent steps, then you can use the mini program development tool to open the project:

![image-20210609164550721](https://gw.alipayobjects.com/zos/OasisHub/3e2df40f-6ccd-4442-85f8-69233d04b3b5/image-20210609164550721.png)

Select the corresponding directory, and if everything goes well, you should see:

![image-20210609164816776](https://gw.alipayobjects.com/zos/OasisHub/04386e9c-b882-41f7-8aa6-a1bf990d578b/image-20210609164816776.png)

### Using Galacean in an existing Pro code project

This tutorial assumes you already have some development skills. If you are not familiar with mini program development, please read the [mini program development documentation](https://opendocs.alipay.com/mini/developer) in detail.

1. Open `Terminal` in the project directory and install dependencies:

```bash
# 使用 npm
npm install @galacean/engine --save
npm install @galacean/engine-miniprogram-adapter --save
# 使用 yarn
yarn add @galacean/engine
yarn add @galacean/engine-miniprogram-adapter
```

2. Add the following configuration items to the mini program project configuration file `app.json`:

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

3. Add a canvas tag to the axml page where you want to add interaction:

```html
<canvas onReady="onCanvasReady" id="canvas" type="webgl" />
```

Use the `onReady` configuration to set up the `canvas` initialization callback. You need to set the `canvas` id, which will be used later.

4. Add a callback function in the `.js` code file of the page, use `my._createCanvas` to create the required canvas context, and then use galacean in the `success` callback.

Note:

1. Use `import * as GALACEAN from "@galacean/engine/dist/miniprogram"` to import mini program dependencies.
2. You need to use `registerCanvas` from '@galacean/engine-miniprogram-adapter' to register the `canvas`.

For details, you can refer to the following code:

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
```
