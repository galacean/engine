# 原生 Water（M0/M1）

复用既有 Lake/River/Ocean 作者数据、Compiler、Backend 与 RuntimeHost；组件保存不可变资源引用和实例设置，运行缓存不入档。每 Scene 一个 WaterSystem，加载 Scene/Prefab 前 registerNativeWater()。

```ts
registerNativeWater();
// The host owns the scene system and selects its camera before publishing bodies.
const system = scene.createRootEntity("Water System").addComponent(WaterSystem);
system.camera = camera;
const { shape, terrain } = createWaterCreationPreset("lake");
// Persist terrain as the ordinary JSON/Buffer pair, and load a native Water Material.
const body = scene.createRootEntity("Lake").addComponent(WaterBodyComponent);
body.authoring = {
  shape,
  terrain: { mode: "asset", description: bedDescription, heights: bedHeights },
  material
};
await body.ready;
```

`createWaterCreationPreset(kind)` is CPU-only and returns a fresh shape plus a matching computational bed for Lake/River/Ocean. It does not create visible terrain or carve it. `validateWaterShape`, `compileWaterShape`, `createWaterQualitySettings`, `patchWaterQualitySettings` and `validateWaterAuthoringSettings` remain the shared authoring boundary. `validateWaterWorldTransform(kind, connected, {position, rotationQuaternion, scale})` checks effective world placement, including parent transforms; quaternion order is XYZW.

Authoring is the public component input. Body/Look/Quality resources and `configure` remain low-level compiler/runtime bridges, not required project assets. Editor writes authoring through its Model transactions; direct Engine assignment is for pure Engine hosts.

`compileWaterConnectionGraph(inputs)` validates and compiles static author connections without Engine/GPU objects. Each input contains `id`, `shape`, an accepted `WaterTerrainSnapshot`, and `connections` with `id`, `targetId`, `section`, `transitionLengths`. It shares native connection facts, level/bed consistency, footprint checks and shore-field compilation. Scope and final world-transform validation remain with the caller; connected shapes are identity/world aligned. The accepted bed must cover the expanded shore field, not only the cross-section. The result is `{ byBody, hash, count }`; compilation does not modify inputs or terrain.

`system.resolveRenderOwner(entity)` returns the current WaterBodyComponent for a generated render descendant. Ownership comes from published render roots, not names. Staging roots, retired generations, hidden/disabled bodies and destroyed owners return `undefined`. This read does not allocate runtime resources or expose backend internals.

Native surface renderers consume the authored Shader for Lake, River and the Ocean near surface. Runtime geometry, query and optical bindings remain Water-owned; this does not make an arbitrary non-Water Shader compatible. Ocean assets must also provide a `WaterFar` SubShader. Far rings use a private shader derived from that authored region, preserving its specialized sampler budget. Replacing the asset without this region is rejected by `validateWaterShaderCapabilities` before publication. Native project textures are borrowed: Water releases its lease without destroying the asset.


类型从 shared/water/native 导入；完整有效输入见 tests/fixtures/nativeWaterFixtures.ts。有限水体支持平移/Y旋转，不支持缩放/倾斜；Ocean 每Scene最多一个活动实例。Camera 必须归当前Scene，发布后不能换绑。湖/河需要宿主已接受地形；terrain.modifiedByWater=false，组件发布不表示修改地形。

## 材质纹理

`createWaterMaterialDefaults("lake" | "river" | "ocean")` 返回普通 Material 文件，全部纹理槽为 `{type:"Texture",value:null}`。`WATER_MATERIAL_TEXTURE_SLOTS` 提供 2 / 3 / 5 个槽位的属性名、分组和颜色空间，`validateWaterMaterialTextureMetadata` 供保存前校验。Editor 预设显式绑定默认 Texture，纯 Engine 调用方使用 `material.shaderData.setTexture(slot, texture)`；清空为 `null`。Material 入口不会加载或回填默认图。示例项目的 .mat 使用普通 `{url:...}` 引用并显式提供 8 张 KTX2；归档 Drops 图只供既有低层示例按需使用。

仅传 `WaterLookResource` 的运行时兼容入口保留原有预设资源：Lake/River 按需取得资源租约，Ocean 的纹理库由 WaterSystem 借用并在运行时卸载时释放。加载晚到也加入卸载等待。配置同时提供 Material 和 Look 时，以 Material 为准，显式空槽保持为空。

