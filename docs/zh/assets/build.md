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
| 纹理类型      | 勾选 [KTX2](https://www.khronos.org/ktx/) 开启[纹理压缩](/docs/graphics/texture/compression/)优化选项                             |
| 纹理压缩格式  | 勾选 [KTX2](https://www.khronos.org/ktx/) 后可见，不同压缩格式会影响纹理的尺寸和渲染质量                                          |
| 纹理压缩质量  | 勾选 [KTX2](https://www.khronos.org/ktx/) 后可见，可以一定限度上调整纹理的尺寸和渲染质量                                          |
| 主场景        | 选择 **[资产面板](/docs/assets/interface)** 中的某个场景作为项目加载后的主场景                                                   |

#### 渲染导出配置

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*WZHzRYIpUzQAAAAAAAAAAAAADhuCAQ/original" style="zoom:50%;" />

渲染导出配置可以用来控制项目的渲染效果和性能等参数。

| 配置                                                                                                  | 描述                                                       |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| WebGL Mode                                                                                            | WebGL 的版本，`Auto` 值表示根据设备能力自动选择 WebGL 版本 |
| WebGL [Context](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext) 的配置 | Anti-Alias、Alpha、Preserve Drawing Buffer 等              |
| Device Pixel Ratio                                                                                    | [设备的像素比](/docs/core/canvas)，用来控制画布的尺寸     |

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

