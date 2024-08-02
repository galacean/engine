---
order: 0
title: XR 总览
type: XR
label: XR
---

`XR` 是一个通用术语，用于描述扩展现实 `Extended Reality`的概念，它包含虚拟现实（Virtual Reality，VR）、增强现实（Augmented Reality，AR）、混合现实（Mixed Reality，MR）等。

## 架构

Galacean 对 XR 做了干净灵活的设计：

- 干净：不需 XR 能力时，包体不含任何 XR 逻辑，大小也不会增加分毫
- 灵活：可插拔的功能，让开发更简单
- 面向未来：多后端设计，后续可适配不同平台不同接口

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*_lUbQblVmQYAAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

## 模块管理

| 包 | 解释 | 相关文档 |
| :-- | :-- | --- |
| [@galacean/engine-xr](https://www.npmjs.com/package/@galacean/engine-xr) | 核心架构逻辑 | [API](/apis/galacean) |
| [@galacean/engine-web-xr](https://www.npmjs.com/package/@galacean/engine-web-xr) | 后端包 | [Doc](/docs/physics/overall) |
| [@galacean/engine-toolkit-xr](https://www.npmjs.com/package/@galacean/engine-toolkit-xr) | 高级工具组件 | [Doc](/docs/xr/toolkit) |

> `@galacean/engine-xr` 和 `@galacean/engine-web-xr`是实现 **WebXR** 必须引入的依赖，相较于上述两个包，`@galacean/engine-toolkit-xr` 则不是必须的，但它的存在可以让编辑器开发 XR 变得更加简单。

> XR 包之间的依赖规则遵守[版本依赖规则](/docs/quick-start/version/#版本依赖)，即 `@galacean/engine-xr` 和 `@galacean/engine-web-xr` 的版本需与 `@galacean/engine` 保持一致，`@galacean/engine-toolkit-xr` 的大版本需要与 `@galacean/engine` 保持一致。

## 快速上手

在本章节，您可以：

- 无需任何专业知识，即可快速[开发 XR 互动](/docs/xr/quickStart/develop)与[调试 XR 互动](/docs/xr/quickStart/debug)
- 若希望深度了解 Galacean XR ，可参考 [XR 核心逻辑](/docs/xr/system/manager)
- 最后，通过了解[XR 兼容性](/docs/xr/compatibility)可以整体把控项目风险