法线槽要求 linear，焦散、Ocean 泡沫及交界噪声要求 sRGB；普通 Texture2D 图片、任意合法尺寸及原生采样设置均可，不要求完整 mip 链或特定来源。Water 不修改共享图片的采样设置。空法线层保持平坦，其他空槽关闭对应贡献。原地像素更新直接作用于现有 GPU 纹理，替换 Texture 或调整采样设置会在下一次 Engine 更新时刷新派生绑定。多个水体共享材质时共同更新。

Ocean 近景实际采样作者 roughWaves；远景保持原有不采样图片的低频材质模型，法线方差是该模型的固定近似假设，不是对任意用户图片测得的统计值。roughWaves 为空时关闭该方差贡献。近景过渡与远景使用同一低频闭包；远景不包含焦散、泡沫和交界效果。Lake/Ocean 保持已有质量裁剪；River 既有实现仅支持 High，低档请求失败时保留已发布状态。本期普通 River 不提供 Drops 材质参数，显式启用返回 `NOT_SUPPORTED`；低层 Drops 实现不变。

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

Source 的 `authoring.terrain` 明确选择 `{mode:"host"}` 或 `{mode:"asset",description:{$ref:"床面.json"},heights:{$ref:"床面.bin"}}`。host 模式使用宿主本次接受的 Terrain；asset 模式由原生 JSONAsset 和 BufferAsset 提供共享输入。描述文件不保存资源路径，两条依赖都位于 Scene/Prefab 的原生引用位置。两种来源互斥，不回退到隐含平底。

高度数据使用 float64-le，保留米制数值、网格起点、两个方向的采样间距、插值方式与 refinement。描述记录版本、长度及 SHA-256；错误配对、非法数值和不支持的范围在接受前拒绝。通过 `writeWaterTerrainAssets` 在同一次公共作者事务更新两个资产，支持撤销/重做和保存重开。复用原生 Loader，不注册 WaterResource 文件类型或专用扩展名。共享内容通过弱缓存复用已校验的不可变采样快照，组件持有该快照；JSON/Buffer 沿用引擎 EngineObject 生命周期，不伪造 ReferResource 引用计数。

Body/Look/Quality 仍是编译器和低层运行 API 使用的内部资源。派生 Mesh、atlas、Ocean transfer 和渲染缓存不进入 Source。`waterBodyComponentData` 继续使用原生 Scene/Prefab 编码。

## API与Agent

list 仅返回现有元数据，不再包含 definition；需要编辑或导出完整定义时，先 list 获取 ID，再 get 读取完整 definition 并保留 TypedArray 标签交回 update。

execute提供list/presets/get/capabilities、create/update/updateMany/setEnabled/remove、sample/sampleDrops/verify和resolveRiver。resolveRiver成功仍为applied:false，宿主接受挖低需求后才能发布。结果包含ok/revision/可序列化值或结构化错误，命令接收不等于应用；查询读取已发布状态，每字段检查actual/proxy/unsupported。Ocean datum不含Gerstner，代理岸距/深度不可当实测，unsupported不虚构。

createWaterAgentPackage供现有AgentLoop definition/tools，Knowledge与操作契约由WaterAPI拥有；声明从WaterAPIContract传递类型生成，不修改应用Prompt。给模型摘要ID/版本/采样，不输出完整Terrain数组。

```sh
node world/scripts/run-engine.mjs pnpm --dir world-gallery water:native-api:generate
node world/scripts/run-engine.mjs pnpm --dir world-gallery water:native-api:check
```

generate通过WORLD_GALLERY_SOURCE_ROOT同步权威源码，--check只读；禁止手改WaterAPIDeclarations。作者接口见本目录的 `WaterAuthoring.ts` 与 `Watercourse` 类型。

M0/M1不实现出水口CRUD、有限水量、降雨/灌溉演算或游泳；时间、Terrain接受与存储由宿主负责。后续保留调水位一次补排、后台时间继续、普通湖盆编辑保水位和撤销保当前水量的决策，不宣称已执行。真实模型、Editor面板、美术、性能和移动端分别验收。
