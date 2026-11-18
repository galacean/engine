# 约束实现索引

当前规则见 [CONSTRAINT_POLICY.md](CONSTRAINT_POLICY.md) 与 [接入说明](README.md)。旧村庄约束审计已不适用于当前生成链，可从 Git 历史追溯。

- 关系声明：`layout/LayoutRules.ts`。
- OBB / 高度 / 宽相索引：`layout/Volumes.ts`。
- 固定邻居与局部协调：`layout/LayoutKernel.ts`。
- 最终关系校验与请求/实际诊断：`layout/SpatialWorld.ts`。
- 路网：最终体量之后消费接入点，不反向否决布局。
- `WorldSettlementPlanner.ts` 仅为旧 recipe 调用入口的兼容适配。

算法预算、初始分布、可调区间、数据合法性与空间硬规则分开。新的上层规则不得自行加入整图 veto。
