# 连接

已知关系由生成器输出：墙 top → 屋顶 base（wallRoofJoint），台基 top → 墙 base（foundationContact），挂件 mount → 主面 surface（opening/mount）。关系端点必须是存在的基础构件，不能只有规则名。

欧式墙交叉在设计阶段产生交界 Path 和预留范围，墙缝通过 wallStitches 注册算法铺设砖/梁。平顶与坡顶交接产生水平 Path，由 roofMerlons 注册算法铺设收口。两者使用同一个铺设调度入口，预览所需的收口只执行一次，细节复用其结果。石拱和木拱也由开口几何得到基准 Path，再通过 stoneArchCourses / woodArchMembers 铺设拱砖、木框和柱；设计负责开洞与冲突判断，铺设阶段不重新裁墙。基础几何与派生状态分离，移走邻居后派生连接自然消失。

buildingConnectionRules.register(name,({parts,relation})=>derivedParts) 扩展自定义关系，可修改工作副本并返回派生构件（localId、selection、group、type、support、algorithm、unit、params；不含作者 id）。原始对象不变。未知规则及不匹配 support 类型报错，没有静默填充 fallback。

检查多视角、窗口范围、墙角和屋檐，验证移动/分离/删除。数值或截图验收应给出具体案例范围；不能把一种形状通过推导为任意建筑自动连接。

预检时查看 `designBuilding(...)` 返回的 `diagnostics`。管理器生成遇到跨墙角、宿主被切除等安装失败会拒绝候选，并通过 `errors()` 报告；旧可见结果可能仍被保留，不能把 `manager.diagnostics()` 的已发布结果当作本次成功证明。验收窗体时必须检查非空洞口/窗体输出；不能只比较两张都没生成窗户的图片。窗门资产由 Unit 的 `nativeAttachment` 选择，使用 `mountAttachment` 算法。

派生身份由当前关系和 localId 共同确定，和作者 ID 分开。selection 必须明确选择真实作者 group 或 part。返回的连接构件使用可铺设的 Point/Path/Mesh support；原生 profile 主体在基础草案中定义。派生结果不写回作者 parts 或存档。
