---
name: scripting
description: 需要自定义运行时行为、编写或修改 Script 资产、在游戏中加载资源时使用。
---

# Script 资产

Script 在游戏中运行，execute 在 Worker 中运行。两者的接口不同：Script 资产调用 Engine 方法，execute 调用 declare/editor/ 中声明的方法。

## 编写与挂载

要添加行为，先用 `editor.asset.create` 创建 `script` 资产（默认导出 `Script` 子类），再用 `editor.component.add` 挂载 Script 组件（`script: { $ref: scriptVirtualPath }`）。这两步可放在同一次 `execute` 中完成；查询目标节点和写入也可以合并执行，减少多余往返。

- 编辑器创建/修改/挂载脚本接口：[原生编辑 API](declare/editor/native/api.d.ts)（所有列表/查询返回 `{ items }`）。
- 运行时 `Script` 基类声明：[Script.d.ts](declare/engine/node_modules/@galacean/engine-core/types/Script.d.ts)（`declare/engine/` 不自动内联依赖，需要 `Transform`、`Entity` 等类型时按路径按需读取，无需用 `glob` 全量扫描 `declare/`）。
- Script 用 ESM 从 `@galacean/engine` 或其他脚本资产的相对路径导入，支持顶层 await。
- 动态 import 的目标必须是能在项目中解析的字符串字面量；`import.meta.url` 是生成模块的 Blob URL，不是虚拟资产路径。
- Script 生命周期方法在游戏中运行；`execute` 在 Worker 中运行，只能访问声明的工具。

修改 Script 代码或它导入的模块时，受影响的 Script 组件会用已保存的属性重建，瞬时实例字段会重置。无关编辑不会改变未变化的模块和组件。

## 完成判定

`execute` 返回 `committed` 且无编译错误和 `runtimeErrors` 即表示脚本已编译生效并挂载完成，可直接汇报结果；不要再额外读取 `tools.runtime.*` 声明或二次排查。

## 相关

- 可用模块与 Engine 声明：[运行时模块](skills/scripting/references/runtime-modules.md)
- 组件或 JSON 声明 Script 所需资源：[配置资产](skills/scripting/references/configured-assets.md)
- 编辑如何生效：[草稿与提交](skills/scene-nodes/references/draft-and-commit.md)
- 生命周期、物理、渲染等运行时语义：[engine-knowledge](skills/engine-knowledge/SKILL.md)
