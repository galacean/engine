# River 阶段 B：显式河槽修改与共同撤销

## 基线与范围

- 阶段 A：`e5a61e197`，固定 mock 地形上的单河段编辑、草稿和已发布输入历史。
- SSR 修复：`bbdd050cc`，默认接收者粗糙度不再引用未声明的光学深度变量。
- 本阶段：单 River、独立不可变 Base Terrain、可序列化 River modifier、派生河床及水体共同发布。
- 入口仍为 `#showcase-river`，选择“河流编辑与河槽”。其他标定、弯道、浅滩与桥岸场景沿用已有流程。
- 不包含多河流 modifier 排序、通用 World modifier 框架、SeedWorld 接入、流体模拟、移动端优化或大型地形分块上传。

## 实施顺序与数据关系

1. `RiverTerrainModifier` 保存雕刻意图，`RiverTerrainModifierCompiler` 从 Base 纯函数计算 Derived Terrain。
2. `RiverEditSession` 维护草稿、联合发布候选和历史；水体编译显式使用候选地形。
3. Demo 准备隐藏的候选河床网格及 Water Host 事务；全部准备成功后同步切换河床、水体与编辑状态。
4. 同一编辑面板提供 modifier 参数、应用、取消、共同撤销/重做、JSON 保存与横断面对照。
5. CPU/Host 测试和生产构建中的内置浏览器验证。

```text
Base Terrain + River points + optional modifier
                    ↓
              Derived Terrain
                    ↓
    visible bed + River compilation + query
```

Base 从外部快照捕获并冻结；不能用前一次 Derived 作为下一次雕刻输入。修改 modifier 或控制点只更新草稿，点击“应用河流与河槽”才编译和发布。

## 雕刻规则

当前 modifier 固定 `schemaVersion: 1`、`mode: carve-only`：

| 字段 | 单位/范围 | 默认 |
| --- | --- | --- |
| `targetBedDepth` | 米，0.1–10 | 2 |
| `bedWidthRatio` | 平底宽度/水面全宽，0.1–1 | 0.6 |
| `bankWidth` | 水面半宽之外的岸坡过渡宽度，米，0.1–10 | 2 |
| `falloff` | `linear` 或 `smoothstep` | `smoothstep` |

按 polyline 段投影插值水面高程和水面宽度，目标床高 = 水面高程 − 目标床深。平底外根据横向距离过渡回基础高度。各段的候选高度与 Base 取最小值：只挖不填，重叠影响不累积挖深，端点使用圆形影响区。

目标床深是作者意图。实际水深由已发布水面与实际派生河床查询计算；已有深池不会被填高，因此两者可能不同。修改微法线或 Look 不修改 modifier/地形。

重算区域记录旧、新 modifier 范围的并集，并扩展一个网格单元、裁切到 Base 边界。当前 mock 实现复制完整高度网格、在新影响范围内求值并整体重建可见网格；**尚未实现局部上传或分块增量编译**。旧河槽直接来自 Base 的拷贝而恢复。

## 发布、撤销与保存

- 河床可见网格与 River 编译读取同一个候选 `WaterTerrainSnapshot`。
- `commitRiverEdit` 在同一同步调用中执行可回退的河床切换、已有 Water Host 的可回退提交、编辑历史提交，中间无异步等待。渲染下一帧前完成整体切换。
- 准备失败或取消会销毁候选资源并保留旧水体、旧河床和旧查询；过期任务提交前检查身份，不能覆盖新草稿。
- 删除水体是可撤销的编辑：清除 modifier，恢复 Base，删除 Water body。关闭“雕刻河槽”再应用则仅移除 modifier，保留水体。
- 撤销/重做保存作者输入，重新从同一 Base 派生完整结果。相同地形内容复用已有快照/网格。
- `publicationRevision` 是单调发布序号；`terrain.revision` 标识具体地形快照。恢复 Base 使用原始 Base revision，不用其大小判断任务新旧。
- 内容 hash 不包含快照 id/revision，撤销后地形内容相同即可恢复同一 hash。
- 编辑 JSON 升级为 V2，保存 Base 的 id/revision/contentHash、控制点、`riverEnabled` 和 modifier；不保存派生高度数组。V1 文档兼容导入并升级为无 modifier 的 V2。
- 未知字段、非法参数、Base 不匹配或越界输入不替换有效状态。导入仅生成草稿，仍需显式应用。

