---
name: seed-world-lod
description: 使用 Blender 制作 Seed World 静态 GLB 的 LOD，做同机位资产验收，并在真实 Seed Demo 中采集出生点 360° 对照、标记画面差异和统计岩石三角面。适用于岩石类 LOD 制作、调参和回归验收。
---

# Seed World LOD 制作与验收

- **制作资产**时读 [资产制作与对照](../../../world/scripts/acceptance/seed-world-lod/references/asset-lod.md)。生成多个减面候选，按实际换档尺寸比较轮廓、岩面着色与面数。遇到着色变化，先排查 UV、法线、切线和材质，再评估减面比例。
- **验收 Seed Demo** 时读 [出生点环拍](../../../world/scripts/acceptance/seed-world-lod/references/spawn-review.md)。在真实模板里以相同 seed、开场机位和画面设置比较强制 LOD0 与自动 LOD，区分岩石三角面、可见提交和整帧性能。
- 按用户任务选择其中一项或两项。新产物和原图保存到独立输出目录。接入资源、改生产参数或发布需要用户任务包含对应动作。采集脚本通过浏览器会话临时接入，报告脚本独立处理截图和测量数据。
