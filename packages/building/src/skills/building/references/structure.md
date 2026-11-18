# 结构与自定义构件

独立墙条和栅栏用 `Building.European.buildWall` 和 `buildFence`，参数是 id、length、depth、height、center、rotation 和 style。台阶用 `Building.European.buildSteps`，参数是 width、rise、run、count。静态网格会合批，不要逐块为砖瓦实例化对象。

欧式墙体和屋顶共享组的刚性水平坐标。要移动整组，或编辑几何参数。挂件不能单独移动节点，改它的 `u`、`bottom` 或 `uv`。

## 自定义构件

不经过欧式生成器时，直接写草稿构件：

- 几何用生成器 `elements`，在 `params.elements` 里写点和曲面。线写成带状曲面（`ribbon`）。
- 铺设算法用已注册的名称：点上每点一个单元（`placeAtPoints`），沿线（`alongCurves`），在曲面上按网格（`surfaceGrid`），整面覆盖（`coverSurfaces`）。
- Unit 写资产名（`source`）、包围盒和允许伸缩的范围。算法只在范围内伸缩单元，超出范围会报错。

只能使用已注册的生成器、算法和连接规则。自定义构件之间没有自动的开洞和收口，不要宣称任意形状都能自动相交。
