# 墙和开口

## 墙上的挂件

欧式生成器通过 `attachments` 指定门、窗、灯和拱，每个挂件是一个独立构件，依附所在的墙。挂件写 `id`、`kind`、`type`、`rank`（规格，从 1 开始的整数）和位置。`kind` 只能是 `window`、`door`、`wall-lamp`、`lantern`、`opening`、`hatch`。

可用的规格由资源包决定：

- `wall-lantern`、`hatch-cottage`、`hatch-gothic`、`roof-lantern` 只有 1。
- `dormer-arrow-slit-half` 只有 2 和 3。
- 其他类型有 1、2、3。`dormer-cottage` 的规格是并排的窗数。

资源包里没有的规格报 `Unknown asset {"prefab":"<type>/<rank>"}`。

位置的写法：

- `u` 是 `[0, 1)` 的周向参数，不是米。
- `bottom`、`width`、`height` 的单位是米。

### 周向参数 `u` 与墙面朝向对照

- **矩形轮廓**（`rectangle: { center, size: [W, D], rotation: 0 }`，周长 `P = 2 * (W + D)`）：
  - **Face 0（`-X` 侧，长 `D`）**：`u ∈ [0, D/P]`，中点 `0.5 * D / P`
  - **Face 1（`+Z` 侧，长 `W`）**：`u ∈ [D/P, (D+W)/P]`，中点 `(D + 0.5 * W) / P`（默认主门面；当玩家面朝 `-Z` 且房屋在玩家前方时，`+Z` 墙面正朝向玩家）
  - **Face 2（`+X` 侧，长 `D`）**：`u ∈ [(D+W)/P, (2D+W)/P]`，中点 `(1.5 * D + W) / P`
  - **Face 3（`-Z` 侧，长 `W`）**：`u ∈ [(2D+W)/P, 1)`，中点 `(2 * D + 1.5 * W) / P`
- **圆形轮廓**（`circle` with `phase: 0`）：`u = 0` 位于 `+X`，从 `+Y` 俯视随 `u` 增大逆时针绕行（`0.25 → -Z`，`0.5 → -X`，`0.75 → +Z`）。
- 若要整体旋转房屋正门朝向，修改 `editor.entity.create` 的 `rotation: [0, yawDeg, 0]` 或 `rectangle.rotation`。

可用的类型：`window-cottage`、`door-cottage`、`wall-lantern`、`window-gothic`、`door-gothic`、`window-arrow-slit`、转角窗 `window-cottage-corner`、半老虎窗 `dormer-cottage-half`、`dormer-gothic-half`、`dormer-arrow-slit-half`。`kind: "opening"` 是拱，`bottom` 必须为 0。

- 洞口由预制件的占位形状算出，墙砖、腰线和抹灰都避开洞口。不要另存洞口。
- `frameMaterial: "wall"` 用墙的石材画窗框，只有 Gothic 窗、箭缝窗、Gothic 老虎窗，以及 Gothic 和箭缝半老虎窗支持。其他类型报错。
- 挂件不能单独移动节点。要移动挂件，修改它的 `u` 或 `bottom`。

## 转角窗和半老虎窗

- 转角窗站在两面墙的墙角，同时打开两面墙。`u` 指向墙角附近。
- 半老虎窗立在墙顶、穿过屋檐，同时打开墙和屋面，并带一个小屋顶。只能用在坡屋顶上。

## 木墙

`wallStructure: "timber"` 生成木墙，墙板用 `wooden_plank`。木墙上的拱是木框。
