---
order: 2
title: Project Export
type: Asset Workflow
label: Resource
---

## HTML5 Project

The Galacean Editor project export feature allows you to download the current editor project as a frontend project to your local machine. You can configure the project export parameters in the editor, such as asset export configuration, rendering export configuration, physics export configuration, etc. Based on these configurations, the editor will generate the necessary code and assets for the project, create the corresponding `package.json`, and finally package it into a zip file for you to download.

### Export Configuration

#### Asset Export Configuration

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*h5VhR56vjZcAAAAAAAAAAAAADhuCAQ/original" alt="image-20231007201437362" style="zoom:50%;" />

The asset export configuration can be used to control the types and quality of resources to be exported. In the asset export configuration, you can select the types of resources to be exported, such as models, textures, HDR, etc., and choose the export quality and format parameters for each type. When exporting models, you can choose whether to export the model's mesh information, skeleton information, animation information, etc.

| Configuration   | Description                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| glTF Quantize   | glTF compression algorithm, see [here](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md)  |
| glTF Meshopt    | glTF compression algorithm, see [here](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md) |
| Texture Type    | Check [KTX2](https://www.khronos.org/ktx/) to enable [texture compression](/en/docs/graphics/texture/compression/) optimization options     |
| Texture Format  | Visible after checking [KTX2](https://www.khronos.org/ktx/), different compression formats will affect the texture size and rendering quality |
| Texture Quality | Visible after checking [KTX2](https://www.khronos.org/ktx/), can adjust the texture size and rendering quality to a certain extent          |
| Main Scene      | Select a scene from the **[Asset Panel](/en/docs/assets/interface)** as the main scene after the project loads                             |

#### Rendering Export Configuration

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*WZHzRYIpUzQAAAAAAAAAAAAADhuCAQ/original" style="zoom:50%;" />

The rendering export configuration can be used to control the rendering effects and performance parameters of the project.

| Configuration                                                                                              | Description                                                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| WebGL Mode                                                                                                 | The version of WebGL, `Auto` means automatically selecting the WebGL version based on device capabilities |
| WebGL [Context](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext) Configuration | Anti-Alias, Alpha, Preserve Drawing Buffer, etc.              |
| Device Pixel Ratio                                                                                         | [Device pixel ratio](/en/docs/core/canvas), used to control the canvas size |

### Project Startup

After clicking the download button in the export panel, you will get a compressed package of the project. After decompressing and entering the folder, the directory structure (taking a React project as an example) is as follows:

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

### Project Debugging

Next, you can debug and preview the project locally. Run the following commands in the Terminal in the folder directory to see if the local effect is consistent with the effect in the editor:

```bash
npm install
npm run dev
```

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*jTKVR4LYseUAAAAAAAAAAAAADhuCAQ/original" alt="image-20231008163057689" style="zoom:50%;" />

### Project Build and Deployment

Once everything is ready, build and deploy the project. Run the following commands in the Terminal in the folder directory:

```bash
npm run build
```

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*PXRURowEHRQAAAAAAAAAAAAADhuCAQ/original" alt="image-20231008163057689" style="zoom:50%;" />

You will find that after the `build` is completed, a `dist` folder appears in the file directory (top left), which contains all the code and resources needed for running. Next, you just need to upload all the contents of this folder to the CDN.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*R9MEQahvjkUAAAAAAAAAAAAADhuCAQ/original" alt="image-20231008163057689" style="zoom:50%;" />

Then visit the corresponding address:

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Z4X6TKcFDaIAAAAAAAAAAAAADhuCAQ/original" alt="image-20231008163057689" style="zoom:50%;" />

> The exported project is a vite project. For more deployment solutions, refer to [vite official website](https://vitejs.dev/guide/)

## Mini Program Project

Please refer to [Mini Program Project](/en/docs/miniProgram/miniProgame/)
