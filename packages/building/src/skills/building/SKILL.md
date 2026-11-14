---
name: building
description: 生成或修改建筑，处理构件连接与开口、铺设 Unit 或检查建筑渲染时使用。
---

# 建筑

已有建筑由独立的 `BuildingGroupComponent` 和 `BuildingPartComponent` 作者组件组成。生成的网格是运行时输出，不要保存成第二份作者定义。

先看代码运行在哪里。两种环境的接口不同。

## 在 execute 中（Agent 持久编辑）

execute 不能导入游戏 Script 模块，也不能调用运行时方法。

- **新建：** 用 [tools.building.generate](declare/editor/world/tools/building.generate.d.ts) 生成，把结果的 `content` 交给 `editor.asset.create` 保存为 Prefab，再用 `editor.entity.create` 实例化。完整示例和 roof 参数见[流程](references/planning.md)，读完可以直接动手。不要为一次建造安装临时生成 Script，也不要从零手写生成器已有的构件参数。
- **修改已有建筑：** 通过 Editor API 查看和编辑原生 Source，保留目标实例的 frame 和引用。
- **检查结果：** 提交后，用运行时查询读取场景 BuildingManager 的 `buildStatus`，方法见[流程](references/planning.md)。

## 在游戏 Script 中

接口从 `@galacean/seed-world-systems` 导入，真实签名见[声明入口](declare/engine/node_modules/@galacean/seed-world-systems/index.d.ts)。Script 中的修改只在运行时生效，持久化编辑走 Scene/Prefab 事务。用法见[运行时用法](references/foundation.md)。

## 基本概念

流程是：风格生成 → 草稿（组、构件、连接）→ 核心层设计（几何、连接规则、铺设）→ 渲染。

- 欧式入口有 `Building.European.buildHouses/buildTower/buildWall/buildFence/buildSteps`。`buildHouses` 支持参数数组。不必手写已有房屋的砖瓦参数。
- 生成器返回草稿 `BuildingDraft {groups, parts, connections}`，是纯 JSON。每个构件对应一个 `BuildingPartComponent`。构件写明几何生成器、铺设算法和 Unit，都用注册名。
- 连接分两种：`attach`（一个构件依附一个或多个宿主，例如窗依附墙）和 `join`（两个构件对等相接）。规则由构件类型对决定，草稿里不写规则函数。
- 门、窗、灯、老虎窗、活板门是资产库中的建筑预制件，按“类型/规格”引用。洞口由预制件的占位形状算出，不要另存洞口。
- 新架构不支持的功能会报错 `... is not available in the building system yet`，不要绕过。
- 视觉复刻必须对照相同参数、相机和光照下的真实渲染。房屋没变不等于像素一致。

## 按任务读取

| 工作 | 说明 |
| --- | --- |
| 生成入口、持久创建、检查发布 | [流程](references/planning.md) |
| Script 中的组件、引用和生命周期 | [运行时用法](references/foundation.md) |
| 围墙、栅栏、台阶和自定义构件 | [结构](references/structure.md) |
| 屋面、老虎窗和屋顶挂件 | [屋顶](references/roof.md) |
| 开窗和墙体 | [墙](references/wall.md) |
| 连接与验收 | [连接](references/connections.md) |
