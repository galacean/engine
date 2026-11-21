# 风格生成与持久创建

## 生成器参数

`Building.European.buildHouses({id,seed,height,rectangle|circle,roof,wall,wallStructure,roofStyle,foundation,plaster,floors,attachments})` 返回草稿 `{groups, parts, connections}`。`height` 是墙高，单位是米。rectangle 和 circle 使用米和弧度。`wallStructure: "timber"` 生成木墙。`foundation: {height, mode: "solid"|"pillars", plaster?}` 生成台基。`plaster: {wear, color}` 给墙抹灰。`floors: {interval}` 加腰线。

`roof` 必须是对象。下面的字段都可选，前四个是 0..1 的控制量，不是米，也不是角度。超出范围时，报错 `Roof control must be in [0,1]`。

| 字段 | 范围 | 默认值 |
| --- | --- | --- |
| `height` | 0..1 | 0.35 |
| `ridge_length` | 0..1 | 0.6 |
| `eave` | 0..1 | 0.3 |
| `profile` | 0..1 | 0 |
| `tip` | 两个数的数组。只用于圆形房屋，移动屋顶尖端；矩形坡屋顶必须是 [0, 0] | [0, 0] |
| `ridge_direction`、`flat_rim` | 开关 | 0 |
| `color` | 整数 0..12 | 2 |

不传 roof 时使用默认值。不要传其他字段，否则会报 `Unsupported roof field`。

完整参数见 [European 声明](declare/engine/node_modules/@galacean/seed-world-systems/packages/building/src/building/application/European.d.ts)。屋顶、台基和楼层参数见 [ProfileParameters 声明](declare/engine/node_modules/@galacean/seed-world-systems/packages/building/src/building/runtime/ProfileParameters.d.ts)。

- `buildTower` 使用相同的墙和屋顶能力，默认圆形，墙体较高。
- `buildWall` 和 `buildFence` 生成独立墙条和栅栏。
- `buildSteps({id,width,rise,run,count})` 生成台阶。

构件字段有 id、group、type、`geometry:{generator,params}`、`algorithm:{type,params}`、unit。组存 id、seed 和共享值 `shared`。连接是 `{kind:"attach", id, guest, hosts:[{part}]}` 或 `{kind:"join", id, parts:[a,b]}`，可带 `rule` 和 `params`。自定义草稿直接写同样的结构，见[结构](structure.md)。

## 在 execute 中持久创建

`tools.building.generate` 内部调用上述生成器和 `buildingDraftSource`，返回 Prefab JSON。

在 Seed World 中，使用内置建筑资产库 `Building/Units/building-kit.prefab`。下面以「在我面前建一座小房子」为例，在一次 execute 内选地并创建房子。对于未指定门窗或其他构件的普通小房子，直接使用示例的屋身与屋顶参数，省略 `attachments`。明确要求加门窗时，按[墙](skills/building/references/wall.md)确定安装位置和尺寸。

```js
const scene = "<project.json 的 scene 字段>";
const { anchor } = await tools.spatial.resolve({
  anchor: { kind: "viewer" },
  relation: { kind: "front" },
  placement: { snapTo: "terrain", avoidWater: true }
});
if (anchor.kind !== "position") throw new Error("没有解析到建筑位置");
const { x, z } = anchor;

const generated = await tools.building.generate({
  generator: "European.buildHouses",
  parameters: {
    id: "small-house-1", seed: 17, height: 3.2,
    rectangle: { center: [0, 0], size: [6, 5], rotation: 0 },
    roof: { height: 0.5 }
  },
  source: { id: "small-house-frame", name: "小房子", assetLibrary: "Building/Units/building-kit.prefab" }
});
const asset = await editor.asset.create({ path: "Building/SmallHouse.prefab", type: "Prefab", content: generated.content });
return await editor.entity.create({ scene, name: "小房子", prefab: asset.path, position: [x, 0, z], rotation: [0, 0, 0] });
```

- 生成接口是纯计算，不修改场景，也不发布或渲染。
- 资产创建和实例化在同一个 execute 的 Editor 事务中提交，失败时整体回滚。
- 贴地房屋的根节点 Y 写 0，场景宿主按占地采样实际地表，包括山坡和高地。要在当地地面上抬高房身，设置 `foundation.height` 并按需选择实心台基或柱式台基。
- 项目使用自定义建筑库时，从项目资产或已有建筑的 `assetLibrary` 取得对应虚拟路径。
- 没有 `component.plan`，不要同时保存风格参数和最终构件这两份数据。
- 后续修改高度或窗户时，直接更新实例的 BuildingPartComponent，不保存另一份 plan，也不用启动时重建脚本。需要重新生成时，由作者操作明确替换基础构件。
- 可复用的 Prefab 通常保持局部原点，在 `entity.create` 中设置实例位置。不要把同一个世界位置同时写入两处。

## 检查本次发布

在下一次 execute 中读取场景 BuildingManager 的 `buildStatus`：

```js
const roots = await tools.runtime.entity.children({ limit: 100 });
for (const item of roots.entities) {
  if (!item.entity) continue;
  const found = await tools.runtime.component.query({ entityId: item.entity.entityId, type: "BuildingManager" });
  if (!found.components.length) continue;
  return (await tools.runtime.component.read({ componentId: found.components[0].componentId, fields: ["buildStatus"] })).values;
}
```

| 字段 | 含义 |
| --- | --- |
| `bound` | 已绑定场景宿主 |
| `pending` | 作者输入、地形或当前细节仍在加载 |
| `generation` | 已发布分组替换的累计次数 |
| `errors` | 为空且 pending=false 时，才能认为当前结果已完成 |
| `diagnostics` | 未实施构件的原因，要同时检查 |

运行时读取会把数组序列化成 `{length,items,truncated}` 摘要。检查 `errors.length === 0`，具体错误看 `errors.items`。

不要尝试调用组件的方法。运行时查询不会调用 `errors()` 或 `metrics()`。也不要把当前可见的旧画面当成本次修改成功。

## 常用外观配色编号

| 参数 | 范围 | 常用色板说明 |
| --- | --- | --- |
| `wallColor` | `0..12`（默认 `0`） | `0 / 4 / 10 / 12` 暖砂浅陶砖；`1 / 5` 暖红褐/红砖（需要红砖外观时选 `1` 或 `5`）；`2 / 7` 深灰石砖；`3 / 6 / 8 / 9` 浅灰石砖；`11` 中灰石砖 |
| `roof.color` | `0..12`（默认 `2`） | `0` 暖陶红瓦；`11` 深红褐瓦；`1 / 8` 棕褐瓦；`2 / 9 / 12` 蓝灰/石板灰瓦（默认）；`3 / 4 / 6` 绿灰瓦；`5 / 7 / 10` 灰褐瓦 |
| `woodColor` | `0..10`（默认 `0`） | `0` 暖木棕（默认）；`1` 深棕；`3` 红木褐；`4` 浅木；`9` 偏暖红木 |

## 完成判定与停止规则

- **何时停止**：外层 `execute` 返回 `committed` 且无 `runtimeErrors`，随后读取 `BuildingManager.buildStatus` 显示 `pending === false`、`errors.length === 0`（且 `diagnostics` 无失败项），即证明建筑已生成并完成发布；直接向用户汇报位置与特征即可。
- **不要无止境拆解验证**：不要逐个遍历子节点的 `BuildingPartComponent` 反查渲染网格，也不要把 `tools.runtime.*` 返回的数字 `componentId`/`entityId` 传给 `editor.component.*`/`editor.entity.*`。
