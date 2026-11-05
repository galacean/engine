---
name: building-parts
description: 在 Seed World 中通过风格生成器或自定义基础构件搭建建筑，处理构件连接与开口，铺设 Unit 并检查实际渲染。
---

# 建筑基础构件

API 从 `@galacean/seed-world-systems` 导入，真实签名见 [声明入口](engine/node_modules/@galacean/seed-world-systems/index.d.ts)。在游戏 Script 中调用，持久化编辑走原生 Scene/Prefab 事务。

在 Agent 的 `execute` 中创建持久建筑，使用 `tools.building.generate` 调用同一风格生成器；`execute` 不能导入游戏 Script 模块。生成结果的 `content` 直接交给 `editor.asset.create` 保存为 Prefab，再通过 `editor.entity.create` 实例化。读取 `building.generate` API 声明及下方流程示例。不要为一次建造安装临时生成 Script，也不要从零手写生成器已有的构件参数。

当前流程：风格生成（合并 Plan/Sketch）→ 基础构件集合与关系 → Design 连接/避让 → 铺设与渲染。

- 欧式入口：`Building.European.buildHouses/buildTower/buildWall/buildFence/buildSteps`。不必手写已有房屋的砖瓦参数；buildHouses 支持参数数组。
- 自定义建筑可直接提供 `BuildingDraft`，或组合公共 buildWalls/buildRoof 等生成结果。不要把歌剧院壳体强制伪装成矩形房屋。
- 每个基础构件一个 `BuildingPartComponent`，没有递归构件配方。Unit 是原生资产库单元、Entity/Prefab 或程序化几何模板，不需要建筑身份。
- 使用 `BuildingManager.forScene(scene)` 获取场景管理器。Seed World 已绑定相机、资产与真实地形，创建建筑时复用这些设置；独立场景的设置见公共基础。`await flushAsync()` 后检查 `errors()` 和 `metrics()`，作者数据用 `get(id, frame)` / `snapshot(frame)`（frame 是目标实例的编译根节点，同名构件必须按实例查询） 读取。Agent execute 无法调用运行时方法，应通过 `runtime.component.query/read` 读取场景 BuildingManager 的 `buildStatus`：bound=true、pending=false 且 errors 为空才能说明当前生成已完成；diagnostics 记录未实施的构件原因。原始构件不接受回写的洞口/接触缓存。
- 连接关系需要明确部位。内置欧式求解器只支持自己的轮廓协议；其他曲面使用 `buildingConnectionRules.register` 实现具体规则，不能宣称所有 Mesh 自动相交收口。
- 视觉复刻必须对照相同参数、相机和光照下的真实渲染。保留旧房屋未改变不等于新流程像素复刻。

| 工作 | 说明 |
| --- | --- |
| 生成入口与阶段 | [流程](references/planning.md) |
| 组件、引用和生命周期 | [公共基础](references/foundation.md) |
| 柱列、台阶和组合资产 | [结构](references/structure.md) |
| 屋面与 Unit | [屋顶](references/roof.md) |
| 开窗和墙体 | [墙](references/wall.md) |
| 连接与验收 | [连接](references/connections.md) |
| dev/2.0 效果与范围 | [欧式建筑](references/existing-house.md) |
