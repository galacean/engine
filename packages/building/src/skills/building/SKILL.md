---
name: building
description: 生成或修改建筑，处理构件连接与开口、铺设 Unit 或检查建筑渲染时使用。
---

# 建筑

已有建筑由独立的 `BuildingGroupComponent` 和 `BuildingPartComponent` 作者组件组成。生成的网格是运行时输出，不要保存成第二份作者定义。

先看代码运行在哪里。两种环境的接口不同。

## 在 execute 中（Agent 持久编辑）

execute 不能导入游戏 Script 模块，也不能调用运行时方法。

- **新建：** 用 [tools.building.generate](declare/editor/world/tools/building.generate.d.ts) 生成，把结果的 `content` 交给 `editor.asset.create` 保存为 Prefab，再用 `editor.entity.create` 实例化。完整示例见[流程](references/planning.md)。不要为一次建造安装临时生成 Script，也不要从零手写生成器已有的构件参数。
- **修改已有建筑：** 通过 Editor API 查看和编辑原生 Source，保留目标实例的 frame 和引用。
- **检查结果：** 提交后，用运行时查询读取场景 BuildingManager 的 `buildStatus`，方法见[流程](references/planning.md)。

## 在游戏 Script 中

接口从 `@galacean/seed-world-systems` 导入，真实签名见[声明入口](declare/engine/node_modules/@galacean/seed-world-systems/index.d.ts)。Script 中的修改只在运行时生效，持久化编辑走 Scene/Prefab 事务。用法见[运行时用法](references/foundation.md)。

## 基本概念

流程是：风格生成 → 基础构件集合与关系 → 连接和避让设计 → 铺设与渲染。

- 欧式入口有 `Building.European.buildHouses/buildTower/buildWall/buildFence/buildSteps`。`buildHouses` 支持参数数组。不必手写已有房屋的砖瓦参数。
- 自定义建筑可以直接提供 `BuildingDraft`，或组合公共的 `buildWalls`、`buildRoof` 等结果。不要把歌剧院壳体强行伪装成矩形房屋。
- 每个基础构件对应一个 `BuildingPartComponent`，没有递归构件配方。Unit 是原生资产库单元、Entity/Prefab 或程序化几何模板，不需要建筑身份。
- 连接关系要写明部位。内置欧式求解器只支持自己的轮廓协议。其他曲面用 `buildingConnectionRules.register` 实现具体规则，不能宣称所有 Mesh 都能自动相交收口。
- 视觉复刻必须对照相同参数、相机和光照下的真实渲染。房屋没变不等于像素一致。

## 按任务读取

| 工作 | 说明 |
| --- | --- |
| 生成入口、持久创建、检查发布 | [流程](references/planning.md) |
| Script 中的组件、引用和生命周期 | [运行时用法](references/foundation.md) |
| 柱列、台阶和组合资产 | [结构](references/structure.md) |
| 屋面与 Unit | [屋顶](references/roof.md) |
| 开窗和墙体 | [墙](references/wall.md) |
| 连接与验收 | [连接](references/connections.md) |
