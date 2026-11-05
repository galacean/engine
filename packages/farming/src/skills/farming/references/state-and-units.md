# 状态与单位

## 身份

- farmId：种植区域。plotId：耕地。cropId：作物种类。seedId：种子定义。cropInstanceId：本次种下的实例。实例 ID 不能用物种 ID 替代。
- 地块由 groundId、cellX、cellZ 和网格定位。世界范围、位置和距离的单位是米。高度来自当前宿主地形，普通地块更新不能移动耕地。

## 单位

- 土壤 moistureUnits 和 soilMoisturePercent 是体积含水率百分点，25 表示 25%，不是饱和容量的 25%。材质使用的 0..1 湿度只用于外观。
- growthPermille、healthPermille、coefficientPermille 是 0..1000 的千分比。factors 的 value 使用各自的 unit，不要把不同因素的原始量混作百分比。
- growthMultiplier 是当前会话的作物生长倍数，默认 1，不进入存档。实际速度是环境成长系数乘以这个倍数，预计剩余时间已包含它。倍数为 0 时，`pausedReason=growth-paused`。
- 模拟时间和剩余时间的单位是毫秒。篮子演出时间和停留时间的单位是秒。画面帧时间不决定作物生长速度。

查询携带 revision、groundRevision 和 simulatedTimeMs。时间自动推进时，持久化 revision 不增加，查询结果也可能变化。不能仅凭 revision 判断生长诊断没有变化。

## 库存

- getInventory 是固定仓储设施的入库总数。
- getItemTotals：stored 与 getInventory 相同，pending 是所有持久收获篮子中待卸货的数量，total 是两者之和。
- getContainers.contents 返回逐作物的完整库存，quantity 是容器总量。混装马车的 cropId 和 itemId 为 null，必须读取 contents。
- 马车 `capacity=null`，库存可以超过 displayCapacity，只展示一车的份额。
- 仓储篮子保持单作物和硬容量。
- 手持收获篮子容量统一为 20，可以混装。不要从网格反推数量。

## 存档

schemaVersion 10 的 FarmSnapshot 是唯一的存档，包含道具的稳定 ID、类型、位置、种子袋作物、唯一携带关系、各篮子内容、作物土壤、固定设施和持久回执。

所有道具都用 `{itemId}` 表示唯一携带关系并持久化。种子类型从物品的 seedId 读取。拿起、放下和换拿共用同一事务和落点规则。

重新载入只恢复稳定状态，不重播动画或收获，也不自动发放道具。相机书签不受物品存档影响。其他版本的存档不兼容，也不迁移。Planner 加载失败时，按当前规划重建。

## 健康

healthStatus 从健康值派生：1000 为 normal，1..999 为 damaged，0 为 destroyed，不保存第二套状态。

健康为 0 时，伤害回执保留健康 0 和 destroyed。土地上的这株作物立即自动移除，不产生收获物，getPlot 返回 `crop=null`。耕地保持已整平，可以重新播种。

## 水分与成长

土壤水分只影响成长速度：最低含水率及以下为 20%，饱和值及以上为 100%，中间线性插值。过干或过湿都不会暂停成长。这个水分倍率乘以其他环境因素中的最低系数。温度、光照、pH、病虫压力和显式生长倍率为 0 时，仍可以暂停成长。

## 环境与补水

getEnvironment 返回当前宿主输入、农业时间和最近结算的 settledEnvironment。静态基线会明确标记。

getPlot 和 queryPlots 的 waterRates 是按当前输入和含水率实时计算的雨水、河湖补水和蒸发速率（百分点/模拟分钟），不是最近一步的实际收支。作物成长解释使用最近结算的气温和光照。

Planner 的农业时钟在重开时从 lastSystemTimeMs 续走，只累加本次页面运行时长。独立 Demo 的时间策略由宿主决定。

nearWater 的岸距和高差单位是米。coefficient 是 0..1 的几何系数，与天气和含水率无关。实际补水速率随含水率接近平衡目标而衰减。宿主未接入时，`nearWater=null`，补水速率为 0。

河流、湖泊和作者池塘的作用范围是 20 米，量到真实湿区和最近湿侧的水位。干涸河段不算。超过 20 米或高差达到 4 米时，补水为 0。干岸可以有补水，这不代表地块被判为水下。

刷新期间继续读旧的完整缓存，`refreshing` 保持 true，直到新的完整结果发布。未完成的距离和水位不用于补水。

## 耕地

耕地准备状态只有未开垦 raw（没有地块记录）和已整平 leveled。锄地直接创建 leveled，可以立即播种。所有耕地都采用已整平的水分交换规则。农场没有耙子和耙地操作。
