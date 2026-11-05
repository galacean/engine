---
name: scripting
description: 需要自定义运行时行为、编写或修改 Script 资产、在游戏中加载资源时使用。
---

# Script 资产

Script 在游戏中运行，execute 在 Worker 中运行。两者的接口不同：Script 资产中调用 Engine 方法，execute 代码中调用 declare/editor/ 声明的方法。

## 编写

For behavior, create a script asset containing a default-exported Script subclass, then add a Script component with script: { $ref: scriptVirtualPath }. Scripts use ESM imports from @galacean/engine or relative paths to other script assets. Top-level await is supported. Dynamic import targets must be string literals resolvable in the project. import.meta.url is the emitted module Blob URL, not a virtual asset path. Script lifecycle methods run in the game; execute runs in a Worker and only accesses its declared tools.

Updating Script code (or an imported module) recreates affected Script components with their saved properties; transient instance fields are reset. Unchanged modules and components keep their identity during unrelated edits.

## 相关

- 可用模块与 Engine 声明：[运行时模块](skills/scripting/references/runtime-modules.md)
- 组件或 JSON 声明 Script 所需资源：[配置资产](skills/scripting/references/configured-assets.md)
- 编辑如何生效：[草稿与提交](skills/scene-nodes/references/draft-and-commit.md)
