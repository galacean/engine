# 种植系统

本系统管理种植区域、耕地、作物生命周期、土壤水分和收获库存。通过 `editor.component.query({ type: "FarmingAreaComponent" })` 获取区域代理，先读取 `farming/FarmingAPI.d.ts` 的 Editor 声明。

推荐流程：editor.component.query 找到区域 → read/capabilities 读取运行状态和能力 → getCatalog 取得真实种子 ID → 查询目标 → 执行 → verify/getPlot/getInventory 检查结果。

区域未出现或没有生效时先调用 getDiagnostics：候选与发布分别携带版本，placement/access/runtime/presentation 分别报告原因。道路事实由空间宿主提供，种植系统不会自行判断路网。诊断查询不会重试初始化；世界渲染成功不代表农场已生效，表现加载失败也不撤销已提交库存。

查询返回的代理绑定 farmId，各方法不再重复传 farmId。不要猜测种子、地块或作物实例 ID，也不要默认操作第一个区域。用户说“这里”时读取 getTarget；缺少目标能力时查询或说明缺失，不能虚构选中地块。

阅读导航：
- operations.md：跨操作的流程。其中的示例使用 FarmingSystem 代理，方法要传 farmId。使用区域代理时不传 farmId，写法见本文末尾。
- state-and-units.md：身份、单位、时间、库存与显示。
- verification.md：状态断言和安全重试。

首轮支持现有单周期种植操作。暂不支持主动除虫、通过 Native API 编辑生长/环境规则、植物形态编辑、近水补水规则编辑或批量原子事务。批量请求逐项执行并分别检查结果，不能声称全部同时成功。

系统是玩法模拟，不是经实测校准的农学模型。API 的 Runtime 校验决定操作是否合法，文档不赋予额外能力。

## 执行与提交边界

区域代理的方法使用独立命令模式。每个写入请求通过种植服务自己的事务提交；查询不提交写入。脚本中的多个请求不构成一个可整体回滚的草稿事务，即使同一脚本同时编辑工程草稿，已提交的种植命令也不会被草稿撤销。

拒绝的请求可以捕获后重新查询，再提交新命令。脚本后续失败不会撤销已成功提交的请求。外层执行回执 `completed` 或 `interrupted` 与逐条 `commands` 的紧凑提交事实（命令 ID、区域 ID、版本、重放标记及状态）共同保留执行事实；`unknown` 表示请求可能已提交，应先查询原命令回执，同一脚本将阻止后续写入，但允许查询和 `verify`；Agent Loop 停止自动执行，不能自动重放整批写入。纯查询不进入 `commands`。完整参数、领域结果与错误堆栈仅保留在 Trace，模型回执总量不超过 12 KiB；容量不足在下一次写入前拒绝，已提交事实不丢弃。

Agent Tool 只返回成功的 `FarmingResult`；被拒绝的请求抛出工具错误，可以从捕获错误的 `result.error` 读取原因。直接调用 `FarmingAPI.execute` 则仍返回完整成功／失败联合类型。

营养条件视为最佳；无施肥操作和肥力字段，肥力不影响作物成长。Planner 会话级生长调试不属于 Native 写操作。
## Editor 与 Runtime

execute 中的 editor 是异步 Editor API，代理只携带 farmId；它不是 Engine Component 实例。`farm.read()` 读取当前快照，`farm.queryPlots({ query })` 查找地块；`farm.plant({ plotId, seedId }, { commandId })` 发起业务命令。所有方法返回 `{ ok: true, value, context? }`，错误抛出并保留命令事实。

```javascript
const farms = await editor.component.query({ type: "FarmingAreaComponent" });
return await Promise.all(farms.map(async farm => (await farm.read()).value));
```

脚本资产使用 Engine 的真实组件 API，不得把此 Editor 代理声明当作 Engine 声明。Worker 编译不意味着 Script 执行被隔离；系统源码接入必须遵循宿主的运行边界。


区域尚未初始化时，先查询系统诊断：

```javascript
const [system] = await editor.component.query({type: "FarmingSystem"});
const diagnostics = await system.getDiagnostics();
```

FarmingSystem 是当前 Scene 的单例代理；查询诊断不会触发初始化或重试。区域查询只返回真实存在的区域身份。Editor 方法失败会抛出结构化错误，成功结果的 `.ok` 恒为 true，不需要读取不存在的 `.error` 分支。

## 区域代理示例

下面的函数可以在 execute 脚本中调用。参数来自已发现、并由用户指定的区域、地块和作物，实际种子 ID 始终从目录取得。

```js
async function plantCrop(farm, plotId, cropId) {
  const farmId = farm.farmId;
  const catalog = await farm.getCatalog();
  const seed = catalog.value.seeds.find((s) => s.cropId === cropId);
  if (!seed) throw new Error("此区域没有对应种子");
  const target = await farm.getPlot({ plotId });
  if (!target.value || target.value.crop || target.value.ground.availability !== "available")
    throw new Error("目标不是可播种的空耕地");
  const result = await farm.plant({ plotId, seedId: seed.id });
  await farm.verify({ commandId: result.value.receipt.commandId });
  const actual = await farm.getPlot({ plotId });
  const crop = actual.value?.crop;
  if (!crop || crop.cropId !== cropId) throw new Error("播种验证失败");
  return {
    status: "applied",
    farmId,
    plotId,
    cropInstanceId: crop.instanceId,
    commandId: result.value.receipt.commandId
  };
}
```

下面的脚本适用于用户明确要求收获唯一区域的全部成熟作物，规则见 operations.md 的收获一节。

```js
const regions = await editor.component.query({ type: "FarmingAreaComponent" });
if (regions.length !== 1) throw new Error("请明确目标区域");
const farm = regions[0];
const farmId = farm.farmId;
const plots = await farm.queryPlots({ query: { occupied: true } });
const candidates = plots.value.filter((p) => p.crop?.mature);
const results = [];
let next = 0;
for (; next < Math.min(2, candidates.length); next++) {
  const plotId = candidates[next].plotId;
  let committed = null;
  try {
    const current = await farm.getPlot({ plotId });
    if (!current.value?.crop?.mature) throw new Error("目标已变化，请重新查询");
    const before = await farm.getItemTotals();
    const result = await farm.harvest({ plotId, cropInstanceId: current.value.crop.instanceId });
    committed = result.value;
    await farm.verify({ commandId: committed.receipt.commandId });
    const actual = await farm.getPlot({ plotId });
    const after = await farm.getItemTotals();
    const yieldChange = committed.receipt.changes.find((c) => c.kind === "crop-harvested");
    if (
      actual.value?.crop !== null ||
      !yieldChange ||
      (after.value.pending[yieldChange.itemId] || 0) - (before.value.pending[yieldChange.itemId] || 0) !==
        yieldChange.quantity
    )
      throw new Error("收获读回验证失败");
    results.push({
      plotId,
      ok: true,
      commandId: committed.receipt.commandId,
      itemId: yieldChange.itemId,
      quantity: yieldChange.quantity
    });
  } catch (error) {
    results.push({
      plotId,
      ok: false,
      message: error.message,
      evidence: error.result || null,
      committed,
      verificationRequired: committed !== null
    });
    if (committed) next++;
    break;
  }
}
const remainingPlotIds = candidates.slice(next).map((p) => p.plotId);
return {
  status:
    results.length === 0
      ? "no-op"
      : remainingPlotIds.length === 0 && results.every((r) => r.ok)
        ? "applied"
        : "partial",
  farmId,
  results,
  remainingPlotIds
};
```
