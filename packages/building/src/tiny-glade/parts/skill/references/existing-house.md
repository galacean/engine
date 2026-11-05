# 欧式建筑与现有存档

当前入口 `/demos/building-components/recursive.html` 使用 Building.European → 平铺 BuildingPartComponent → 设计 → 实施 → 实例渲染。

Seed World 的初始生成、三份内置 Prefab 和编辑面板都使用新版构件。存档键为 v7-groups，不读取或迁移旧版本。Worker、局部重建、LOD 驻留与地形事务由 BuildingRuntime 处理，原生对象 Unit 在主线程执行并共用发布生命周期。

保留当前几何/铺设算法、资产与着色器的外观契约。架构迁移期间的旧版基准、比较入口和临时审查产物已经删除，不再要求 Agent 执行新旧对照。测试直接验证当前接口的生成、编辑、保存、取消与资源释放；旧存档迁移代码和夹具已删除。
