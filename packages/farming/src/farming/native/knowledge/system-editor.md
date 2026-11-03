# 农场组件 Editor API

先用 read 工具读取 `editor/farming/FarmingSystem.d.ts`。`editor.component.query({type:"FarmingSystem", scene?, entityId?, id?})` 返回真实场景组件的异步代理，身份为 scene/entityId/id/type。代理不是 Engine 实例；所有方法都需要 await。组件删除后旧代理失效。系统内的 farmId、plotId、cropInstanceId 是业务对象身份，不是 Entity 或 Component ID。

先通过 system.list() 读取农场区域；根据用户指定的位置/区域选择 farmId。不能默认第一个区域就是目标。区域未初始化时用 system.getDiagnostics() 检查 placement/access/runtime/presentation 的事实，查询诊断不会重试初始化。组件不存在时检查 Scene，不要虚构农场。

```js
const systems = await editor.component.query({type:"FarmingSystem"});
return await Promise.all(systems.map(async system => ({
  component: system,
  farms: (await system.list()).value,
  diagnostics: (await system.getDiagnostics()).value
})));
```

业务方法参数保留 farmId。成功返回 `{ok:true, value, context?}`；失败抛出结构化错误，证据在捕获错误的 `result.error`。先 get/capabilities 读取状态和能力，getCatalog 读取真实种子/作物定义。用户说“这里”时用 getTarget 获取目标；缺少目标能力时不能猜测。

写操作的即时回执在 `result.value.receipt`，版本字段为 `revision`；verify 的已保存回执在 `result.value.receipt`，版本字段为 `committedRevision`，未找到时为 null。两者不是同一种回执结构。处理返回值时抛异常不代表操作没执行，应先查原 commandId 的回执。下面是用户要求“给面前的地块浇一次水”时的完整执行示例：

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

播种先 queryPlots/getPlot 找到已开垦、地形可用的空地，getCatalog 找到目标作物对应的 seedId；plant 使用 seedId，不能用 cropId 替代。浇水先读取生长限制因素与可用动作；浇水可能影响相邻连通耕地，用 getFieldValues 读回。收获前取得当前成熟作物的 crop.instanceId，harvest 后验证地块腾空与 getItemTotals.pending 增量；产物进入持久收获篮子，容量为 20，容量不足整次拒绝。通过 unloadBasket 手动卸货才进入固定设施库存，放下篮子保留内容，不手动加库存。营养条件视为最佳，不提供施肥操作或肥力字段。

```js
const systems = await editor.component.query({type:"FarmingSystem"});
if (systems.length !== 1) throw new Error("请明确目标系统");
const system = systems[0];
const farms = (await system.list()).value;
if (farms.length !== 1) throw new Error("请明确目标农场");
const farmId = farms[0].farmId;
return {farmId, catalog: (await system.getCatalog({farmId})).value,
  plots: (await system.queryPlots({farmId})).value};
```

完整能力均在声明中：list/get/capabilities/getDiagnostics；getCatalog/getTarget；queryPlots/getPlot/inspectCultivation/getAvailableActions；createPlot/updatePlot/deletePlot/hoe；plant/irrigate/harvest；getFieldValues；getInventory/getContainers/setContainerCount/withdrawInventory；queryItems/getCarry/getItemTotals/generateItems/pickupItem/placeItem/useCarriedItem/unloadBasket；verify。地块和容器以查询返回的 ID 定位，不能用显示名代替身份。

写命令独立提交，传入 `{commandId, expectedRevision?, expectedGroundRevision?}` 可做幂等重试与版本校验。每条命令返回 receipt；verify({farmId,commandId}) 查询是否提交。多个命令不构成原子事务；后续失败不会撤销此前成功的农场操作，也不会因普通 Scene 草稿撤销而回滚。未知执行结果先查原回执，不重放整批指令。旧篮子接口 showBasket/hideBasket/getBasket 已移除；改用 queryItems/getCarry 查询持久道具、pickupItem/placeItem 拿放篮子、unloadBasket 手动卸货。批量操作分批执行并逐项验证，不声称全部同时成功。

