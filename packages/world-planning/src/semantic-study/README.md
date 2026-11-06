# 空间规划实现与历史组合研究

当前产品入口与运行说明见 [规划器 README](../README.md)，参数架构和协作边界见 [空间框架](../spatial/README.md)。本目录原入口 `semantic-study/index.html` 兼容旧书签，加载同一个 `../main.ts` 应用，不再维护独立 POI 编辑器。

本目录保留陆域、POI、地貌、道路和景观生成模块；作者参数、事务和素材适配由 `spatial/` 统一组织。旧图片图示 `PlanningPoiArt` 与闲置图标已移除；当前地图表现以实际视图实现为准。

历史组合研究的数据职责：

- `data/` 保存 C01–C05 的结构化定义与负例；它们是可重复测试的输入。
- `reference-data/` 保存五份提取轮廓，供 `build-utils.mjs` 与 `build-C01…C05.mjs` 重建定义。
- `StudyCompiler`、`StudyAudit` 等保留编译、关系检查和测量能力；不把有限样本通过写成全图布局或审美保证。
- [POI 实验记录](POI_EXPERIMENT.md) 和 [组合验证清单](../大世界组合验证清单.md) 仅描述对应历史阶段。

历史截图、导出报告、AI 原图和 `evidence/` 已从工作树清理，已提交记录可从 Git 历史追溯。本次删除不改写 Git 历史，也不将这些旧产物作为当前版本验收。
