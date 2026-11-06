# 原生对象与生命周期

`BuildingPartComponent.definition` 保存一个基础构件，relations 保存其发出的连接，组 Entity 上的 BuildingGroupComponent 独立保存组 definition、frame 与 assetLibrary。构件不拥有组生命周期。使用原生 Mesh/Prefab/Entity 引用；算法存注册名，注册发生在消费者加载之前。

`BuildingManager.forScene(scene)` 复用场景管理器。Seed World 的宿主已经绑定相机、资产库和地形快照，增加或编辑建筑时不要再赋一个平地采样函数覆盖真实地形。独立场景需要提供 `camera` 和原生 profile 使用的 `assets`；可用 `bind({camera, terrain})` 提供可传输地形快照。显式设置 `terrain` 高度函数会选择主线程执行，并自动使相关输入失效。

create/update/remove 是运行时操作；Scene/Prefab 持久化通过 Editor 事务。`flushAsync()` 会拒绝生成失败的候选并抛出错误；也可通过 `manager.errors()` 检查当前错误。失败时可见画面可能仍是上次成功结果。`manager.metrics()` 提供组数、作者构件数和驻留状态；`manager.get(id, frame)` / `manager.snapshot(frame)` 读取作者定义。管理器没有 `output` 或 `design` 属性；需要在不发布的情况下检查连接/开口时，使用独立 `designBuilding(draft, terrain, assets)` 的返回结果。

原位修改借用的 Mesh/Unit 后调用对应 `part.rebuild()`。替换构件定义或管理器 terrain 函数会自动触发失效。

生成输出不回写作者对象，不保存在项目；候选失败保留旧输出。只重建输入变化的 frame；frame 内的构件集合整体求解，尚无构件邻接图级增量。不要把实体数或批次数声称为 drawcall 数。

建筑作者 ID 在 frame 内唯一；同一 Prefab 可重复实例化。用 `manager.get(id, frame)` 查询、`manager.snapshot(frame)` 导出目标实例。不要为避免重复实例而重写资产内的构件身份。Mesh support 必须显式引用 mesh；作者几何算法保存注册名，不能保存函数。

## Script 中按实例读取

下面的 frame 来自本次创建的实例。读取已有实例时使用其 BuildingGroupComponent.frame；不能从同名构件猜实例。

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