本系统业务方法当前不支持主动除虫、自动供水、原子批量操作或直接快进时间。规则和植物形态属于目录/规则资产配置，需编辑对应资产并经加载校验，不是作物业务方法。不要用普通 component.update 写入运行时私有字段绕过业务校验。组件 enabled 控制系统启用；业务状态由系统保存，瞬时表现不保存。Script 资产使用 Engine 的真实组件与 FarmingAPI，不能引用此 Worker Editor 声明。


## 场景与资产

创建、读取、引用查询、删除资产以及修改组件引用，读取 `editor/declare/native/api.d.ts` 获取普通 Editor API 声明。此处使用 execute 的 editor.asset；Script 声明不用于这些编辑操作。

FarmingSystem 的 Scene 属性 `catalog`、`rules`、`state` 是资产引用（`{$ref:"虚拟路径"}`）。目录资产包含作物、种子和植物定义，植物 atlasUrl 使用项目中的贴图虚拟路径；规则资产包含土壤、环境和动作参数；state 是该系统独立管理的存档。先用通用 `editor.component.read({scene,id})` 查看当前引用，再 read 对应虚拟路径。用 `editor.asset.references({path})` 查询引用者，不能删除仍被组件或目录引用的资产。

默认资产为 `World/Farming/Catalog.farming`、`World/Farming/Rules.farming`、`World/Farming.json`；这些是预置值，实际使用以组件读回的引用为准。共享目录和规则不是每个农场再复制一份，游戏状态只通过系统业务命令保存。普通 Scene 编辑不覆盖最新存档。组件切换引用后由宿主重新绑定相应的资源和仓储；资源配置必须满足种植规则与存档校验，不通过改 JSON 绕过作物操作。


每个 Scene 只放一个 FarmingSystem，由它管理多个农场区域；禁用组件仍占据该 Scene 的系统身份。重复组件、缺失资产引用或错误资产类型会在保存前报错，不会替换已有农场。

删除系统不会自动删除存档。需要清理存档时，先提交并完成组件移除（或切换 state 引用），等待旧仓储释放；再查询资产引用并删除没有引用的旧 state 文件。不要在同一未提交草稿中同时移除正在运行的组件与其状态文件，运行时所有权检查会拒绝该操作。存档内容仍只由 FarmingSystem 业务方法写入。


新建独立存档使用普通资产创建：

```js
return await editor.asset.create({
  path: "Saves/MyFarm.json",
  type: "SeedWorldFarming",
  content: JSON.stringify({version: 1, farms: {}})
});
```

空存档由 FarmingSystem 初始化。需要切换时，再用 component.update 将 `state` 指向新虚拟路径；原存档保留，直到明确删除。不要手工填充作物、库存或回执。目录和规则都是 FarmingResource 文件，但内容的 kind 分别必须是 catalog 与 rules；版本必须相同，种子必须引用目录中存在的作物。非法植物定义、土壤/环境/动作参数和模拟参数会被拒绝。修改目录/规则内容或切换 state 引用时，保存前会检查已有存档与候选配置的兼容性，包括作物定义、模拟规则签名和已有网格的扩散稳定性。不兼容会拒绝整个编辑，原农场不变。需要新的模拟规则时，在同一次 execute 中创建空存档、修改规则并切换 state 引用；旧存档保留。远端状态文件应先 read，使其内容可用于校验。空存档的实际场地/网格由初始化流程检查；用 getDiagnostics 验证区域就绪后再执行业务命令。

新存档初始化使用当前目录/规则。若仓储定义与规划时不同，会在原农场网格和搜索范围内重新检查初始容器，保留操作通道；是否预置容器仍由 initialContainers 配置决定。找不到合法位置时通过 getDiagnostics 报告失败，不迁移农场或修改旧存档。已有存档的容器按其兼容规则的完整占地恢复，保存的位置保持不变。
