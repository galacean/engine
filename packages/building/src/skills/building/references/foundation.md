# 运行时用法

这份文档写给游戏 Script。execute 中不能调用这些方法，见[流程](planning.md)。

## 原生对象

`BuildingPartComponent` 保存一个构件的 definition 和这个构件发起的 `connections`。definition 写明类型、几何（`geometry: {generator, params}`）、铺设算法（`algorithm: {type, params}`）和 Unit。

组 Entity 上的 `BuildingGroupComponent` 独立持有组的 definition：身份、seed 和共享值（例如房屋轮廓、砖块原型）。构件用 `{"@shared": "名称"}` 引用共享值。构件不拥有组的生命周期。显式的 `frame` Entity 定义一个共享的编译组。节点层级决定分组。原生 Entity 的变换决定组的位置和朝向。

生成器和算法保存注册名，不能保存函数。

## 管理器

`BuildingManager.forScene(scene)` 复用场景管理器。场景宿主在作者 Scene 加载后调用它，一次收集已启用的构件。启用一个构件只是注册到已有管理器，所以加载建筑不会在作者 Scene 根之间插入运行时根。

- **Seed World：** 宿主已绑定相机、资产库和地形快照。增加或编辑建筑时，不要赋一个平地采样函数覆盖真实地形。
- **独立场景：** 要提供 `camera` 和资产库 `assets`。可用 `bind({camera, terrain})` 提供可传输的地形快照。显式设置 `terrain` 高度函数会选择主线程执行，并自动使相关输入失效。

## 创建与读取

新建筑用 `Building.European.buildHouses/buildTower/buildWall/buildFence/buildSteps` 生成草稿 `BuildingDraft {groups,parts,connections}`。矩形房屋的墙是每边一个构件，id 是 `<房屋 id>-wall-<边号>`；圆形房屋和木墙是一个构件，id 是 `<房屋 id>-wall`。

下面的 frame 来自本次创建的实例。读取已有实例时，使用它的 `BuildingGroupComponent.frame`，不能从同名构件猜实例。

```ts
import { Entity } from "@galacean/engine";
import { Building, BuildingManager } from "@galacean/seed-world-systems";
export async function createAndRead(parent: Entity) {
  const manager = BuildingManager.forScene(parent.scene);
  const draft = Building.European.buildHouses({ id: "house" });
  const frame = manager.create(parent, draft);
  await manager.flushAsync();
  const saved = manager.snapshot(frame);
  const wall = manager.get("house-wall-0", frame);
  return { frame, saved, wall };
}
```

- `create`、`update`、`remove` 是运行时操作。Scene/Prefab 持久化通过 Editor 事务。在 Script 中直接赋值只在运行时生效。
- 建筑作者 ID 在 frame 内唯一。同一 Prefab 可以重复实例化。不要为避免重复实例而重写资产内的构件身份。
- `manager.get(id, frame)` 和 `manager.snapshot(frame)` 读取作者定义。`manager.metrics()` 提供组数、作者构件数和驻留状态。管理器没有 `output` 或 `design` 属性。

## 失败与发布

`flushAsync()` 会拒绝生成失败的候选并抛出错误。也可以用 `manager.errors()` 检查当前错误。失败时，可见画面可能仍是上次成功的结果。

生成输出不回写作者对象，也不保存在项目中。候选失败时保留旧输出。派生构件、洞口和渲染缓冲都不保存，每次重新求解。不要把实体数或批次数说成 drawcall 数。

## 删除

`Manager.remove(entityOrBuildingComponent)` 删除作者数据。停用组件使用它的 enabled 状态。不要在生成输出下创建作者建筑。

管理器删除和 Editor 删除遵循同一规则：

- 结构轮廓构件会移除所在的组。普通构件逐个移除。
- 只在受影响的原生 frame 内清理进出连接，包括隐藏和停用的所有者。
- 修改前校验剩余的作者图。
- 删除宿主时，要更新依附它的构件和它们的连接。删除依附的构件时，同一事务会移除它发往宿主的连接。

## Unit 限制

Unit 不能包含 BuildingGroupComponent 或 BuildingPartComponent，包括已停用的组件和未激活的子节点。无效的 Unit 会在输出发布前失败。

## 重建与线程

- 只重建输入变化的 frame。frame 内的构件集合整体求解，还没有构件邻接图级的增量。
- 原位修改借用的 Mesh 或 Unit 后，调用对应的 `part.rebuild()`。替换构件定义或管理器的 terrain 函数会自动触发失效。
- Seed World 用 BuildingManager 和 BuildingRuntime 做组调度、原子发布和地形事务。设计和编译在 Worker 中运行；自定义地形函数在主线程运行。
- 只能使用已注册的几何生成器和铺设算法。Script 不能注册新的生成器、算法或连接规则。
