---
order: 0
title: 概述
type: 基础知识
label: Basics
---

**Galacean Engine** 是一套 Web 为先、移动优先、开源共建的实时互动解决方案，采用组件化架构与 [Typescript](https://www.typescriptlang.org/) 编写。它包含了[渲染](/docs/graphics-renderer)、[物理](/docs/physics-overall)、[动画](/docs/animation-system)和[交互](/docs/input)功能，并提供了具备完善工作流的可视化在线编辑器，帮助你在浏览器上创作绚丽的 2D/3D 互动应用。它主要由两部分组成：

- 编辑器：一个在线 Web 互动创作平台 [Editor](https://galacean.antgroup.com/editor)
- 运行时：一个 Web 为先、移动优先的高性能的互动运行时 [Runtime](https://github.com/galacean/runtime)，一系列非核心功能和偏业务逻辑定制功能 [Toolkit](https://github.com/galacean/runtime-toolkit)

## 编辑器

[Galacean Editor](https://antg.antgroup.com/editor) 是一个在线 Web 互动创作平台。它可以帮助你快速的创建、编辑和导出一个互动项目。你可以通过 Galacean Editor 快速上传互动资产，创建和编辑材质、调整灯光、创建实体，从而创造出复杂的场景。

使用编辑器创建互动项目的整体流程：

```mermaid
flowchart LR
   创建项目 --> 创建资产 --> 搭建场景 --> 编写脚本 --> 导出
```

通过编辑器可以让技术与美术同学更好地进行协作，你可以在[编辑器首页](https://galacean.antgroup.com/editor)通过项目模板快速开始第一个项目的开发。

## 运行时

核心功能由 [Galacean Runtime](https://www.npmjs.com/package/@galacean/runtime) 提供，非核心和偏业务逻辑定制的高级功能由 [Galacean Toolkit](https://github.com/galacean/runtime-toolkit) 提供。你可以通过浏览器在线浏览引擎的各种[示例](https://antg.antgroup.com/#/examples/latest/background)。

### 核心包

包括以下子包：

| 功能                                                                                           | 解释                   | API                        |
| :--------------------------------------------------------------------------------------------- | :--------------------- | -------------------------- |
| [@galacean/engine](https://www.npmjs.com/package/@galacean/engine)                             | 核心架构逻辑和核心功能 | [API](${api}core)          |
| [@galacean/engine-physics-lite](https://www.npmjs.com/package/@galacean/engine-physics-lite)   | 轻量级物理引擎         | [API](${api}physics-lite)  |
| [@galacean/engine-physics-physx](https://www.npmjs.com/package/@galacean/engine-physics-physx) | 全功能物理引擎         | [API](${api}physics-physx) |
| [@galacean/engine-draco](https://www.npmjs.com/package/@galacean/engine-draco)                 | Draco 模型压缩         | [API](${api}draco)         |

你可以通过 [NPM](https://docs.npmjs.com/) 的方式进行安装：

```bash
npm install --save @galacean/engine
```

然后在业务中引入使用：

```typescript
import { WebGLEngine, Camera } from "@galacean/engine";
```

如果你只是想在本地快速完成一个 Demo， 推荐你使用 [create-galacean-app](https://github.com/galacean/create-galacean-app)， 它提供了一些常用的框架如 [React](https://reactjs.org/)、[Vue](https://vuejs.org/) 等模板。

### 工具包

非核心功能和偏业务逻辑定制功能由 galacean-toolkit 包提供（完成功能列表请查看[engine-toolkit](https://github.com/galacean/engine-toolkit/tree/main)）：

| 功能                                                                                                                     | 解释         | API                                    |
| :----------------------------------------------------------------------------------------------------------------------- | :----------- | :------------------------------------- |
| [@galacean/engine-toolkit-controls](https://www.npmjs.com/package/@galacean/engine-toolkit-controls)                     | 控制器       | [Doc](/docs/graphics-camera-control)  |
| [@galacean/engine-toolkit-framebuffer-picker](https://www.npmjs.com/package/@galacean/engine-toolkit-framebuffer-picker) | 帧缓冲拾取   | [Doc](/docs/input-framebuffer-picker) |
| [@galacean/engine-toolkit-stats](https://www.npmjs.com/package/@galacean/engine-toolkit-stats)                           | 引擎统计面板 | [Doc](/docs/performance-stats)        |
| ......                                                                                                                   |              |                                        |

你可以通过 [NPM](https://docs.npmjs.com/) 的方式进行安装：

```bash
npm install --save @galacean/engine-toolkit-controls
```

然后在业务中引入使用：

```typescript
import { OrbitControl } from " @galacean/engine-toolkit-controls";
```

> 在同一项目中，请保证引擎核心包的版本一致和工具包的大版本保持一致，以 1.0.x 版本的引擎为例，需要配套使用 1.0.y 版本的工具包。

另外还有一些二方生态包，引入和使用方式和引擎工具包相同：

| 功能                                                                             | 解释        | API                             |
| :------------------------------------------------------------------------------- | :---------- | :------------------------------ |
| [@galacean/engine-spine](https://www.npmjs.com/package/@galacean/engine-spine)   | Spine 动画  | [Doc](/docs/graphics-2d-spine) |
| [@galacean/engine-lottie](https://www.npmjs.com/package/@galacean/engine-lottie) | Lottie 动画 | [Doc](/docs/graphics-lottie)   |

### 兼容性

可以在支持 WebGL 的环境下运行，到目前为止，所有主流的移动端浏览器与桌面浏览器都支持这一标准。可以在 [CanIUse](https://caniuse.com/?search=webgl) 上检测运行环境的兼容性。

此外，**Galacean Runtime** 还支持在[支付宝/淘宝小程序](/docs/assets-build)中运行，同时也有开发者在社区贡献了[微信小程序/游戏的适配方案](https://github.com/deepkolos/platformize)。对于一些需要额外考虑兼容性的功能模块，当前的适配方案如下：

| 模块                            | 兼容考虑                                                 | 具体文档                                                                                |
| :------------------------------ | :------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| [鼠标与触控](/docs/input)      | [PointerEvent](https://caniuse.com/?search=PointerEvent) | 兼容请参照 [polyfill-pointer-event](https://github.com/galacean/polyfill-pointer-event) |
| [PhysX](/docs/physics-overall) | [WebAssembly](https://caniuse.com/?search=wasm)          | 运行环境需支持 WebAssembly                                                              |

### 版本管理

以 `@galacean/engine` 为例，你可以在 [Github](https://github.com/galacean/engine/releases) 或 [NPM](https://www.npmjs.com/package/@galacean/engine?activeTab=versions) 上查看所有可用版本，其中：

- **alpha**：内部测试版，用于早期功能研发，有里程碑内的新功能但稳定性较差，例如 [1.0.0-alpha.6](https://www.npmjs.com/package/@galacean/engine/v/1.0.0-alpha.6)
- **beta**: 公开测试版，内部测试已基本完毕，稳定性较强，但可能仍有较少的问题与缺陷，例如 [1.0.0-beta.8](https://www.npmjs.com/package/@galacean/engine/v/1.0.0-beta.8)
- **stable**：正式稳定版，经过长期测试和验证，无重大缺陷，可投入生产的推荐版本，例如 [0.9.8](https://www.npmjs.com/package/@galacean/engine/v/0.9.8)

每个里程碑版本更新迭代时会同步发布[版本升级引导](https://github.com/galacean/engine/wiki/Migration-Guide)，其中包含了本次更新的内容以及 BreakChange，可依据此文档进行版本的更新迭代。

如果您的项目正在使用旧版本的 Oasis 进行开发，并且希望升级为 Galacean，可以参考 [@crazylxr](https://github.com/crazylxr) 提供的 [galacean-codemod](https://github.com/crazylxr/galacean-codemod) 工具。

## 开源共建

**Galacean** 渴望与你共建互动引擎，所有的开发流程，包括[规划](https://github.com/galacean/engine/projects?query=is%3Aopen)，[里程碑](https://github.com/galacean/engine/milestones)，[架构设计](https://github.com/galacean/engine/wiki/Physical-system-design)在内的信息，全部都公开在 GitHub 的项目管理中，你可以通过[创建 issue](https://docs.github.com/zh/issues/tracking-your-work-with-issues/creating-an-issue) 与[提交 PR](https://docs.github.com/zh/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork) 参与到引擎的建设当中。如果你有疑问或者需要帮助，可以加入钉钉群或[讨论区](https://github.com/orgs/galacean/discussions)寻求帮助。
