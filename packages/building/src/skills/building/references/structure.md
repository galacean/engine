# 结构与自定义构件

独立墙条和栅栏用 `Building.European.buildWall` 和 `buildFence`，参数是 `id`、`length`、`depth`、`height`、`center`、`rotation`（弧度）和可选 `style`。台阶用 `Building.European.buildSteps`，参数是 `id`、`width`、`rise`、`run`、`count`（1..1000 整数）。静态网格会合批，不要逐块为砖瓦实例化对象。

## 常用欧式子生成器速查（直接用于 `tools.building.generate`）

内置建筑资产库固定为 `Building/Units/building-kit.prefab`，无需读 `project.json` 或 `glob`/`grep` `declare/engine/` 翻内部源码；组合院落/多构件可在**同一次 `execute`** 中连续调用 `tools.building.generate` + `editor.asset.create` + `editor.entity.create` 完成：

| `generator` | 常用 `parameters` 必填/关键字段 | 说明 |
| --- | --- | --- |
| `European.buildTower` | `{ id, seed?, height?: 10, circle?: { center: [0,0], radius: 2.5, phase: 0 }, wallColor?, roof?, attachments? }` | 默认圆形高塔（高 10m、半径 2.5m），支持 `wallColor` / `roof` / `attachments` |
| `European.buildWall` | `{ id, seed?, length, depth, height, center?: [0,0], rotation?: 0 }` | 独立石墙条；**不支持** `wallColor` 或 `attachments`（需留院门开口时分两段墙留空，或放带 `kind:"opening"` 的小型 `buildHouses` 门楼） |
| `European.buildFence` | `{ id, seed?, length, depth, height, center?: [0,0], rotation?: 0 }` | 独立木栅栏条；参数结构同 `buildWall` |
| `European.buildSteps` | `{ id, width, rise, run, count }` | 石台阶；`width`/`rise`/`run` 为正数米，`count` 为阶数整数 |

欧式墙体和屋顶共享组的刚性水平坐标。要移动整组，或编辑几何参数。挂件不能单独移动节点，改它的 `u`、`bottom` 或 `uv`。

## 自定义构件

不经过欧式生成器时，直接写草稿构件：

- 几何用生成器 `elements`，在 `params.elements` 里写点和曲面。线写成带状曲面（`ribbon`）。
- 铺设算法用已注册的名称：点上每点一个单元（`placeAtPoints`），沿线（`alongCurves`），在曲面上按网格（`surfaceGrid`），整面覆盖（`coverSurfaces`）。
- Unit 写资产名（`source`）、包围盒和允许伸缩的范围。算法只在范围内伸缩单元，超出范围会报错。

只能使用已注册的生成器、算法和连接规则。自定义构件之间没有自动的开洞和收口，不要宣称任意形状都能自动相交。
