# 原生 Water（M0/M1）

复用既有 Lake/River/Ocean 作者数据、Compiler、Backend 与 RuntimeHost；组件保存不可变资源引用和实例设置，运行缓存不入档。每 Scene 一个 WaterSystem，加载 Scene/Prefab 前 registerNativeWater()。

```ts
registerNativeWater();
const system = scene.createRootEntity("Water System").addComponent(WaterSystem);
system.camera = camera;
const body = scene.createRootEntity("Lake").addComponent(WaterBodyComponent);
await body.configure({ asset: new WaterBodyResource(engine, definition.asset),
  look: new WaterLookResource(engine, definition.look), quality: new WaterQualityResource(engine, definition.quality) });
const api = new WaterAPI(system);
```

类型从 shared/water/native 导入；完整有效输入见 tests/fixtures/nativeWaterFixtures.ts。有限水体支持平移/Y旋转，不支持缩放/倾斜；Ocean 每Scene最多一个活动实例。Camera 必须归当前Scene，发布后不能换绑。湖/河需要宿主已接受地形；terrain.modifiedByWater=false，组件发布不表示修改地形。

## 事务、启禁用与所有权

configure / API 先校验、异步准备，再原子接受；失败保留旧配置，新请求取消旧请求，销毁加入晚到/退休清理。ready 等待属性/启禁用；前置校验拒绝ready、记录lastError并取消旧准备，Scene解析也同步抛错。配置准备期间延后Transform自动刷新，接受后使用最新配置/变换。

| 操作 | 已发布行为 |
| --- | --- |
| settings.visible=false | 隐藏但保留查询 |
| setEnabled=false | 退出运行/查询，保留作者资源可恢复 |
| remove | 销毁组件并等清理，保留调用方 Entity |
| dispose / Entity或Scene销毁 | 取消准备并清理拥有资源 |

登记与运行分开。禁用组件及非激活父节点下后来加入的Entity/Prefab也可发现，不依赖Awake、不激活实例；已登记采样/逐帧不遍历场景。禁用/移除同步退出查询并推进revision，清理延迟/失败不回滚已发布状态。共享纹理按owner释放；resource.kind轻量读取，data独立完整快照仅用于编辑/导出。

prepareBatch(updates,signal,removals) 支持同Scene的新增/修改/移除组件，返回同步commit和异步rollback；宿主等Terrain等候选全部准备成功后共同提交，任何失败回滚。system.ready等待排队准备；外部批次的组件ready要等提交/回滚，不能在提交前等待它。updateMany只批改已有ID，每ID一次，不包含批量创建/删除。

## 资源与存档

Body/Look/Quality继承ReferResource；ResourceManager加载type:WaterResource并缓存.water文件。格式 `{version:1,kind:"body"|"look"|"quality",data}`；serializeWaterResource/parseWaterResource往返，TypedArray编码为{$waterArray,values}，派生Ocean transfer不保存。waterBodyComponentData输出原生ComponentSchema，沿用Scene/Prefab的entities/components/refs和$ref/$component；宿主保存资源URL与Scene，不另建世界存档服务。

## API与Agent

list 仅返回现有元数据，不再包含 definition；需要编辑或导出完整定义时，先 list 获取 ID，再 get 读取完整 definition 并保留 TypedArray 标签交回 update。

execute提供list/presets/get/capabilities、create/update/updateMany/setEnabled/remove、sample/sampleDrops/verify和resolveRiver。resolveRiver成功仍为applied:false，宿主接受挖低需求后才能发布。结果包含ok/revision/可序列化值或结构化错误，命令接收不等于应用；查询读取已发布状态，每字段检查actual/proxy/unsupported。Ocean datum不含Gerstner，代理岸距/深度不可当实测，unsupported不虚构。

createWaterAgentPackage供现有AgentLoop definition/tools，Knowledge与操作契约由WaterAPI拥有；声明从WaterAPIContract传递类型生成，不修改应用Prompt。给模型摘要ID/版本/采样，不输出完整Terrain数组。

```sh
node world/scripts/run-engine.mjs pnpm --dir world-gallery water:native-api:generate
node world/scripts/run-engine.mjs pnpm --dir world-gallery water:native-api:check
```

generate通过WORLD_GALLERY_SOURCE_ROOT同步权威源码，--check只读；禁止手改WaterAPIDeclarations。作者编辑/同床发布见 [M1_AUTHORING](M1_AUTHORING.md)；阶段记录见 [M0](M0_IMPLEMENTATION.md)/[M1](M1_IMPLEMENTATION.md)，当前验证见 [PR记录](../../../demos/terrain/seed-world-planner/V2_IMPLEMENTATION.md)。

M0/M1不实现出水口CRUD、有限水量、降雨/灌溉演算或游泳；时间、Terrain接受与存储由宿主负责。后续保留调水位一次补排、后台时间继续、普通湖盆编辑保水位和撤销保当前水量的决策，不宣称已执行。真实模型、Editor面板、美术、性能和移动端分别验收。
