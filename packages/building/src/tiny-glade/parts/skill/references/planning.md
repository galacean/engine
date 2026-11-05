# 风格生成与设计

`Building.European.buildHouses({id,seed,height,rectangle|circle,roof,wall,roofStyle,attachments})` 返回 groups/parts/relations。roof 保留 dev/2.0 的 0..1 控制参数，不是米制 rise/pitch；rectangle/circle 使用米和弧度。

完整参数见 [European 声明](declare/engine/node_modules/@galacean/seed-world-systems/shared/tiny-glade/parts/architecture/European.d.ts)；屋顶、台基和楼层参数见 [ProfileParameters 声明](declare/engine/node_modules/@galacean/seed-world-systems/shared/tiny-glade/runtime/ProfileParameters.d.ts)。

buildTower 使用相同墙/屋顶能力，默认圆形、较高墙体。buildWall 生成独立墙条。buildSteps({id,width,rise,run,count}) 生成台阶 Path。

基础构件字段：id、group、type、support:{generator,params}、algorithm:{type}、unit、params。组仅存 seed/调色身份。关系存 from/to 的 part 与 boundary，以及 rule。自定义生成器直接输出同一结构，不需要经过欧式入口。

执行 `manager.create(parent,draft)`，在修改后的 `flushAsync()` 内完成设计/实施。没有 component.plan，不能同时保存风格参数和另一份最终构件作为两个真相源。若需重新生成，应由作者操作显式替换基础构件。

## Agent 持久化创建

`execute` 使用 `tools.building.generate`，其内部直接调用上述生成器和 `buildingDraftSource`，返回 Prefab JSON。先查询一个现有 BuildingGroupComponent，读取 `props.assetLibrary.$ref`，复用真实资产库路径；不是把该建筑的几何复制成模板。

```ts
const generated = await tools.building.generate({
  generator: "European.buildTower",
  parameters: {
    id: "new-tower", seed: 17, height: 9,
    circle: { center: [0, 0], radius: 2.5, phase: 0 },
    roof: { height: 0.8, ridge_length: 0 }
  },
  source: { id: "new-tower-frame", name: "圆塔", assetLibrary: libraryPath }
});
await editor.asset.create({ path: "Building/NewTower.prefab", type: "Prefab", content: generated.content });
// 随后用 editor.entity.create 的 prefab 字段引用该路径，并设置水平位置。
// 读取当前 Editor 声明确定 scene、parentId 和 transform 字段。
```

生成接口是纯计算，不修改场景。资产创建和实例化在同一个 execute 的 Editor 事务中提交；失败整体回滚。实例化后下一次 execute 再检查实际组件与运行错误。后续高度/窗户编辑直接更新实例的 BuildingPartComponent，不保存另一份 plan 或启动时重建脚本。

## 检查本次发布

下一次 execute 用 `runtime.entity.children` 查询场景根节点，找到包含 `BuildingManager` 的实体，再用 `runtime.component.query` 取得真实数值ID，`runtime.component.read({id,fields:["buildStatus"]})` 读取状态。`bound`表示已绑定场景宿主，`pending`表示作者输入/地形/当前细节加载仍未完成；`generation`是已发布分组替换的累计次数；`errors`为空且pending=false才可以将当前结果视为已完成。`diagnostics`应同时检查。运行时读取会把数组序列化成 `{length,items,truncated}` 摘要，检查 `errors.length === 0`，具体错误查看 `errors.items`。不要尝试调用组件的方法，或把当前可见旧画面当成本次修改成功。

Prefab根位置与实例位置是两种不同用途：可复用Prefab通常保持局部原点，在entity.create中设置实例位置。不要把同一世界位置同时写入两处。
