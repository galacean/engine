---
name: terrain
description: 创建、查询、修改或删除山丘、峡谷、岩石/石头等地貌资产，局部调整地面高度或地形配置时使用。
---

# 地形

创建或修改前，先选定语义地貌类型。`terrain.patch` 只改变局部地面高度，不创建独立资产。

- 查询、查看详情与删除已有地形地貌或岩石：直接用 `terrain.query`、`terrain.inspect`、`terrain.delete`。**删除能力边界**：自然岩石（`kind: "rock"`）与作者创建的地形地貌支持 `terrain.delete` 删除；**自然生成的地貌与自然河道（`source: "natural"`，如天然山体、峡谷、自然河道）不支持通过 `terrain.delete` 直接删除**——当用户询问能否删自然地貌/河道时直接明确答复不支持并解释原因即可，无需调用 `terrain.delete` 试错、拍 `snapshot` 或查场景节点列表。
- 树脚散落的伴生石块（如 `pick` 命中的 `InstancedBatch:rock-*` 且无 `instanceKey`）属于自然植被伴生层，不在 `terrain.query` 独立岩石目录内，整体密度由 `vegetation.config` 的 `companionStoneDensity` 控制。
- 读写地形骨架、缓坡、岩石配色与离岛规划参数：用 `terrain.config.get`、`terrain.config.update`、`terrain.config.reset`。
- **岩石改色边界**：程序化岩石/石头没有单块独立材质或场景材质组件（不要去查场景节点、组件或运行时对象，不要读原生编辑 API），不支持只改单块岩石的颜色。岩石配色属于全局 `terrain.config` 共享参数，会影响全图岩石；若用户要求只改某块岩石/石头颜色，不要修改全局 `terrain.config`，也无需预先查询岩石列表、读取 `terrain.config.get` 或搜索模型，直接如实说明不支持单块改色并询问是否同意统一调整全图岩石配色。
- 解析空间落点见 [spatial](skills/spatial/SKILL.md)。不要假设支持任意平整或跨系统事务。

## 接口索引

<!-- API_INDEX: generated from executable contracts at load time. -->

<!-- ASSET_TYPES: generated from inspectable asset declarations at load time. -->

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->

## 高度幅度

程序化地貌的 `elevationDelta` 是形状幅度，单位为米，相对于编辑前的地形。它不是实测的峰值抬升，也不是绝对海拔。不对称、粗糙度、侵蚀和网格采样都可能降低实测峰值。

读回这个参数只能确认幅度。验证实际几何要用地形高度采样，不要把幅度报告为实测高度。已保存的幅度保持原有的几何语义。
