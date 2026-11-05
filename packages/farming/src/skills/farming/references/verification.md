# 验证与失败处理

领域写操作返回 ok 表示持久化成功，演出状态单独返回。查询的 ok 只表示读取成功。不要把收到请求、拿出篮子或动画开始当作已收获。提交后演出异常不能否认已入库事实。

执行后先 verify(commandId)，再读取具体状态检查：

- plant：目标出现正确 cropId 和新实例 ID。
- irrigate：回执 input/absorbed/distributed/lost 一致，相关地块含水率符合分配。
- harvest：目标腾空，回执产物与数量匹配，getCarry/getItemTotals.pending 增加对应数量，固定设施不变。
- unloadBasket：源篮清空且仍携带，getItemTotals.pending减少、stored增加，total守恒，allocations逐设施与新增设施匹配。
- setContainerCount：类型数量与请求一致，库存总数不变；容量不足或找不到位置时容器保持原状。
- withdrawInventory：总库存减少请求数量，空容器解除绑定，多余空容器回收到保留数量。
- hoe/deletePlot：目标状态符合要求，库存不因移除作物增加。
- pickupItem/placeItem：稳定实例只改变位置和携带关系，篮子内容不变；种子袋保留，种子放下后为空手。

verify.minimumRevision 是版本下限，允许自然时间继续推进。回执窗口有限；NOT_FOUND 不能解释为一定未执行，应查询当前事实。

初始化读取出现 STORAGE_FAILURE 时 retryable=true；下一次区域状态/操作请求会重试一次初始化，并与并发请求共享加载。宿主也可调用 area.retryInitialization()。INVALID_SNAPSHOT 或资源版本不兼容不自动重试，不覆盖已有记录；由宿主修正资产或存档后创建新组件。

写入 STORAGE_FAILURE：保留并重试原输入、commandId 和 expectedRevision；Editor 代理捕获的错误中，完整请求位于 error.result.error.details.retryRequest，其中包含捕获的实例与版本。确认请求的 input.farmId 与当前代理一致，将 input 中的 farmId 去除后，其余字段原样传给对应方法，并将 options 原样作为第二个参数。例如原操作为 plant 时，调用 farm.plant(inputWithoutFarmId, retryRequest.options)。不要调用不存在的 farm.execute。Engine Script 直接使用 FarmingAPI 时，才将完整请求原样传给 api.execute。成功结果也提供 value.request，供同请求重放。不要只保留 ID 后更改实例或版本。原输入与最终绑定参数随回执一起持久化，API 重建、Scene 保存恢复后仍可原样重放；回执保留窗口内，同 ID 同请求重放不重复修改；不同请求复用 ID 返回 INVALID_COMMAND。

不兼容旧存档；当前回执绑定原请求与捕获版本。不能根据当前状态猜测省略的占用实例。

VERSION_CONFLICT/GROUND_CHANGED/CROP_INSTANCE_CHANGED：重新查询，解释变化；确实需要继续时使用新命令 ID，不在原请求上偷偷更改参数。BUSY 表示区域正在执行交互动作，查询仍可用。CANCELLED 表示尚未提交的操作被取消，不报告收获成功。

操作失败可能仍提交已经发生的时间或地形状态变化；Editor 中检查 error.result.error 的 executed 和 details（包含 changes/context），不一律声称“完全没有变化”。模型报告必须依据回执和读回断言，不依赖动画截图或最后一句文本。
