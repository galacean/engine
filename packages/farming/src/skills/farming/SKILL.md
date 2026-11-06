---
name: farming
description: 耕种、播种、浇水、收获、管理农场道具和库存，或查询农场与作物状态时使用。
---

# 农场组件 Editor API

先读[方法索引](declare/editor/farming/methods/README.md)，按下一步操作进入对应方法的输入和返回类型。需要时再读 `declare/editor/farming/FarmingSystem.d.ts` 完整声明。read 返回 `next` 表示还有后续内容，声明还没读全。

| 任务 | 文档 |
| --- | --- |
| 各类 ID、单位、库存口径和水分规则 | [状态与单位](skills/farming/references/state-and-units.md) |
| 播种、浇水、收获、整地、道具和卸货的流程 | [操作流程](skills/farming/references/operations.md) |
| 结果检查和失败处理 | [验证与失败处理](skills/farming/references/verification.md) |
| 切换目录、规则和存档，诊断范围 | [资产与存档](skills/farming/references/saves-and-assets.md) |

## 组件代理

`editor.component.query({type:"FarmingSystem", scene?, entityId?, id?})` 返回真实场景组件的异步代理，身份是 scene、entityId、id、type。

- 代理不是 Engine 实例，所有方法都要 await。组件删除后，旧代理失效。
- farmId、plotId、cropInstanceId 是系统内的业务身份，不是 Entity 或 Component ID。
- 地块和容器按查询返回的 ID 定位，不能用显示名代替。

## 选择目标

先用 `system.list()` 读取农场区域，按用户指定的位置或区域选择 farmId。不能默认第一个区域就是目标。

- 区域未初始化时，用 `system.getDiagnostics()` 查看 placement、access、runtime、presentation 的事实。查询诊断不会重试初始化。
- 组件不存在时，检查 Scene，不要虚构农场。
- 用户说“这里”时，用 getTarget 获取目标。缺少目标能力时不能猜测。

```js
const systems = await editor.component.query({type:"FarmingSystem"});
return await Promise.all(systems.map(async system => ({
  component: system,
  farms: (await system.list()).value,
  diagnostics: (await system.getDiagnostics()).value
})));
```

## 调用约定

业务方法的参数要包含 farmId。成功返回 `{ok:true, value, context?}`。失败抛出结构化错误，证据在捕获错误的 `result.error` 中。先用 get 和 capabilities 读取状态和能力，用 getCatalog 读取真实的种子和作物定义。

写操作的即时回执在 `result.value.receipt`，版本字段是 `revision`。verify 的已保存回执也在 `result.value.receipt`，版本字段是 `committedRevision`，未找到时为 null。两者结构不同。

写命令独立提交。传入 `{commandId, expectedRevision?, expectedGroundRevision?}` 可以做幂等重试和版本校验。

- 多个命令不构成原子事务。后续失败不会撤销之前成功的农场操作，普通 Scene 草稿撤销也不会回滚它们。
- 处理返回值时抛出异常，不代表操作没有执行。结果未知时，先用原 commandId 查询回执，不要重放整批指令。
- 批量操作分批执行，逐项验证，不能声称全部同时成功。

## 示例：给面前的地块浇一次水

```js
const systems = await editor.component.query({type: "FarmingSystem"});
if (systems.length !== 1) throw new Error("请明确目标系统");
const system = systems[0];
const farms = (await system.list()).value;
if (farms.length !== 1) throw new Error("请明确目标农场");
const farmId = farms[0].farmId;
const {plotId} = (await system.getTarget({farmId})).value;
if (!plotId) throw new Error("当前没有指向地块");
const actions = (await system.getAvailableActions({farmId, target: plotId})).value;
if (!actions.some(action => action.action === "irrigate" && action.enabled)) {
  return {plotId, actions};
}
const {receipt} = (await system.irrigate({farmId, plotId})).value;
const saved = (await system.verify({farmId, commandId: receipt.commandId})).value;
const moisture = (await system.getFieldValues({farmId, fieldId: "soilMoisture", plotIds: [plotId]})).value;
return {plotId, commandId: receipt.commandId, revision: receipt.revision,
  savedRevision: saved.receipt?.committedRevision, moisture};
```

## 能力范围

能力都在声明中：

- 读取：list、get、capabilities、getDiagnostics、getCatalog、getTarget
- 地块：queryPlots、getPlot、inspectCultivation、getAvailableActions、createPlot、updatePlot、deletePlot、hoe
- 种植：plant、irrigate、harvest、getFieldValues
- 库存：getInventory、getContainers、setContainerCount、withdrawInventory
- 道具：queryItems、getCarry、getItemTotals、generateItems、pickupItem、placeItem、useCarriedItem、unloadBasket
- 验证：verify

当前不支持主动除虫、自动供水、原子批量操作和直接快进时间。营养条件视为最佳，没有施肥操作和肥力字段。

规则和植物形态属于目录和规则资产的配置，要编辑对应资产并通过加载校验，不是作物业务方法。不要用普通 `component.update` 写入运行时私有字段来绕过业务校验。组件 enabled 控制系统启用。业务状态由系统保存，瞬时表现不保存。

Script 资产使用 Engine 的真实组件和 FarmingAPI，不能引用这份 Worker Editor 声明。
