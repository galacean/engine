---
name: terrain
description: 创建或修改山丘、峡谷等地貌，或局部调整地面高度时使用。
---

# 地形

创建或修改前，先选定语义地貌类型。`terrain.patch` 只改变局部地面高度，不创建独立资产。

查询已有资产见 [world-objects](skills/world-objects/SKILL.md)，解析落点见 [spatial](skills/spatial/SKILL.md)。不要假设支持任意平整或跨系统事务。

## 接口索引

<!-- API_INDEX: generated from executable contracts at load time. -->

## 高度幅度

程序化地貌的 `elevationDelta` 是形状幅度，单位为米，相对于编辑前的地形。它不是实测的峰值抬升，也不是绝对海拔。不对称、粗糙度、侵蚀和网格采样都可能降低实测峰值。

读回这个参数只能确认幅度。验证实际几何要用地形高度采样，不要把幅度报告为实测高度。已保存的幅度保持原有的几何语义。
