---
name: vegetation
description: 创建、移动或调整树木、灌木、草和花时使用。
---

# 植被

## 选择操作

从接口索引中选择：

- 创建植物：用 `vegetation.create`。数量和范围要符合请求。
- 移动作者植物：用 `vegetation.update` 的 `patch.target`。目标位置见 [spatial](skills/spatial/SKILL.md)。
- 修改树的外观：先用 `world.inspect` 读取当前值和共享效果，再用 `vegetation.update` 的共享外观操作。这个操作可能影响使用相同效果的其他树。
- 修改区域植被或规划参数：用[规划参数](skills/world-objects/parameters/SKILL.md)。
- 查找或删除植物：用 [world-objects](skills/world-objects/SKILL.md)。

## 选择引用

历史记录能确定目标植物时，复用创建或修改结果中的 `assetRef`，也可以复用查询结果的 `ref`。需要当前详情时，用这个引用调用 `world.inspect`。身份不明确时，用 `world.query` 查找。

`world.query` 返回资产投影，含 `type`、`ref`，以及可选的 `position`、`bounds`、`tags`、`relations`。详细属性用 `world.inspect` 读取。查询结果不保证有 `name` 字段。

执行要求特定 kind 或 source 的操作前，先检查 `ref.kind` 和 `ref.source`。查询过滤只筛选运行结果，不会缩小声明的联合类型。保留返回的引用，不要构造字段被放宽成 string 的变量，也不要使用类型断言。

修改位置和种子要求是作者植被。自然树支持声明的共享外观操作。修改重试次数或使用 `any` 都不能改变这个限制。

## 检查结果

返回判断请求所需的修改字段。`resolvedEffect` 提供了实际目标位置时，也要返回。用修改结果和最终的 execute 回执判断是否完成。缺少必要证据或证据与请求冲突时，查询同一个 `assetRef`。

对象不在当前画面中，不能证明修改失败。

## 区域植被与规划参数

用[规划参数](skills/world-objects/parameters/SKILL.md)。单株植物的请求不要修改全局物种参数。

`world.query` 返回已发布的原生树和花区，其中 `proceduralAssetId` 和 `planningEntityId` 指向参数所有者。林下实例是流式生成的派生结果，不是单独的作者对象，要修改它们所在区域的生态或花参数。相机驻留的数量不是保存的种群数量。

## 接口索引

<!-- API_INDEX: generated from executable contracts at load time. -->

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->
