# 结构与线性排列

柱列/栏杆可使用 path + alongPath + Prefab；单个路灯可使用 point + placeAtPoint + Prefab。组合 Prefab 保留节点层级，但 Unit 内不能递归包含 BuildingPartComponent。

台阶调用公共 buildSteps 或 Building.European.buildSteps，参数 width/rise/run/count，算法 stepCourses。静态网格合批，脚本/灯光对象保留实体语义。不要逐砖瓦实例化对象。

欧式墙体/屋顶等结构 profile 共享组刚性水平坐标；移动整组或编辑几何参数。墙上的 Point 附件可单独平移节点，设计阶段根据宿主计算安装位置；UV 附件则编辑其 support 坐标。任意 Mesh/Path/Point 构件走通用摆放，独立曲面连接需要对应求解器。
