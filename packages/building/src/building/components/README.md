# 建筑编辑与存档边界

当前建筑身份由 `parts/architecture/BuildingGroupComponent` 与 `BuildingPartComponent` 分别拥有；公共生成、设计、铺设和运行入口见 [建筑系统](../parts/README.md)。

本目录保留当前生成组件、Prefab 身份及放置工具。`BuildingPlacement` 操作建筑构件。

Seed World 使用 v8-groups 存档键，只加载该版本。

编辑器从完整作者数据选择删除目标，包含禁用构件及隐藏节点；删除与连接清理限定同一原生实例，通过现有 Scene 事务完成。Manager 的注册集合只表示原生启用的组件；作者查询和 Entity 删除直接检查原生对象，包含隐藏与禁用对象。构建按启用 Group 筛选构件，作者归属不随启停改变。
