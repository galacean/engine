# Seed World Knowledge

Choose the relevant system below and read its README before using unfamiliar capabilities. Each README contains a Usage Guide and an API Reference Index. Read only the declarations needed for the next action. Published document links use project-root paths and can be passed directly to read. Reuse already read information during the task.

Only the API links in the current indexes declare this host's callable capabilities. Domain guides describe the broader system; an API mentioned in their background but absent from the current index is unavailable here. Follow exact declaration links instead of inventing file paths or repeatedly reading unavailable APIs.

In execute, these world APIs live under `tools`, for example `await tools.world.parameters.query(...)`. Component extensions use `await editor.component.query(...)` and the methods declared on the returned proxy. Read the linked declarations for exact input and output fields.

- 玩家要求在面前挖河或溪流时，使用 `tools.water.digRiver` 同时生成河床和原生河流水面。没有指定尺寸或距离时传 `{}`。以外层 execute 提交回执确认成功，无运行错误即可回复。
- 玩家要求在面前建房时，从 `project.json` 读取当前场景路径，在同一次 execute 内解析落点、创建根节点并挂载 `HouseComponent`。组件自带默认房型和屋顶，须绑定场景已装载的建筑套件。使用落点的 X/Z，建筑系统会计算贴地高度。

  ```js
  const target = await tools.spatial.resolve({
    anchor: { kind: "viewer" },
    relation: { kind: "front" },
    placement: { snapTo: "terrain", avoidWater: true }
  });
  const point = target.anchor;
  if (point.kind !== "position") throw new Error("Expected a resolved world position");
  const house = await editor.entity.create({ scene, name: "小房子", position: [point.x, 0, point.z] });
  await editor.component.add({
    scene, entityId: house.id, type: "HouseComponent",
    props: { assets: { $ref: "Building/Units/building-kit.prefab" } }
  });
  ```

When the scene exposes component authoring, the relevant guides include system-owned component usage knowledge for the available components. Discover exact fields, units, scope and constraints through `world.parameters.describe`, then inspect the actual target before proposing edits. System guides explain how capabilities relate; they do not supply fixed mood presets or override the current schema, authorization or runtime checks.

- [Object Query and Management](object-management/README.md)
- [Space and Placement](spatial/README.md)
- [Time and Seasons](time/README.md)
- [Atmosphere](atmosphere/README.md)
- [Terrain](terrain/README.md)
- [Water](water/README.md)
- [Vegetation](vegetation/README.md)
- [Animals](animals/README.md)
