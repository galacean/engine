# 风格生成与持久创建

## 生成器参数

`Building.European.buildHouses({id,seed,height,rectangle|circle,roof,wall,roofStyle,attachments})` 返回 groups、parts、relations。roof 是 0..1 的控制参数，不是米制的 rise 或 pitch。rectangle 和 circle 使用米和弧度。

完整参数见 [European 声明](declare/engine/node_modules/@galacean/seed-world-systems/shared/tiny-glade/parts/architecture/European.d.ts)。屋顶、台基和楼层参数见 [ProfileParameters 声明](declare/engine/node_modules/@galacean/seed-world-systems/shared/tiny-glade/runtime/ProfileParameters.d.ts)。

- `buildTower` 使用相同的墙和屋顶能力，默认圆形，墙体较高。
- `buildWall` 生成独立墙条。
- `buildSteps({id,width,rise,run,count})` 生成台阶 Path。

基础构件字段有 id、group、type、`support:{generator,params}`、`algorithm:{type}`、unit、params。组只存 seed 和调色身份。关系存 from 和 to 的 part 与 boundary，以及 rule。自定义生成器直接输出同样的结构，不需要经过欧式入口。

## 在 execute 中持久创建

`tools.building.generate` 内部调用上述生成器和 `buildingDraftSource`，返回 Prefab JSON。

先查询一个现有的 BuildingGroupComponent，读取 `props.assetLibrary.$ref`，复用真实的资产库路径。这里只复用路径，不是把那个建筑的几何复制成模板。

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
// 读取当前 Editor 声明，确定 scene、parentId 和 transform 字段。
```

- 生成接口是纯计算，不修改场景，也不发布或渲染。
- 资产创建和实例化在同一个 execute 的 Editor 事务中提交，失败时整体回滚。
- 没有 `component.plan`，不要同时保存风格参数和最终构件这两份数据。
- 后续修改高度或窗户时，直接更新实例的 BuildingPartComponent，不保存另一份 plan，也不用启动时重建脚本。需要重新生成时，由作者操作明确替换基础构件。
- 可复用的 Prefab 通常保持局部原点，在 `entity.create` 中设置实例位置。不要把同一个世界位置同时写入两处。

## 检查本次发布

在下一次 execute 中：

1. 用 `runtime.entity.children` 查询场景根节点，找到包含 `BuildingManager` 的实体。
2. 用 `runtime.component.query` 取得真实的数值 ID。
3. 用 `runtime.component.read({componentId,fields:["buildStatus"]})` 读取状态。

| 字段 | 含义 |
| --- | --- |
| `bound` | 已绑定场景宿主 |
| `pending` | 作者输入、地形或当前细节仍在加载 |
| `generation` | 已发布分组替换的累计次数 |
| `errors` | 为空且 pending=false 时，才能认为当前结果已完成 |
| `diagnostics` | 未实施构件的原因，要同时检查 |

运行时读取会把数组序列化成 `{length,items,truncated}` 摘要。检查 `errors.length === 0`，具体错误看 `errors.items`。

不要尝试调用组件的方法。运行时查询不会调用 `errors()` 或 `metrics()`。也不要把当前可见的旧画面当成本次修改成功。
