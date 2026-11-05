---
name: galacean-editor
description: 导入外部资产、复用 Prefab，或组合节点、组件与 Script 构建可保存的场景内容时使用。
---

# 场景内容组合

本 Skill 说明资产导入、复用和场景组合流程。下表列出各环节的参考资料，选择当前缺少的信息即可。

## 按任务读取

| 当前任务 | 文档 |
| --- | --- |
| 寻找素材、导入、绑定资源、模型摆放与 Prefab 复用 | [资产与可复用层级](../editor/knowledge/native/assets-and-reuse.md) |
| 配置节点、组件，处理草稿提交、撤销与引用 | [原生编辑知识](../editor/knowledge/native/README.md) |
| 资产、节点与组件的通用编辑接口 | [原生编辑 API](../editor/declare/native/api.d.ts) |
| Scene/Prefab 的引用与属性格式 | [场景数据声明](../editor/declare/native/source.d.ts) |
| 编写 Script 的生命周期与运行时行为 | [运行时开发](../engine/knowledge/README.md) |
| 通过组件或 JSON 声明 Script 所需资源 | [配置资产](../engine/knowledge/configured-assets.md) |

## 组合与验证

- 需要定位场景或资产时，通过 project.json 和相关查询获取虚拟路径与身份。
- 输入已确定且不需要模型根据中间结果作选择时，在同一次 execute 草稿中配置相互依赖的节点、组件和资源。事务与失败处理遵循 execute 的契约。
- 外部素材先导入项目，再使用返回的项目路径绑定资源。资源与使用它的场景实例分别管理。
- 验证资产使用效果时，遵循[资产指南](../editor/knowledge/native/assets-and-reuse.md)中的证据边界。
