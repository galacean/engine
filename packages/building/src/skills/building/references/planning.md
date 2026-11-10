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
| `tip` | 两个数的数组 | [0, 0] |
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

下面一次 execute 就能建好一栋房子。先用 `tools.spatial.resolve` 解析落点，取它的水平坐标。Y 写 0，地形由场景宿主求解，不需要查询现有建筑的高度。

```js
const scene = "<project.json 的 scene 字段>";
// 复用真实的资产库路径。这里只复用路径，不是把那个建筑的几何复制成模板。
const groups = await editor.component.query({ scene, type: "BuildingGroupComponent" });
const { props } = await editor.component.read({ scene, id: groups[0].id });
const library = props?.assetLibrary;
if (!library || typeof library !== "object" || !("$ref" in library) || typeof library.$ref !== "string")
  throw new Error("没有找到资产库");

const generated = await tools.building.generate({
  generator: "European.buildHouses",
  parameters: {
    id: "small-house-1", seed: 17, height: 3.2,
    rectangle: { center: [0, 0], size: [6, 5], rotation: 0 },
    roof: { height: 0.5 }
  },
  source: { id: "small-house-frame", name: "小房子", assetLibrary: library.$ref }
});
const asset = await editor.asset.create({ path: "Building/SmallHouse.prefab", type: "Prefab", content: generated.content });
return await editor.entity.create({ scene, name: "小房子", prefab: asset.path, position: [x, 0, z], rotation: [0, 0, 0] });
```

- 生成接口是纯计算，不修改场景，也不发布或渲染。
- 资产创建和实例化在同一个 execute 的 Editor 事务中提交，失败时整体回滚。
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
