# M1 河溪湖泊作者接口

坐标/宽深/岸坡/水位均为米，世界X/Z平面、Y高程。作者参数是存档对象，Terrain床面/网格/纹理/缓存是派生结果；M1固定作者水位，不包含水量守恒、出水口或降雨演算。

## 解析与共同发布

WatercourseAuthoring的points保留稳定id/x/z/elevation?/width/depth，缺省高程按输入地形解析；sections稳定连接锚点，form为auto/slope/waterfall/steps。大落差不强制变普通陡坡，显式落水也必须carve:true才可挖低，不填土或造堤/岛。

1. `api.execute({operation:"resolveRiver",input:{authoring,terrain}})` 返回解析与terrainModification；ok:true/applied:false仅表示规划成功。
2. 宿主接受挖低需求、准备最终Terrain；River用createWatercourseRiver，Lake用createLakeFromTerrain/createLake及现有湖盆契约。
3. 原生组件经system.prepareBatch准备，Terrain/布局/作者全部成功后同步commit；失败/取消rollback。期间查询旧版，sample/verify核对共同revision与actual床高/水深。
4. sampleDrops单独查询水帘最近点/距离；水帘厚度、泡沫、粒子不算普通水深或湿区。

原生示例：demos/water/tests/browser/native-m1.ts；解析/呈现共享ResolvedWatercourse，普通河段、阶梯平台、水帘使用独立几何。

## Planner编辑与存档

普通入口window.seedWorldPlanning和规划页window.worldPlanningPage提供query/inspect/dispatch/createWater/removeWater；二维图须先打开白盒/3D才有已发布查询。

```ts
const api = window.seedWorldPlanning!;
const fields = api.inspect(id).components.find(c => c.type === "rivers")!.values;
const receipt = await api.dispatch([{ op:"set", entity:id, component:"rivers",
  values:{points:fields.points.map(p=>({...p,width:1,depth:0.1})),bankWidthM:1} }]);
if (receipt.status !== "accepted") throw new Error(receipt.message);
const sample = api.sampleWater(x,z,id); // 核对revision及每字段quality
```

createWater({kind,id,parameters})：river:authored:前缀提供points/可选sections；lake:authored:提供shoreline/referenceLevel。湖岸记录{id,ring,x,z}，shore为外岸、其他环为岛洞，每环至少三点且隐含闭合。allowCarving:false读现有盆，true仅授权挖低；低于水面的岛洞不填土造干岛。

天然/手工水体统一dispatch，removeWater对天然禁用生成、对手工删作者实体。默认湖数1，可显式0；levelOffsetM只改水位，移动/删除/盆编辑从自然Terrain与有效作者修改重派生。没有湿区/岸顶不足拒绝，自动选址不足报告数量缺口。显示隐藏保留查询，enabled:false退出运行与查询。

作者参数、撤销历史和宿主场景同点接受；失败/取消/过期不推进已发布版本。存档经PlanningProjectStorage进入统一RuntimeProject，只保存Seed/作者参数/引用；项目版本由RUNTIME_PROJECT_SAVE_VERSION校验，作者统一规范化/严格校验，不设置Water专属门槛。撤销栈/派生缓存不入档；保存重放维持身份与结果。

## 落水外观与能力边界

sections.form和RiverDrop决定物理几何；可选Look.riverDrops仅描述水帘/泡沫/飞溅外观，不触发雕刻或改变查询。resolveRiverDropLook校验数值与稳定资源ID/SHA；无字段保留基础表现。Farmlands资源工厂由宿主注册，仅含drops的River租用落水贴图。水帘/泡沫网格与水雾/飞溅/水滴原生粒子共用同后端，阶梯每级有稳定drop ID；不是预览专用实现。

get读取definition，修改独立Look修订并用update/updateMany发布，不直接写材质。speed:0冻结纹理与粒子；foamOpacity/mistOpacity等只改外观，纹理/启用变化走资源事务。显隐停止清空/恢复发射；删除/回滚释放拥有网格/材质/粒子，不误释放借用纹理。不保存运行粒子。

API/Knowledge由WaterAPI、唯一命令类型由WaterAPIContract、生成声明由WaterAPIDeclarations拥有；确定性指令在tests/native/WaterInstructionSuite。真实模型统一后置，不用回放冒充模型验收。素材/Unity移植差异见 [落水来源](../resources/river/assets/drops/README.md)，Scene_Demo光照对照仅作用于独立预览；M2水量演算未实现。
