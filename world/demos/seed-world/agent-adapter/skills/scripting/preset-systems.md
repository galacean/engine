# 在 Script 资产中使用预置系统

编写游戏 Script 资产时读这份文档。execute 中使用 Editor 接口和异步组件代理，不使用这里的内容。

Script 资产运行在 Engine 线程。下面的导入就是 Scene 加载使用的原生组件类。不要在 Script 回调中运行无界循环或大量计算。

从 `@galacean/seed-world-systems` 导入 `FarmingSystem`、`FarmingAreaComponent`、`FarmingAPI`、`Building`、`BuildingManager`、`BuildingGroupComponent`、`BuildingPartComponent` 和 `buildingDraftSource`。[运行时入口](declare/engine/node_modules/@galacean/seed-world-systems/index.d.ts)及其相对导入是从运行源码生成的声明。Scene 加载和 Script 导入共用这些原生类。

## 查找已有组件

使用普通的 Engine Entity/Scene 访问方式。

- `entity.getComponent(FarmingSystem)` 只查找该 Entity，不搜索整个 Scene。
- 查找其他位置的管理器时，在 Scene 根 Entity 上使用 `getComponentsIncludeChildren`。
- Scene 重新加载或组件被替换后，重新查询，不要保留已销毁的组件引用。

```ts
import { Script } from "@galacean/engine";
import { FarmingSystem, FarmingAPI } from "@galacean/seed-world-systems";

export default class FarmStatus extends Script {
  async inspectFarm() {
    const systems: FarmingSystem[] = [];
    for (const root of this.entity.scene.rootEntities) {
      systems.push(...root.getComponentsIncludeChildren(FarmingSystem, []));
    }
    const system = systems.find(item => !item.destroyed && !item.isDisposed);
    if (!system) return;
    const result = await new FarmingAPI(system).execute({operation: "list", input: {}});
    if (!result.ok) throw new Error(result.error.message);
    for (const farm of result.value) console.log(farm.farmId, farm.initialized, farm.cropCount);
  }
}
```

## 农场

`new FarmingAPI(system).execute({operation, input, options?})` 提供原生农场接口使用的带类型操作。各操作的参数和结果见入口导入的 `FarmingAPIContract.d.ts`。

- 检查 `result.ok`，失败时处理 `result.error`。
- 农场区域可能在 Script 的 `onAwake` 之后才初始化。发送命令前，先查看 `list` 或诊断信息中的 `initialized`。
- 种植、浇水、收获、持久道具和篮子、库存操作都优先用这个接口，这样校验、回执和持久化都留在系统内。
- 不要改写原始快照，也不要调用 `configureRuntime` 或 `dispose` 来操作农场。

## 状态归属

状态属于各系统配置的资产。组件属性通过正常的 Editor 序列化选择虚拟路径资产。玩法方法通过系统已有的会话修改领域状态。

要写入持久的 Scene 绑定或 Script 组件，使用 [Editor 接口](declare/editor/native/api.d.ts)。修改任意运行时对象属性本身不会形成已保存的 Scene 编辑。

## 建筑

在 Script 中创建和读取建筑见[建筑的运行时用法](skills/building/references/foundation.md)。在 execute 中创建持久建筑见 [building](skills/building/SKILL.md)。
