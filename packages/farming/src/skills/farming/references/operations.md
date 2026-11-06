# 操作流程

示例使用 FarmingSystem 代理，方法要传 farmId。

## 播种

用 queryPlots 或 getPlot 找到已开垦、地形可用的空地。用 getCatalog 找到目标作物对应的 seedId。plant 使用 seedId，不能用 cropId 替代。

```js
const seed = (await system.getCatalog({farmId})).value.seeds.find(s => s.cropId === cropId);
if (!seed) throw new Error("此区域没有对应种子");
const target = (await system.getPlot({farmId, plotId})).value;
if (!target || target.crop || target.ground.availability !== "available")
  throw new Error("目标不是可播种的空耕地");
const {receipt} = (await system.plant({farmId, plotId, seedId: seed.id})).value;
await system.verify({farmId, commandId: receipt.commandId});
const crop = (await system.getPlot({farmId, plotId})).value?.crop;
if (!crop || crop.cropId !== cropId) throw new Error("播种验证失败");
return {plotId, cropInstanceId: crop.instanceId, commandId: receipt.commandId};
```

## 浇水与生长诊断

读取 getPlot.crop 的 pausedReason、limitingFactorId 和 factors。

- 水分统一按土壤最低含水率到饱和值线性映射为 20% 到 100% 的速度。其他因素与 getCatalog 中同一 cropId 的 growthFactors 适宜范围比较。
- 水分不足时，浇水可以加速。温度、光照等原因不能靠浇水解决。
- 成熟剩余时间是按当前条件估计的。null 表示当前停止生长，不表示没有作物。

浇水可能改变相邻连通耕地。检查回执的水量分配和 getFieldValues，不要只检查目标。相邻干地会通过水分交换降低目标地块的含水率。必要时按读回结果分别补水，不要把全部下降都归因于蒸发。

浇水不等于立即成熟。时间由宿主时钟推进，模型没有 advance-time 权限。

## 收获

从 getPlot 取得当前成熟实例的 instanceId，再调用 harvest。接口必须使用玩家当前的篮子。未携带时，它会在目标旁生成或复用空闲篮子并换拿。

收获后，验证地块已腾空，且 getItemTotals.pending 增加了对应数量。产物进入持久收获篮子，容量 20，按整次实际产量检查。容量不足时整次拒绝。不要自行先删除作物，或向篮子塞物品。

用户明确要求收获唯一区域的全部成熟作物时，用下面的脚本。

- 区域不唯一时，停止并要求用户指定目标。
- 每次最多处理 2 株，含发现和逐项读回最多 14 次工具调用。不要在同一个脚本中循环调用，以免耗尽预算。
- 成功后，根据 remainingPlotIds 发起下一次脚本，重新查询成熟实例，直到为空。
- 遇到错误立即停止，先处理失败证据，再继续剩余目标。
- 已提交但验证失败的项目，必须先按 commandId 验证，不能重新发出收获。

```js
const systems = await editor.component.query({type: "FarmingSystem"});
if (systems.length !== 1) throw new Error("请明确目标系统");
const system = systems[0];
const farms = (await system.list()).value;
if (farms.length !== 1) throw new Error("请明确目标区域");
const farmId = farms[0].farmId;
const plots = (await system.queryPlots({farmId, query: {occupied: true}})).value;
const candidates = plots.filter(p => p.crop?.mature);
const results = [];
let next = 0;
for (; next < Math.min(2, candidates.length); next++) {
  const plotId = candidates[next].plotId;
  let committed = null;
  try {
    const current = (await system.getPlot({farmId, plotId})).value;
    if (!current?.crop?.mature) throw new Error("目标已变化，请重新查询");
    const before = (await system.getItemTotals({farmId})).value;
    committed = (await system.harvest({farmId, plotId, cropInstanceId: current.crop.instanceId})).value;
    await system.verify({farmId, commandId: committed.receipt.commandId});
    const actual = (await system.getPlot({farmId, plotId})).value;
    const after = (await system.getItemTotals({farmId})).value;
    const change = committed.receipt.changes.find(c => c.kind === "crop-harvested");
    if (actual?.crop !== null || !change ||
        (after.pending[change.itemId] || 0) - (before.pending[change.itemId] || 0) !== change.quantity)
      throw new Error("收获读回验证失败");
    results.push({plotId, ok: true, commandId: committed.receipt.commandId, itemId: change.itemId, quantity: change.quantity});
  } catch (error) {
    results.push({plotId, ok: false, message: error.message, evidence: error.result || null, committed, verificationRequired: committed !== null});
    if (committed) next++;
    break;
  }
}
return {farmId, results, remainingPlotIds: candidates.slice(next).map(p => p.plotId)};
```

## 整地与删除

inspectCultivation 不修改状态。实际开垦用 hoe。createPlot 用于布局注册。

hoe 按点击时的状态固定意图：

- 原始地：开垦。
- 已有地块且有作物：清除作物。清除不产生收获物，不能代替 harvest。
- 空耕地：还原。

