# 屋顶

## 欧式屋顶

`roof` 参数决定屋顶形状，见[流程](planning.md)。坡屋顶每个坡面是一个构件，坡面之间的斜脊和屋脊由连接规则派生。圆形房屋是圆锥屋顶。`roof.height` 为 0 时是平屋顶：一个屋面构件，`flat_rim` 为 0 时四周有女儿墙和城垛。圆屋顶和收成方顶的四坡屋顶自动加尖顶。

瓦片颜色用 `roof.color`（整数 0–12）。改颜色不改变放置和身份。

## 老虎窗和屋顶挂件

屋顶挂件写在 `attachments` 中，`host: "roof"` 或给出 `uv`。`uv` 是房屋轮廓外接矩形内的位置，`bottom`、`width`、`height` 的单位是米。

| 类型 | 屋顶 | 说明 |
| --- | --- | --- |
| `dormer-gothic` | 坡屋顶、圆锥 | 窗体加一个尖拱形小屋顶和屋脊 |
| `dormer-cottage` | 坡屋顶 | 一到三个窗体并排，上面一个单坡小屋顶 |
| `hatch-cottage`、`hatch-gothic` | 平屋顶 | 活板门，在屋面上开洞 |
| `roof-lantern` | 平屋顶 | 屋顶灯，不开洞 |

- 只给 kind 时：平屋顶上的窗和活板门是 `hatch-cottage`，灯是 `roof-lantern`；坡屋顶上的窗是 `dormer-cottage`。坡屋顶上放活板门或灯会报错。
- 老虎窗从所在坡面切掉占地，小屋顶用宿主屋顶的瓦片铺设。小屋顶属于老虎窗，不另存。
- 老虎窗要能落在一个坡面上。跨出坡面边缘报错 `The dormer crosses an edge of its roof`，小屋顶碰不到屋面报错 `The dormer reaches above its roof`。
- 半老虎窗立在墙上、穿过屋檐，见[墙](wall.md)。
