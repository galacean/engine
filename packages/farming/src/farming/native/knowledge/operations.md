# 操作流程

## 播种

从 getCatalog 读取种子，从 queryPlots/getPlot 读取空耕地。确认是已开垦、地形可用的地块，调用 plant。不能用 cropId 替代 seedId。

下面是可在 execute 脚本正文中调用的 JavaScript 函数。参数来自已经发现并由用户指定的区域、地块与作物，实际种子 ID 始终从目录取得；不要直接选用第一个区域或空地：

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

## 浇水与生长诊断

读取 getPlot.crop 的 pausedReason、limitingFactorId 和 factors。水分统一按土壤最低含水率到饱和值线性映射为20%到100%速度，不使用目录中的旧水分梯形范围判定停长；其余因素与 getCatalog 中同一 cropId 的 growthFactors 适宜范围比较。水分不足时浇水可加速；温度、光照等原因不能靠浇水解决。成熟剩余时间是按当前条件估计，null 表示当前停止生长，不表示不存在作物。

浇水可能改变相邻连通耕地，检查回执的水量分配和 getFieldValues，不只检查目标。相邻干地会通过水分交换降低目标地块的含水率；必要时按读回情况分别补水，不把全部下降都归因为蒸发。浇水不等于立即成熟；等待由宿主时钟推进，模型没有 advance-time 权限。

## 收获

从 getPlot 取得当前成熟实例，再执行 harvest。API 必须使用玩家当前篮子；未携带时先在目标旁生成或复用空闲篮子并换拿。容量统一为20，按整次实际产量检查，容量不足整次拒绝。不要自行先删除作物或向篮子塞物品。

下面的完整 Agent 脚本适用于用户明确要求收获唯一区域的全部成熟作物。区域不唯一时停止并要求指定目标。每次最多处理 2 株，包含发现与逐项读回验证时最多 14 次工具调用；不要在同一次脚本中循环调用 main 耗尽预算。成功后根据 remainingPlotIds 发起下一次脚本，重新查询成熟实例，直到为空。遇到错误立即停止，先处理失败证据，再继续剩余目标。已经提交但验证失败的项目必须先按 commandId 验证，不能重新发出收获。

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

## 整地与删除

inspectCultivation 不修改状态。实际开垦用 hoe；createPlot 用于布局注册。hoe 按点击时状态固定意图：原始地开垦；已有地块有作物则清除作物；空耕地则还原。清除不产生收获，不能代替 harvest。延迟操作绑定开始时的意图、地块和作物实例，变化后拒绝，不能降级到下一意图。

updatePlot 只允许标签与准备状态，不可改库存或生长量。

deletePlot 移除耕地记录，不雕刻宿主地形。占用地块只有明确要求移除作物时才使用 cascadeCrop=true；它不会产生收获物。

## 道具与携带

queryItems 查询稳定实例、世界位置、种子袋作物与篮子内容；getCarry 查询唯一携带物、能力、容量、已用量和剩余量。generateItems 在指定位置附近生成道具，单次1–20个，每类达到软上限20时复用最近空闲同类实例，回执 item-reused 区分复用。召回不搬走远处已有物品。

pickupItem 拾取道具，包括整个种子袋，所有携带状态统一为 {itemId}，拿起后不留地面副本。先校验新目标与旧物品的 dropPosition 附近落点，再自动更换。种子无限使用，种子袋携带状态正常保存，放下会移动袋子位置并保留seedId；篮子放下或换拿不丢失内容。placeItem 指定 expectedItemId 和合法地面位置，失败保持携带。所有道具允许放在耕地（包括已有作物的地块）上，放置不改变耕地或作物；仍检查实际占地范围的地形支撑、设施和其他道具间距。

useCarriedItem 直接按当前携带物和点击时的 target 状态解析一次动作。锄头按有作物清除作物、空耕地还原；未开垦地面开垦。捕获版本和作物实例，状态变化时拒绝原意图，不能把一次请求改为下一段动作。

plant/irrigate/hoe/harvest 是替玩家操作，不受玩家距离限制，但必须使用对应道具；优先手上的，否则在目标旁生成或复用后换拿。拾取、使用、放置、卸货进入同一串行协调通道；同请求复用，其他请求BUSY，不排成长队。createPlot/updatePlot/setContainerCount 等领域编辑保留原语义。

## 持久篮子与手动卸货

篮子可混装，每个实际单位占一格，总容量20；不足整次拒绝 BASKET_CAPACITY_INSUFFICIENT，读取 capacity/used/required。健康降至0的作物已自动清地，不需要收获，也不占篮子容量。成功收获在同一事务中移除作物并增加当前篮子内容，不自动存入固定设施。getInventory 只读固定设施；getItemTotals 并列返回 stored/pending/total。

unloadBasket 要求携带指定非空篮子。可选 containerId 只作触发点。马车作物存入已有兼容马车，允许混存和超出显示容量，不因装满自动增车；没有马车时返回 NO_STORAGE_SPACE，须先用 setContainerCount 手动添加。默认只有一辆马车，已有多辆仍保留，手动增减可用。仓储篮子保持单作物和硬容量，先填同作物设施、再填兼容空设施，不够自动新建。返回 basket-unloaded.allocations 的 cropId/itemId/quantity/containerId/created。全部分配与清空手持篮子在一次持久事务提交；任意作物分配或保存失败均整体拒绝。卸货后仍携带空篮。

固定设施不可拾取。靠近设施、放下篮子或继续收获不触发卸货。废弃 showBasket/hideBasket/getBasket，不能再调用。表现层只消费已确认状态，不拥有库存。

getContainers 查询固定设施及 contents 完整库存。setContainerCount 设置设施总数及保留数量，0合法；马车减少时可混存合并，有库存时至少保留一辆；仓储篮子减少仍检查硬容量。withdrawInventory 同时扣减可见和超额库存，空设施回收至保留数量。NO_STORAGE_SPACE 是缺少马车或篮子扩容没有合法位置，不能以清除作物或篮子补偿。

## 作物受损与环境查询

外部系统和调试面板通过 damageCrop 提交 farmId、plotId、cropInstanceId、正整数 damagePermille、source；来源 animal 只表达归因，不依赖动物加载。伤害允许超过1000，按剩余健康截断，不暴露 pestPressureDeltaUnits，不加入玩家农具动作。返回 receipt 和 damage（健康前后、实际伤害、派生状态）。保留完整返回 request，存储失败用 error.details.retryRequest 原样重试；同 commandId 改参拒绝。旧实例 CROP_INSTANCE_CHANGED/CROP_NOT_FOUND、过期版本 VERSION_CONFLICT 不得改为攻击新实例。

健康降至0时，伤害和作物移除在同一事务提交：释放耕地、恢复已锄状态，无收获产物，无论成熟与否。使用 receipt、verify 及 getPlot 的 crop=null 核验。重放原 commandId 返回原回执；清理后新的伤害请求返回 CROP_NOT_FOUND，重新播种后旧实例请求返回 CROP_INSTANCE_CHANGED。

getEnvironment 只读当前宿主环境；getPlot/queryPlots 返回相同健康、派生状态、瓶颈、停止原因和当前雨水/河湖补水/蒸发速率，可用操作通过 getAvailableActions 查询。查询不推进时间或扣健康。nearWater 返回宿主缓存的来源哈希、岸距、高差、系数和版本；刷新中沿用旧完整缓存，新地块首份缓存前补水为0。getEnvironment.nearWater 提供刷新采样计数、切片耗时及超预算诊断。查询只读缓存，不同步采样 Water。
