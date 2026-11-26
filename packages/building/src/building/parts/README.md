# 建筑基础构件

当前公开入口是 `architecture/index.ts`，由 `parts/index.ts` 和 `@galacean/seed-world-systems` 导出。

生产与演示都运行这一流程。Seed World 建筑项目使用 v8-groups 存档键，只加载该版本。测试验证功能、资源生命周期、编辑保存及版本隔离。

```ts
const draft = Building.European.buildHouses({
  id: "house", seed: 17, height: 4,
  rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
  roof: { height: .5, profile: 0, ridge_length: .5, eave: .2 }
});
const manager = BuildingManager.forScene(scene);
manager.assets = buildingKitPrefab;
manager.camera = camera;
manager.terrain = (x, z) => terrainHeight(x, z);
const root = manager.create(parent, draft);
await manager.flushAsync();
```

场景宿主在作者 Scene 解析完成后调用 `BuildingManager.forScene(scene)`，由它收集已启用的构件。构件启用时只向已有管理器注册，不在解析期间插入管理器根节点；后续启停、跨场景移动和删除由原生生命周期维护。Seed World 已由 `NativeBuildingHost` 完成绑定，业务脚本复用该管理器。

LLM 的 `execute` 通过 `tools.building.generate({generator:"European.buildTower", parameters:{id:"tower",height:9}, source:{id:"tower-frame",assetLibrary:"项目中实际资产库路径"}})` 获取完整 Prefab Source。将返回的 `content` 原样交给 `editor.asset.create`，再用 `editor.entity.create` 实例化；它们使用原生编辑事务。生成 API 不创建场景对象，不保存第二份生成器参数；游戏 Script 才使用上面的模块导入和运行时 CRUD。

## 流程

1. `Building.European.buildHouses/buildTower/buildWall/buildFence/buildSteps`（`application/European.ts`）把风格参数写成核心草稿 `BuildingDraft`（即核心层的 `BuildingCoreDraft`）：组、构件和连接，纯 JSON，不创建 Engine 对象。
2. `BuildingManager` 把草稿交给 Worker（自定义地形函数和测试在主线程）。核心层 `designBuildingCore` 按构件类型设计几何、运行连接规则并铺设单元；`render/CoreBuilding.ts` 准备远景、结构查询和调色板，并编译常驻细节。
3. 组件 `BuildingGroupComponent`、`BuildingPartComponent` 保存作者定义和连接；派生构件不写回 Source，每次重新求解。

核心层的概念和规则见 [../core/README.md](../core/README.md)，各构件类型的做法和与线上的差别见 [../MIGRATION.md](../MIGRATION.md)，编辑和保存的边界见 [../components/README.md](../components/README.md)。

## 建筑壁灯贴图

加载和建筑编辑共用场景的壁灯贴图缓存。Worker 按实际外墙、灯位和实例的世界尺度计算 R16F 光晕。相同布局复用已完成或正在生成的图块。无灯建筑跳过烘焙，场景销毁时释放资源。导入模型需要提供可接收光照的外墙和灯位描述。

墙面使用独立的 lightmap UV，不受底色贴图平铺影响。相同壁灯在平墙上的局部光晕可共享一个图块，各墙将自己的灯位对齐到图块中心。圆塔沿实际外墙的圆弧连续展开。旋转、移动或正向非均匀缩放建筑后，系统按新布局查询缓存。

灯芯和墙面使用各盏灯自己的线性 HDR 参数。默认壁灯沿用原暖黄色。调用 `BuildingManager.listWallLamps(frame)` 读取灯具和原色，`setWallLampHDR(frame, lampId, rgb)` 调整颜色与强度，省略 RGB 恢复原色。调色不触发烘焙。可通过 `wallLightmapInventory` 和 `onWallBakeEvent` 查看图块准备情况与缓存命中。

## 脚本里的网格

`createBuildingPatch(engine, {segments, domain, point})` 按参数曲面生成一块网格，`buildingMeshData(mesh)` 读出网格的位置、UV 和索引。旧的通用构件 API（Point/Path/Mesh 支撑、`buildingPlacementAlgorithms` 等）已随线上路径删除。
