# 运行时用法

这份文档写给游戏 Script。execute 中不能调用这些方法，见[流程](planning.md)。

## 原生对象

`BuildingPartComponent` 保存一个基础构件的 definition 和它发出的 relations，没有递归构件和 plan。definition 持有类型、支撑、算法、Unit 和放置参数。

组 Entity 上的 `BuildingGroupComponent` 独立持有组的 definition、身份、调色、seed、frame 和 assetLibrary。构件不拥有组的生命周期。显式的 `frame` Entity 定义一个共享的编译组。节点层级决定分组。原生 Entity 的变换决定组的位置和朝向。

使用原生 Mesh、Prefab 和 Entity 引用。算法保存注册名，不能保存函数，并且要在消费者加载前注册。Mesh support 必须显式引用 mesh。

## 管理器

`BuildingManager.forScene(scene)` 复用场景管理器。场景宿主在作者 Scene 加载后调用它，一次收集已启用的构件。启用一个构件只是注册到已有管理器，所以加载建筑不会在作者 Scene 根之间插入运行时根。

- **Seed World：** 宿主已绑定相机、资产库和地形快照。增加或编辑建筑时，不要赋一个平地采样函数覆盖真实地形。
- **独立场景：** 要提供 `camera` 和原生 profile 使用的 `assets`。可用 `bind({camera, terrain})` 提供可传输的地形快照。显式设置 `terrain` 高度函数会选择主线程执行，并自动使相关输入失效。

## 创建与读取

新建筑用 `Building.European.buildHouses/buildTower/buildWall/buildFence/buildSteps` 生成平铺的 `BuildingDraft {groups,parts,relations}`。公共的 `buildWalls/buildRoof/buildSteps` 不选择建筑风格。自定义 Mesh、Path、Point 构件可以不经过欧式生成器。

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
  const wall = manager.get("house-wall", frame);
  return { frame, saved, wall };
}
```

- `create`、`update`、`remove` 是运行时操作。Scene/Prefab 持久化通过 Editor 事务。在 Script 中直接赋值只在运行时生效。
- 建筑作者 ID 在 frame 内唯一。同一 Prefab 可以重复实例化。不要为避免重复实例而重写资产内的构件身份。
- `manager.get(id, frame)` 和 `manager.snapshot(frame)` 读取作者定义。`manager.metrics()` 提供组数、作者构件数和驻留状态。管理器没有 `output` 或 `design` 属性。
- 需要在不发布的情况下检查连接和开口时，使用独立的 `designBuilding(draft, terrain, assets)` 的返回结果。

## 失败与发布

`flushAsync()` 会拒绝生成失败的候选并抛出错误。也可以用 `manager.errors()` 检查当前错误。失败时，可见画面可能仍是上次成功的结果。

生成输出不回写作者对象，也不保存在项目中。候选失败时保留旧输出。派生的切口、放置和渲染缓冲都不保存。不要把实体数或批次数说成 drawcall 数。

## 删除

`Manager.remove(entityOrBuildingComponent)` 删除作者数据。停用组件使用它的 enabled 状态。不要在生成输出下创建作者建筑。

管理器删除和 Editor 删除遵循同一规则：

- 结构轮廓构件会移除所在的组。普通构件逐个移除。
- 只在受影响的原生 frame 内清理进出关系，包括隐藏和停用的所有者。
- 修改前校验剩余的作者图。
- 删除依赖的结构构件时，要更新它的关系和剩余几何。删除附件时，同一事务会移除它发往宿主的关系。

## Unit 限制

Unit 不能包含 BuildingGroupComponent 或 BuildingPartComponent，包括已停用的组件和未激活的子节点。无效的 Unit 会在输出发布前失败。

未知连接规则会失败。其他支撑类型要扩展 `buildingConnectionRules`。

## 重建与线程

- 只重建输入变化的 frame。frame 内的构件集合整体求解，还没有构件邻接图级的增量。
- 原位修改借用的 Mesh 或 Unit 后，调用对应的 `part.rebuild()`。替换构件定义或管理器的 terrain 函数会自动触发失效。
- Seed World 用 BuildingManager 和 BuildingRuntime 做组调度、原子发布和地形事务。可传输的 profile 构件使用 Worker 和驻留调度。原生引用的 Unit 在主线程执行，共用发布流程。
- 主线程 Unit 目前保留完整表示，不提供任意 Unit 几何的自动远景替身和结构碰撞。Point、Path、Mesh 工具接口仍可用。
- 通用算法使用 `buildingSupportAlgorithms` 和 `buildingPlacementAlgorithms`，配合原生引用和注册名。动态注册的放置和连接函数在主线程运行，只有内置实现使用 Worker。
