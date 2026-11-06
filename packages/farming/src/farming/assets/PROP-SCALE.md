# 农具的统一米制尺度

2026-10-21：`domain/FarmItemDimensions.ts` 是持久道具的尺度来源，`FarmItemModelScale.ts` 只在模型载入时校准一次。地面、拿起、携带、放下、使用动作共用同一实体和同一物理尺寸；手持参数只调整位置和角度，scale 固定为1。尺寸是现实产品规格参考后的设计取值，保留素材原比例，并非逐尺寸复刻参考商品。

| 道具 | 现实参考 | 采用尺度 | 校准后的模型尺寸（米） |
| --- | --- | --- | --- |
| 锄头 | Fiskars Garden Hoe 60英寸，即1.524米 | 全长1.55 | 全长1.550，刃宽约0.242 |
| 耙子 | Fiskars Classic Contractor rake全长1.65米 | 全长1.65 | 全长1.650，头宽约0.430 |
| 水壶 | Burgon & Ball Waterfall 5L含提手高0.35米 | 高0.35 | 高0.350，壶身宽约0.309，含嘴长约0.625 |
| 收获篮 | Burgon & Ball小号收获篮长0.28、宽0.18、含提手高0.21米 | 保留当前素材比例，长径0.32 | 长径0.320、短径0.231、含提手高0.300 |
| 种子袋 | SolaDirect黄麻袋30×45厘米 | 长边0.45 | 平放长0.450、宽0.262、厚约0.086；不是0.45米厚 |

参考链接：[锄头](https://cuix-prod.fiskars.com/en-us/gardening-and-yard-care/products/cultivating-tools/garden-hoe-tool-long-handle-aluminum-flat-yard-hoe-60-336500-1002)、[耙子目录](https://www.fiskars.com/-/media/fiskars/documents/catalogues/english/2026/2026-fiskars-gardening-catalogue.pdf)、[水壶](https://www.brooksidenursery.co.uk/waterfall-watering-can-by-burgon-ball-5-litre-british-racing-green.html)、[收获篮](https://www.burgonandball.com/products/sophie-conran-harvesting-basket-small)、[黄麻袋](https://www.soladirect.co.uk/collections/sacks-bags)。

人物尺寸对照采用Planner `planning-data/reference-profile.json`的1.8米身高。该配置的研究眼高为1.6米，V2另有1.7米眼高，而此次实际Planner页面导航眼高为1.8米；没有修改宿主导航配置。验收页临时人物标尺严格为1.8米，不能把当前屏幕中的球形交互图标当成人物身高。

## 地面姿态与空间占用

- 保留FarmItemGroundPose已有的长柄农具平放旋转和位置过渡，删除原来的0.8米落地缩放。使用动作保留刚性尺寸，并按HoeContact/RakeContact/WateringNozzle校准接触点。
- 收获篮的网格本身有+35°绕X倾斜（导出说明中的-55°是另一坐标基准）。载入时施加-35°，不改GLB。校正后的真实顶点边界为min=(-0.2365292758,-0.0000000132,-0.1705654529)、max=(0.2365290076,0.4440050117,0.1705653725)。不能用倾斜AABB旋转后的最低点替代真实底面，否则会悬空。测试读取实际GLB顶点核对最低点为0及底面法线向上。
- 落点继续使用现有地形最高支撑点和有效性检查，不能穿水面、设施或其他道具。足迹半径分别为0.82、0.88、0.36、0.22、0.28米，覆盖统一尺寸后的物体。为长柄农具扩大原有25样本放下区：前方1–3.2米、左右各1.5米；仍在输入时选点、命令中固定、不在重放时重选。
- 不平地面仍使用既有支撑检查。正立刚性篮子无法贴合任意起伏地面；最高点支撑会在低侧留下地形高差，此次验证的是截图所示近乎平坦落点，不宣称任意坡面完全贴合。

## 种子袋携带

种子袋和篮子统一使用`{itemId}`携带槽和相同拿起/换拿/放下事务。seedId属于物品本身，用于标签和播种，不再是另一种携带关系。地面实例直接移动到Camera，放下再回到物品根节点；没有held-seeds副本。携带种子袋正常保存，保持稳定ID、标签、位置及重放/回滚约束。原版本持久化时已清空临时seedId/bagId携带槽，因此正常schema9存档无需重置；不接受手工构造的旧临时携带格式。

道具允许放置在耕地和已有作物的地块上，不改变作物或耕地状态。锄头、耙子按最终平放姿态（柄沿世界 X 轴）的长宽矩形检查支撑与间距，两侧各留 0.03 m 余量，不再用全长半径的正方形排斥周围空间。其他道具保留原有保守占地范围。
