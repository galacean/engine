---
order: 0
title: 版本管理
label: Basics
---

Galacean 有一套成熟的版本管理方案，本文将以 `@galacean/engine` 为例，介绍 Galacean 的管理工具，命名规则，发布策略及依赖管理。

## 版本管理工具

Galacean 使用的版本管理工具是 [Git](https://git-scm.com/) ，代码都托管在 [GitHub](https://github.com/galacean/) 上，并且所有的开发流程，包括[规划](https://github.com/galacean/engine/projects?query=is%3Aopen)，[里程碑](https://github.com/galacean/engine/milestones)，[架构设计](https://github.com/galacean/engine/wiki/Physical-system-design)在内的信息，全部都公开在 GitHub 的项目管理中，你可以通过[创建 issue](https://docs.github.com/zh/issues/tracking-your-work-with-issues/creating-an-issue) 与[提交 PR](https://docs.github.com/zh/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork) 参与到引擎的建设当中。

## 包管理工具

Galacean 使用的包管理工具是 [NPM](https://www.npmjs.com/) ，您可以通过 npm 指令安装 [@galacean/engine](https://www.npmjs.com/package/@galacean/engine?activeTab=versions)：

```bash
npm install --save @galacean/engine
```

然后在业务中引入使用：

```typescript
import { WebGLEngine, Camera } from "@galacean/engine";
```

## 版本命名规则与发布策略

Galacean 版本号格式是 `MAJOR.MINOR.PATCH-TAG.X` 。其中 `MAJOR.MINOR` 代表里程碑版本，通常伴随大量功能更新， `PATCH` 版本更新则表示向下兼容的错误修复，`TAG` 标签标记了该发布版本的用处。

| TAG | 释义 |
| :-- | :-- |
| **alpha** | 内部测试版，用于早期功能研发，有里程碑内的新功能但稳定性较差，例如 [1.3.0-alpha.3](https://www.npmjs.com/package/@galacean/engine/v/1.3.0-alpha.3) |
| **beta** | 公开测试版，内部测试已基本完毕，稳定性较强，但可能仍有较少的问题与缺陷，例如 [1.2.0-beta.7](https://www.npmjs.com/package/@galacean/engine/v/1.2.0-beta.7) |
| **latest** | 正式稳定版，经过长期测试和验证，无重大缺陷，可投入生产的推荐版本，例如 [1.1.3](https://www.npmjs.com/package/@galacean/engine/v/1.1.3) |
| **custom** | 内部为了测试特定功能而发布的，例如 [0.0.0-experimental-1.3-xr.9](https://www.npmjs.com/package/@galacean/engine/v/0.0.0-experimental-1.3-xr.9) |

> 在 [Github](https://github.com/galacean/engine/releases) 或 [NPM](https://www.npmjs.com/package/@galacean/engine?activeTab=versions) 上可以查看所有可用版本。

## 版本升级

每个里程碑版本更新迭代时会同步发布[版本升级引导](https://github.com/galacean/engine/wiki/Migration-Guide)，其中包含了本次更新的内容以及 BreakChange，可依据此文档进行版本的更新迭代。

## 版本依赖

| 情况 | 规则 |
| :-- | :-- |
| **核心包** | 核心包之间请保证版本一致 |
| **工具包** 依赖 **核心包** | 保证工具包版本与引擎核心包的大版本一致，以 1.3.x 版本的工具包为例，依赖 1.3.y 版本的核心包 |
| **二方包** 依赖 **核心包** | 二方生态包对引擎版本的依赖关系，请参照对应文档说明，如 [Lottie](/docs/graphics/2D/lottie/#lottie-使用版本说明) |

> 基本规则如上，若有特殊说明，请按照说明选择依赖。

## 其他

### 编辑器升级引擎版本

在 [项目设置](/docs/interface/menu/#项目设置) 中可以控制运行时的引擎版本。

### 运行时输出的版本信息

Galacean 大部分包运行时会在 `Console` 输出版本信息，

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*6UM6TZ4IVYAAAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

通常也会以此为依据判断包版本依赖是否出现：

- 版本依赖不符合规则？
- 出现了多个不同版本的同名依赖？

若出现以上问题，请排查工程并解决依赖问题。
