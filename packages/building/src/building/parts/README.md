# 建筑基础构件

当前公开入口是 `architecture/index.ts`，由 `parts/index.ts` 和 `@galacean/seed-world-systems` 导出。

生产与演示都运行这一流程。Seed World 建筑项目使用 v7-groups 存档键，只加载该版本。测试验证功能、资源生命周期、编辑保存及版本隔离。

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

## 脚本里的网格

`createBuildingPatch(engine, {segments, domain, point})` 按参数曲面生成一块网格，`buildingMeshData(mesh)` 读出网格的位置、UV 和索引。旧的通用构件 API（Point/Path/Mesh 支撑、`buildingPlacementAlgorithms` 等）已随线上路径删除。
