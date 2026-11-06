# 农场作物与播种种子的米制尺度

2026-10-28。世界坐标按米使用；`DEFAULT_PLOT_GRID.cellSize` 是 1.25 米，不能把农场操作格或随分辨率变化的地形采样格都视作 1 米。作物由 `presentation/DefaultCropScales.ts` 统一等比校准，SeedWorld 与第一人称农场共用。原始程序化配方、生命周期和根部原点保持不变，不再为了塞进一格而缩小植株。

下表测量 `generatePlantGrowthGeometry(recipe, 1)` 的默认株型：高度取地面原点以上的最大 Y，不包含地下根部；展开宽度取 X/Z 较大值。株型随机变化会改变实际包围盒。这是结合常见栽培形态选择的设计尺度，不是所有品种的唯一尺寸，也没有重做原素材的器官比例。

| 作物 | 原地上高度 / m | 校准后地上高度 / m | 校准后最大展开宽度 / m | 采用形态 |
| --- | ---: | ---: | ---: | --- |
| 番茄 | 0.60 | 0.96 | 1.45 | 低矮开展的结果株 |
| 甜菜 | 0.51 | 0.30 | 0.22 | 收获期，非抽薹期 |
| 卷心菜 | 0.22 | 0.22 | 0.70 | 保留外围展开叶片，宽度不是菜球直径 |
| 油菜 | 0.65 | 1.22 | 0.62 | 开花结荚株 |
| 胡萝卜 | 0.60 | 0.30 | 0.26 | 收获期，非第二年花茎 |
| 葡萄 | 0.66 | 1.65 | 1.10 | 人工管理的架栽株 |
| 甜瓜 | 0.16 | 0.39 | 1.77 | 匍匐生长 |
| 土豆 | 0.66 | 0.66 | 1.02 | 保留已有合理比例 |
| 南瓜 | 0.18 | 0.35 | 1.37 | 匍匐藤蔓，按用户要求将地上高度调整至约 35 cm |
| 萝卜 | 0.55 | 0.20 | 0.17 | 小型根菜 |
| 向日葵 | 1.04 | 2.05 | 0.83 | 高秆大花型，保留素材的大花盘比例 |
| 西瓜 | 0.18 | 0.42 | 1.65 | 匍匐生长 |
| 小麦 | 0.93 | 1.08 | 0.43 | 成熟麦株 |
| 水稻 | 0.68 | 0.97 | 0.67 | 成熟稻株 |

参考依据：Garden Organic 的 [胡萝卜](https://www.gardenorganic.org.uk/expert-advice/how-to-grow/growing-guides/vegetables-herbs-guides/how-to-grow-carrot)、[甜菜](https://www.gardenorganic.org.uk/expert-advice/how-to-grow/growing-guides/vegetables-herbs-guides/how-to-grow-a-beetroot)、[南瓜](https://www.gardenorganic.org.uk/expert-advice/how-to-grow/growing-guides/vegetables-herbs-guides/pumpkins-and-squashes)给出约 30、30、45 厘米的平均株高；[加拿大食品检验局油菜生物学资料](https://inspection.canada.ca/en/plant-health/plant-varieties/novel-traits/applicants/directive-94-08/biology-documents/brassica-napus)描述植株可高达 1.5 米；[俄勒冈州立大学葡萄栽培指南](https://extension.oregonstate.edu/catalog/ec-1639-growing-table-grapes)采用约 6 英尺的管理架高；[RHS 小麦](https://www.rhs.org.uk/plants/142255/triticum-aestivum/details)为 1–1.5 米；[奥克兰植物园向日葵](https://www.aucklandbotanicgardens.co.nz/plants-for-auckland/plants/helianthus-annuus/)说明品种株高可从 0.5 到 3 米。[RHS 南瓜种植指南](https://www.rhs.org.uk/vegetables/pumpkins/grow-your-own)说明瓜藤可以延伸数米，因此冠幅不应强制限制为一格。

## 播种种子

种子是可辨识的动画提示，按用户要求保留适度放大。`SowingSeedLibrary` 创建缓存网格时一次性等比缩放顶点，保留贴地原点、法线、颜色和三角形数量；不缩放落点分布、飞行轨迹或后续动画时间。

| 动画类别 | 原单粒最长轴 | 新单粒最长轴 |
| --- | --- | --- |
| 小粒种子 | 2.8–3.6 cm | 1.4–1.8 cm |
| 麦粒 / 稻粒 | 4.7–6.1 cm | 2.1–2.7 cm |
| 南瓜 / 甜瓜 / 西瓜种子 | 12.9–15.8 cm | 3.6–4.4 cm |

## 农具复核及边界

持久道具已经通过实际 GLB 尺寸校准，参见 [PROP-SCALE.md](PROP-SCALE.md)。本次保留锄头全长 1.55 米、水壶含提手高 0.35 米、收获篮长径 0.32 米、种子袋长边 0.45 米。水壶可对照 [Burgon & Ball 官方 5L 规格](https://www.burgonandball.com/products/waterfall-watering-can-5-litre-british-racing-green)的高 35 厘米、含嘴长 63 厘米；当前模型含嘴长约 62.5 厘米。拿起、使用、收回、放下不改变物理比例。固定仓储车和筐的现有资产测量分别约 1.43×2.28×1.18 米、0.57×0.57×0.34 米，本次未更改。

冠幅可以越过格线，但种植、浇水、收获和地块轮廓仍按原逻辑格。裁剪包围半径沿用相同缩放系数，不会继续用旧的小株尺寸裁剪。已存作物加载后直接采用新表现比例，无需换存档；不修改存档坐标、玩法范围或产量。

仓储和收获动画中的产物是既有容量/数量示意，仍采用独立的 `HarvestProduceShape` 与 `storageProduceSlot`，不属于本次地上植株校准，不能用它们判断田间果实的真实尺寸。

没有增加实体、材质、Draw Call 或顶点数量；没有每帧测量或重算尺寸。植株放大可能增加屏幕覆盖面积和可见对象数，因此这些结构性检查不等于 GPU 性能验收。单测验证全部 14 种作物成熟尺寸、增长包围范围，以及 5 种作物对应的种子实际上传尺寸/缓存复用/落点不变；实景观感仍需游戏内验证。