延迟操作绑定开始时的意图、地块和作物实例。这些变化后，操作被拒绝，不会降级到下一个意图。

updatePlot 只允许修改标签和准备状态，不能改库存或生长量。

deletePlot 移除耕地记录，不雕刻宿主地形。占用的地块只有在明确要求移除作物时，才使用 `cascadeCrop=true`。它不产生收获物。

## 道具与携带

queryItems 查询稳定实例、世界位置、种子袋作物和篮子内容。getCarry 查询唯一的携带物、能力、容量、已用量和剩余量。

generateItems 在指定位置附近生成道具，单次 1–20 个。每类达到软上限 20 时，复用最近的空闲同类实例，回执用 item-reused 区分复用。召回不会搬走远处已有的物品。

pickupItem 拾取道具，包括整个种子袋。所有携带状态统一为 `{itemId}`，拿起后不留地面副本。它先校验新目标和旧物品 dropPosition 附近的落点，再自动更换。

- 种子无限使用。种子袋放下时移动位置，并保留 seedId。
- 篮子放下或换拿时不丢失内容。

placeItem 指定 expectedItemId 和合法的地面位置，失败时保持携带。所有道具都可以放在耕地上，包括有作物的地块，放置不改变耕地或作物。仍会检查实际占地范围的地形支撑、设施和其他道具的间距。

useCarriedItem 按当前携带物和点击时的 target 状态解析一次动作。锄头的行为和 hoe 相同。它捕获版本和作物实例，状态变化时拒绝原意图，不能把一次请求改成下一段动作。

plant、irrigate、hoe、harvest 是替玩家操作，不受玩家距离限制，但必须使用对应的道具。优先用手上的，否则在目标旁生成或复用后换拿。

拾取、使用、放置和卸货进入同一个串行协调通道。同一请求复用，其他请求返回 BUSY，不排长队。createPlot、updatePlot、setContainerCount 等领域编辑保留原有语义。

## 持久篮子与手动卸货

篮子可以混装，每个实际单位占一格，总容量 20。容量不足时整次拒绝，返回 BASKET_CAPACITY_INSUFFICIENT，读取 capacity、used、required。健康降至 0 的作物已自动清地，不需要收获，也不占篮子容量。

成功收获在同一事务中移除作物并增加当前篮子的内容，不会自动存入固定设施。

unloadBasket 要求携带指定的非空篮子。可选的 containerId 只作触发点。

- 马车作物存入已有的兼容马车，允许混存和超出显示容量，不会因装满自动增车。没有马车时返回 NO_STORAGE_SPACE，要先用 setContainerCount 手动添加。默认只有一辆马车。
- 仓储篮子保持单作物和硬容量。先填同作物设施，再填兼容的空设施，不够时自动新建。
- 返回 basket-unloaded.allocations，含 cropId、itemId、quantity、containerId、created。
- 全部分配和清空手持篮子在一次持久事务中提交。任一作物分配或保存失败时，整体拒绝。卸货后仍携带空篮。

固定设施不可拾取。靠近设施、放下篮子或继续收获都不会触发卸货。表现层只使用已确认的状态，不持有库存。

getContainers 查询固定设施和 contents 完整库存。setContainerCount 设置设施总数和保留数量，0 合法。

- 马车减少时可以混存合并，有库存时至少保留一辆。
- 仓储篮子减少时仍检查硬容量。

withdrawInventory 同时扣减可见和超额库存，空设施回收至保留数量。NO_STORAGE_SPACE 表示缺少马车，或篮子扩容没有合法位置，不能用清除作物或篮子来补偿。

## 作物受损与环境查询

外部系统和调试面板通过 damageCrop 提交 farmId、plotId、cropInstanceId、正整数 damagePermille 和 source。来源 animal 只表示归因，不依赖动物加载。伤害可以超过 1000，按剩余健康截断。这不是玩家农具动作。

返回 receipt 和 damage（健康前后、实际伤害、派生状态）。保留完整的返回 request。存储失败时，用 `error.details.retryRequest` 原样重试。同一 commandId 改参数会被拒绝。实例已变（CROP_INSTANCE_CHANGED、CROP_NOT_FOUND）或版本过期（VERSION_CONFLICT）时，不得改为攻击新实例。

健康降至 0 时，伤害和作物移除在同一事务提交：释放耕地，恢复已锄状态，没有收获产物，无论是否成熟。用 receipt、verify 和 getPlot 的 `crop=null` 核验。重放原 commandId 返回原回执。清理后新的伤害请求返回 CROP_NOT_FOUND，重新播种后旧实例的请求返回 CROP_INSTANCE_CHANGED。

getEnvironment 只读当前宿主环境。getPlot 和 queryPlots 返回健康、派生状态、瓶颈、停止原因和当前的雨水、河湖补水、蒸发速率。可用操作通过 getAvailableActions 查询。查询不推进时间，也不扣健康。

nearWater 返回宿主缓存的岸距、高差和系数。刷新期间沿用旧的完整缓存。新地块拿到第一份缓存前，补水为 0。