## Demo 接口

沿用 `window.riverDemo.editor` 的控制点、应用、取消、撤销/重做和 JSON API，新增：

- `setTerrainModifier(modifier?)`：修改/移除草稿 modifier。
- `sampleTerrainAt(x, z)`：返回基础和已发布地形高度 `{ base, published }`。
- `snapshot.derivedTerrain`：当前派生快照身份及内容 hash。
- `snapshot.affectedBounds`：最近一次成功发布的旧、新影响并集。

`riverDemo.snapshot.terrainContentHash` 来自当前可见河床；可与 editor 派生 hash 比较。面板横断面同时显示 Base、已发布河床和草稿水面。“吸附到基础地形 + 偏移”始终使用 Base，避免把已雕刻结果再次反馈为作者输入。

## UE 源码对照

本地 UE 5.8.2：

- `WaterLandscapeBrush.cpp:487`，`AWaterLandscapeBrush::SetTargetLandscape`：在 Landscape 的独立 Water edit layer 中添加 brush。这里采用独立 modifier + 不可变 Base，不引入 UE 编辑器/RenderTarget 管线。
- `WaterLandscapeBrush.cpp:512`，`OnEditLayersMerged`：高度图合并后触发 Water Info 更新。这里提前编译候选水体，在一次同步发布中一起更新河床、水体和查询。
- `WaterBodyRiverComponent.cpp:384`，`GetRiverDepthAtSplineInputKey`：从 spline metadata 读取作者河深。这里将目标床深存于 modifier，实际查询仍依据派生河床，避免目标值冒充真实水深。

这些是职责与顺序参考；本实现的距离 falloff 和 carve-only 公式不宣称逐像素复刻 UE brush。

## 验收

自动化测试入口：`tests/runtime/RiverTerrainEditing.test.ts`，并回归 RiverEditSession、RiverTerrainCompiler、RiverQueryService、RiverMaterialFactory、RiverHighDemo、RiverDemoLookPanel 与 WaterSceneRuntimeHost。

必须检查：Base 不变、重复应用幂等、移走恢复、移除 modifier/删除水体恢复、联合撤销重做、JSON 兼容及原子失败、旧任务拒绝、水面与查询使用同一派生河床、暖机后至少十次编辑和删除重建资源稳定。

生产构建与内置浏览器实测记录：`/Users/xingyi/Documents/Codex/2026-09-10/river-edit-plan-b/acceptance.md`。失败注入记录与正常运行结果分开；构建通过不代替运行时验收。

## 单河流编辑约束收尾

- 编辑草稿缓存 `diagnostics`，使用与 High 生产网格相同的采样、有限 miter 拼接和三角形数据；没有另画一条近似河岸作为检测依据。
- 面板显示选中点上、下游高程范围。锁定时禁用高程输入；解锁仍须遵守沿下游不升高的约束。无可用区间时提示相邻点冲突，不自动修正作者数据。
- `error` 与 `warning` 分开展示。错误点标红，河岸交叉/急弯拼接标橙。水面折叠或退化会在编辑应用前拒绝，保留草稿和上一有效发布；警告仍可通过 `editor.snapshot.diagnostics` 查询。
- 普通宽弯道的转角偏移沿直线采样段连续插值，避免仅在转角点应用 miter 而令邻接内岸网格倒折。无法安全生成的急弯不会通过放宽校验强行发布。
- `editor.shiftElevation(delta, includeLocked = false)` 将整条河流升降到草稿，保留沿程高差和锁定标记。默认只要存在锁定点就拒绝整段操作；明确选择包含锁定点后统一移动全部点。应用、取消、共同撤销/重做沿用同一链路。
- 引擎 Overlay 中修复 GLBuffer 上传抛异常时的句柄回收、Buffer 构造失败时的资源登记撤销和未计入内存的清理。上一轮人工 bufferData 异常的泄漏已通过连续 10 次浏览器注入回归。
- 本轮验收：`/Users/xingyi/Documents/Codex/2026-09-10/river-editor-constraints/acceptance.md`。仍不包含自由的上坡水面、三轴拖拽、复杂河岸布尔重构、分块局部上传或 GPU 驱动内存耗尽恢复。
