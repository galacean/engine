# 验证与失败处理

领域写操作返回 ok 表示持久化成功，演出状态单独返回。查询的 ok 只表示读取成功。不要把收到请求、拿出篮子或动画开始当作已收获。提交后演出异常，不能否认已入库的事实。

## 检查结果

执行后先 `verify(commandId)`，再读取具体状态：

- plant：目标出现正确的 cropId 和新实例 ID。
- irrigate：回执的 input、absorbed、distributed、lost 一致，相关地块含水率符合分配。
- harvest：目标腾空，回执的产物和数量匹配，getCarry 和 `getItemTotals.pending` 增加对应数量，固定设施不变。
- unloadBasket：源篮已清空且仍在携带，`getItemTotals.pending` 减少，stored 增加，total 守恒，allocations 与各设施和新增设施匹配。
- setContainerCount：类型数量与请求一致，库存总数不变。容量不足或找不到位置时，容器保持原状。
- withdrawInventory：总库存减少请求的数量，空容器解除绑定，多余的空容器回收到保留数量。
- hoe、deletePlot：目标状态符合要求，库存不因移除作物增加。
- pickupItem、placeItem：稳定实例只改变位置和携带关系，篮子内容不变。种子袋保留，种子放下后空手。

`verify.minimumRevision` 是版本下限，允许自然时间继续推进。回执窗口有限。NOT_FOUND 不能解释为一定没有执行，要查询当前事实。

报告必须依据回执和读回结果，不依赖动画截图或最后一句文本。

## 读取失败

初始化读取出现 STORAGE_FAILURE 时，`retryable=true`。下一次区域状态或操作请求会重试一次初始化，并与并发请求共享加载。

INVALID_SNAPSHOT 或资源版本不兼容时，不会自动重试，也不覆盖已有记录。由宿主修正资产或存档后，创建新组件。

## 写入失败

写入 STORAGE_FAILURE 时，保留并重试原输入、commandId 和 expectedRevision。

完整请求在捕获错误的 `error.result.error.details.retryRequest` 中，包含捕获的实例和版本。确认其中的 `input.farmId` 就是目标区域。

- FarmingSystem 代理：把 input 原样传给对应方法，把 options 原样作为第二个参数，例如 `system.plant(retryRequest.input, retryRequest.options)`。
- 区域代理：先从 input 中去掉 farmId，再传给对应方法。
- Engine Script 直接使用 FarmingAPI 时，才把完整请求原样传给 `api.execute`。代理上没有 execute 方法。

成功结果也提供 `value.request`，用于同请求重放。不要只保留 ID 然后修改实例或版本。原输入和最终绑定的参数随回执一起持久化，API 重建或 Scene 保存恢复后仍可原样重放。回执保留窗口内，同 ID 同请求重放不会重复修改。不同请求复用 ID 会返回 INVALID_COMMAND。

当前回执绑定原请求和捕获的版本。不能根据当前状态猜测省略的占用实例。

## 其他错误

- VERSION_CONFLICT、GROUND_CHANGED、CROP_INSTANCE_CHANGED：重新查询，解释变化。确实需要继续时，使用新的命令 ID，不要在原请求上悄悄改参数。
- BUSY：区域正在执行交互动作，查询仍可用。
- CANCELLED：尚未提交的操作被取消，不要报告收获成功。

操作失败时，已发生的时间或地形变化可能仍已提交。Editor 中检查 `error.result.error` 的 executed 和 details（含 changes、context），不要一律声称“完全没有变化”。
