# 连接

已知关系由生成器输出：

- 墙 top → 屋顶 base（wallRoofJoint）
- 台基 top → 墙 base（foundationContact）
- 挂件 mount → 主面 surface（opening/mount）

关系端点必须是存在的基础构件，不能只有规则名。

## 派生连接

欧式墙交叉在设计阶段产生交界 Path 和预留范围，墙缝通过 wallStitches 注册算法铺设砖和梁。

平顶与坡顶交接产生水平 Path，由 roofMerlons 注册算法铺设收口。两者使用同一个铺设调度入口。预览需要的收口只执行一次，细节复用其结果。

石拱和木拱也由开口几何得到基准 Path，再通过 stoneArchCourses 和 woodArchMembers 铺设拱砖、木框和柱。设计负责开洞和冲突判断，铺设阶段不重新裁墙。

基础几何和派生状态分离。移走邻居后，派生连接自然消失。

## 自定义规则

`buildingConnectionRules.register(name,({parts,relation})=>derivedParts)` 扩展自定义关系。它可以修改工作副本，并返回派生构件（localId、selection、group、type、support、algorithm、unit、params，不含作者 id）。原始对象不变。未知规则和不匹配的 support 类型会报错，不会静默回退。

派生身份由当前关系和 localId 共同确定，和作者 ID 分开。selection 必须明确选择真实的作者 group 或 part。返回的连接构件使用可铺设的 Point、Path、Mesh support。原生 profile 主体在基础草案中定义。派生结果不写回作者 parts 或存档。

## 验收

检查多个视角、窗口范围、墙角和屋檐，并验证移动、分离和删除。数值或截图验收要给出具体的案例范围。一种形状通过，不能推导为任意建筑都能自动连接。

预检时查看 `designBuilding(...)` 返回的 `diagnostics`。管理器生成遇到跨墙角、宿主被切除等安装失败时，会拒绝候选，并通过 `errors()` 报告。旧的可见结果可能仍被保留，所以 `manager.diagnostics()` 的已发布结果不能证明本次成功。

验收窗体时，必须检查非空的洞口和窗体输出，不能只比较两张都没生成窗户的图片。窗门资产由 Unit 的 `nativeAttachment` 选择，使用 `mountAttachment` 算法。
