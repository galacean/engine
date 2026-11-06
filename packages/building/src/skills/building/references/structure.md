# 结构与线性排列

柱列和栏杆可以用 path + alongPath + Prefab。单个路灯可以用 point + placeAtPoint + Prefab。组合 Prefab 保留节点层级，但 Unit 内不能递归包含 BuildingPartComponent。

台阶调用公共的 buildSteps 或 `Building.European.buildSteps`，参数是 width、rise、run、count，算法是 stepCourses。静态网格会合批，脚本和灯光对象保留实体语义。不要逐块为砖瓦实例化对象。

欧式墙体和屋顶等结构 profile 共享组的刚性水平坐标。要移动整组，或编辑几何参数。墙上的 Point 附件可以单独平移节点，设计阶段根据宿主计算安装位置。UV 附件要编辑它的 support 坐标。任意 Mesh、Path、Point 构件走通用摆放，独立曲面连接需要对应的求解器。
